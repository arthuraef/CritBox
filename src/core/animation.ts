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

  // Construção de trajetória realista por waypoints (quiques):
  // O dado começa no centro [0, 0] (ou initX, initZ), é arremessado com força contra
  // uma das margens, ricocheteia nos primeiros quiques e, nos arcos finais com menos energia,
  // desacelera naturalmente convergindo em direção ao centro [0, 0].
  interface Waypoint {
    timeMs: number;
    x: number;
    z: number;
  }

  // Gera pontos-chave realistas:
  // t=0: largada em initX, initZ
  // t=impact 1: primeira colisão forte perto de uma das bordas
  // t=impact 2: ricochete em direção ao meio/outra borda
  // t=impact 3: desaceleração se aproximando do centro
  // t=settle/fim: rola suavemente até repousar no centro [0, 0]
  const initX = input.startPosition ? input.startPosition[0] : 0;
  const initZ = input.startPosition ? input.startPosition[1] : 0;

  const waypoints: Waypoint[] = [];
  waypoints.push({ timeMs: 0, x: initX, z: initZ });

  if (bounds) {
    // Escolhe uma direção de arremesso vigorosa
    const throwAngle = random() * 2 * Math.PI;
    // Ponto de impacto 1: atinge próximo às margens da tela (85% a 95% do limite)
    const marginFactor1 = 0.82 + random() * 0.15;
    const boundRadiusX = Math.abs(bounds.maxX);
    const boundRadiusZ = Math.abs(bounds.maxZ);
    const targetX1 = Math.cos(throwAngle) * boundRadiusX * marginFactor1;
    const targetZ1 = Math.sin(throwAngle) * boundRadiusZ * marginFactor1;
    const t1 = impactsMs[0] ?? (durationMs * 0.3);
    waypoints.push({ timeMs: t1, x: targetX1, z: targetZ1 });

    // Ponto de impacto 2: rebate na parede com ângulo de reflexão + desvio aleatório
    // e viaja cruzando a mesa
    const reboundAngle = throwAngle + Math.PI + (random() - 0.5) * 1.0;
    const marginFactor2 = 0.45 + random() * 0.25;
    const targetX2 = Math.cos(reboundAngle) * boundRadiusX * marginFactor2;
    const targetZ2 = Math.sin(reboundAngle) * boundRadiusZ * marginFactor2;
    const t2 = impactsMs[1] ?? (durationMs * 0.55);
    waypoints.push({ timeMs: t2, x: targetX2, z: targetZ2 });

    // Ponto de impacto 3: perdeu energia, quica curto já perto do centro
    const angle3 = reboundAngle + (random() - 0.5) * 1.2;
    const dist3 = 0.2 + random() * 0.25;
    const targetX3 = Math.cos(angle3) * dist3;
    const targetZ3 = Math.sin(angle3) * dist3;
    const t3 = impactsMs[2] ?? settleStartMs;
    waypoints.push({ timeMs: t3, x: targetX3, z: targetZ3 });

    // Fim da rolagem: desliza até o centro exato [0, 0]
    waypoints.push({ timeMs: durationMs, x: 0, z: 0 });
  } else {
    // Sem bounds: deriva sutil até o centro
    const driftAngle = random() * 2 * Math.PI;
    const dist = 0.5 + random() * 0.5;
    waypoints.push({ timeMs: durationMs * 0.4, x: Math.cos(driftAngle) * dist, z: Math.sin(driftAngle) * dist });
    waypoints.push({ timeMs: durationMs, x: 0, z: 0 });
  }

  function heightAt(tMs: number): number {
    for (const arc of arcs) {
      if (tMs <= arc.startMs + arc.durationMs) {
        const s = (tMs - arc.startMs) / arc.durationMs;
        return 4 * arc.height * s * (1 - s);
      }
    }
    return 0; // repouso
  }

  // Interpolação suave (Catmull-Rom / Hermite) entre os waypoints para movimento contínuo e orgânico
  function positionAt(tMs: number): [number, number] {
    const t = Math.min(Math.max(tMs, 0), durationMs);
    if (t >= durationMs) return [0, 0];

    // Encontra o segmento de waypoints ativo
    let idx = 0;
    while (idx < waypoints.length - 1 && waypoints[idx + 1].timeMs < t) {
      idx++;
    }
    const p0 = waypoints[Math.max(idx - 1, 0)];
    const p1 = waypoints[idx];
    const p2 = waypoints[Math.min(idx + 1, waypoints.length - 1)];
    const p3 = waypoints[Math.min(idx + 2, waypoints.length - 1)];

    const segDuration = p2.timeMs - p1.timeMs;
    if (segDuration <= 1e-4) return [p2.x, p2.z];

    const u = (t - p1.timeMs) / segDuration;
    // Interpolação cúbica suave (Hermite / Smoothstep composto)
    const s = u * u * (3 - 2 * u);

    // Tangentes aproximadas para continuidade da velocidade (sem quinas artificiais)
    const tx1 = (p2.x - p0.x) * 0.5;
    const tz1 = (p2.z - p0.z) * 0.5;
    const tx2 = (p3.x - p1.x) * 0.5;
    const tz2 = (p3.z - p1.z) * 0.5;

    // Hermite Spline
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;

    const x = h00 * p1.x + h10 * tx1 + h01 * p2.x + h11 * tx2;
    const z = h00 * p1.z + h10 * tz1 + h01 * p2.z + h11 * tz2;

    const cleanX = Object.is(x, -0) || Math.abs(x) < 1e-9 ? 0 : x;
    const cleanZ = Object.is(z, -0) || Math.abs(z) < 1e-9 ? 0 : z;
    return [cleanX, cleanZ];
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
