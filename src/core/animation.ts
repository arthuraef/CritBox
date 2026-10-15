/**
 * Animação do lançamento como função pura do tempo.
 *
 * O plano recebe a orientação final já decidida (a que mostra a face sorteada)
 * e produz a trajetória até ela. A orientação em t = duração é exatamente a
 * orientação-alvo por construção: o giro extra decai a zero junto com a
 * interpolação. Nada aqui influencia o resultado.
 *
 * Unidades: a altura é em "raios do dado"; o tempo é em milissegundos.
 */

import {
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  quatSlerp,
  type Quat,
  type Vec3,
} from './d20.ts';

export interface PlayfieldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface RollPlanInput {
  /** Orientação do dado no início do lançamento. */
  readonly start: Quat;
  /** Orientação final (face sorteada para cima). */
  readonly target: Quat;
  /** Fonte visual em [0, 1); separada da que decide o resultado. */
  readonly random: () => number;
  /** Altura do primeiro arco, em raios do dado. Padrão 1,6. */
  readonly throwHeight?: number;
  /** Limites da tela para colisão nas margens (opcional). */
  readonly bounds?: PlayfieldBounds;
  /** Posição inicial do dado em repouso (opcional). */
  readonly startPosition?: readonly [number, number];
}

export interface DicePose {
  /** Deslocamento em relação à posição de repouso: x, altura acima do apoio, z. */
  readonly position: Vec3;
  readonly orientation: Quat;
  /** Verdadeiro quando a animação terminou (t >= duração). */
  readonly done: boolean;
}

export interface RollPlan {
  readonly durationMs: number;
  /** Instantes (ms) em que o dado toca a mesa ou parede, em ordem crescente. Útil para o som. */
  readonly impactsMs: readonly number[];
  /** Instante (ms) em que cessa o último quique e começa o repouso. */
  readonly settleStartMs: number;
  /** Pose no instante `tMs` (limitado a [0, duração]). */
  pose(tMs: number): DicePose;
}

const BOUNCE_DECAY = 0.38; // cada arco tem 38% da altura do anterior
const ARC_COUNT = 4;
const FIRST_ARC_MS = 520;
const SETTLE_MS = 320;

function easeOutCubic(u: number): number {
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

/** Reflete uma coordenada dentro de [min, max] como colisão elástica com as bordas. */
export function bounceCoordinate(val: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 1e-6) return min;
  let offset = (val - min) % (2 * span);
  if (offset < 0) offset += 2 * span;
  if (offset > span) {
    return max - (offset - span);
  }
  return min + offset;
}

export function planRoll(input: RollPlanInput): RollPlan {
  const { start, target, random, bounds } = input;
  const firstHeight = input.throwHeight ?? 1.6;

  // Arcos de quique com altura e duração decrescentes.
  const arcs: { startMs: number; durationMs: number; height: number }[] = [];
  let cursor = 0;
  let height = firstHeight;
  for (let i = 0; i < ARC_COUNT; i++) {
    const durationMs = FIRST_ARC_MS * Math.sqrt(height / firstHeight);
    arcs.push({ startMs: cursor, durationMs, height });
    cursor += durationMs;
    height *= BOUNCE_DECAY;
  }
  const settleStartMs = cursor;
  const durationMs = settleStartMs + SETTLE_MS;
  const impactsMs = arcs.map((a) => a.startMs + a.durationMs);

  // Parâmetros visuais (consomem só a fonte visual).
  const axisRaw: Vec3 = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
  const axis: Vec3 =
    Math.hypot(axisRaw[0], axisRaw[1], axisRaw[2]) < 1e-6 ? [1, 0, 0] : axisRaw;
  const spinTurns = 3 + random() * 2; // 3 a 5 voltas, decaindo a zero
  const spinAngle = spinTurns * 2 * Math.PI * (random() < 0.5 ? -1 : 1);

  // Movimento de translação pela tela com velocidade e ricochete nas margens
  const travelAngle = random() * 2 * Math.PI;
  // Distância e velocidade do lançamento pelo tabuleiro
  const travelSpeed = bounds ? (bounds.maxX - bounds.minX) * (2.0 + random() * 1.5) : (1.0 + random() * 0.8);
  const velX = Math.cos(travelAngle) * travelSpeed;
  const velZ = Math.sin(travelAngle) * travelSpeed;
  const initX = input.startPosition ? input.startPosition[0] : 0;
  const initZ = input.startPosition ? input.startPosition[1] : 0;

  function heightAt(tMs: number): number {
    for (const arc of arcs) {
      if (tMs <= arc.startMs + arc.durationMs) {
        const s = (tMs - arc.startMs) / arc.durationMs;
        return 4 * arc.height * s * (1 - s);
      }
    }
    return 0; // repouso
  }

  function positionAt(tMs: number): [number, number] {
    const u = Math.min(Math.max(tMs, 0), durationMs) / durationMs;
    // O dado viaja e ricocheteia pelas margens no início e meio da rolagem,
    // e nos últimos arcos de quique converge precisamente para o centro [0, 0].
    const progress = easeOutCubic(u);
    // envelope de atração ao centro: 1 no início/meio, decaindo a 0 no final
    const centerWeight = Math.pow(1 - u, 1.4);

    const rawX = initX * (1 - progress) + velX * progress;
    const rawZ = initZ * (1 - progress) + velZ * progress;

    if (!bounds) {
      const px = rawX * centerWeight;
      const pz = rawZ * centerWeight;
      return [Object.is(px, -0) || Math.abs(px) < 1e-12 ? 0 : px, Object.is(pz, -0) || Math.abs(pz) < 1e-12 ? 0 : pz];
    }

    const bx = bounceCoordinate(rawX, bounds.minX, bounds.maxX);
    const bz = bounceCoordinate(rawZ, bounds.minZ, bounds.maxZ);

    // Na fase final de acomodação (quiques baixos), o dado vai ao centro da tela
    const px = bx * centerWeight;
    const pz = bz * centerWeight;
    return [Object.is(px, -0) || Math.abs(px) < 1e-12 ? 0 : px, Object.is(pz, -0) || Math.abs(pz) < 1e-12 ? 0 : pz];
  }

  const finalPos: [number, number] = [0, 0];

  return {
    durationMs,
    impactsMs,
    settleStartMs,
    pose(tMs: number): DicePose {
      const t = Math.min(Math.max(tMs, 0), durationMs);
      const done = t >= durationMs;
      const u = t / durationMs;
      const e = easeOutCubic(u);

      const base = quatSlerp(start, target, e);
      const spin = quatFromAxisAngle(axis, spinAngle * (1 - e));
      const orientation = done ? target : quatNormalize(quatMultiply(spin, base));

      const [px, pz] = done ? finalPos : positionAt(t);
      return {
        position: [px, heightAt(t), pz],
        orientation,
        done,
      };
    },
  };
}
