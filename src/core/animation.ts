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

export interface RollPlanInput {
  /** Orientação do dado no início do lançamento. */
  readonly start: Quat;
  /** Orientação final (face sorteada para cima). */
  readonly target: Quat;
  /** Fonte visual em [0, 1); separada da que decide o resultado. */
  readonly random: () => number;
  /** Altura do primeiro arco, em raios do dado. Padrão 1,6. */
  readonly throwHeight?: number;
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
  /** Instantes (ms) em que o dado toca a mesa, em ordem crescente. Útil para o som. */
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

export function planRoll(input: RollPlanInput): RollPlan {
  const { start, target, random } = input;
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
  const driftAngle = random() * 2 * Math.PI;
  const driftRadius = 0.5 + random() * 0.5;
  const driftX = Math.cos(driftAngle) * driftRadius;
  const driftZ = Math.sin(driftAngle) * driftRadius;

  function heightAt(tMs: number): number {
    for (const arc of arcs) {
      if (tMs <= arc.startMs + arc.durationMs) {
        const s = (tMs - arc.startMs) / arc.durationMs;
        return 4 * arc.height * s * (1 - s);
      }
    }
    return 0; // repouso
  }

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

      const drift = 1 - easeOutCubic(Math.min(u * 1.15, 1)); // chega ao centro um pouco antes
      return {
        position: done ? [0, 0, 0] : [driftX * drift, heightAt(t), driftZ * drift],
        orientation,
        done,
      };
    },
  };
}
