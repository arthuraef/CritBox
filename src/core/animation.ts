/**
 * Animação do lançamento como função pura do tempo.
 *
 * O plano recebe a orientação final já decidida (a que mostra a face sorteada)
 * e produz a trajetória até ela. A orientação em t = duração é exatamente a
 * orientação-alvo por construção: o giro extra decai a zero junto com a
 * interpolação. Nada aqui influencia o resultado.
 *
 * Coreografia única cinematográfica inspirada em Baldur's Gate 3:
 * O dado é arremessado com energia, atinge a margem da tela onde ricocheteia,
 * quica na mesa e desacelera suavemente até repousar exatamente no centro [0, 0].
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
  /** Altura do primeiro arco, em raios do dado. Padrão 1,5. */
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

const BOUNCE_DECAY = 0.38; // Cada arco tem 38% da altura do anterior
const FIRST_ARC_MS = 480;  // Arremesso até a margem
const SECOND_ARC_MS = 320; // Ricochete da margem para a mesa
const THIRD_ARC_MS = 200;  // Quique curto de amortecimento
const SETTLE_MS = 280;     // Deslize final suave até o centro exato [0, 0]

const T1 = FIRST_ARC_MS;
const T2 = T1 + SECOND_ARC_MS;
const T3 = T2 + THIRD_ARC_MS;
const SETTLE_START_MS = T3;
const DURATION_MS = SETTLE_START_MS + SETTLE_MS;

const IMPACTS_MS = [T1, T2, T3] as const;

function easeOutCubic(u: number): number {
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

// Eixo de rotação dinâmico 3D (normalizado) da assinatura de rolagem BG3
const RAW_AXIS: Vec3 = [0.65, 0.72, -0.24];
const AXIS_LEN = Math.hypot(RAW_AXIS[0], RAW_AXIS[1], RAW_AXIS[2]);
const SPIN_AXIS: Vec3 = [RAW_AXIS[0] / AXIS_LEN, RAW_AXIS[1] / AXIS_LEN, RAW_AXIS[2] / AXIS_LEN];
const SPIN_ANGLE = 3.5 * 2 * Math.PI;

export function planRoll(input: RollPlanInput): RollPlan {
  const { start, target, bounds } = input;
  // Consome um valor da fonte visual para preservar compatibilidade de contrato
  input.random();

  const h0 = input.throwHeight ?? 1.5;
  const h1 = h0 * BOUNCE_DECAY;
  const h2 = h1 * BOUNCE_DECAY;

  // Limites da área jogável
  const effectiveBounds = bounds ?? { minX: -2.5, maxX: 2.5, minZ: -4.0, maxZ: 4.0 };

  // Pontos-chave da trajetória única:
  // p0: ponto de partida (posição anterior ou centro)
  // p1: colisão com a margem superior-direita da tela
  // p2: ricochete cruzando para o quadrante inferior-esquerdo
  // p3: quique próximo ao centro
  // p4: centro exato [0, 0] com velocidade zero
  const p0: readonly [number, number] = input.startPosition ? [input.startPosition[0], input.startPosition[1]] : [0, 0];
  const p1: readonly [number, number] = [effectiveBounds.maxX * 0.88, effectiveBounds.minZ * 0.72];
  const p2: readonly [number, number] = [effectiveBounds.minX * 0.50, effectiveBounds.maxZ * 0.40];
  const p3: readonly [number, number] = [effectiveBounds.maxX * 0.12, effectiveBounds.minZ * 0.10];

  function heightAt(t: number): number {
    if (t <= T1) {
      const s = t / T1;
      return 4 * h0 * s * (1 - s);
    }
    if (t <= T2) {
      const s = (t - T1) / SECOND_ARC_MS;
      return 4 * h1 * s * (1 - s);
    }
    if (t <= T3) {
      const s = (t - T2) / THIRD_ARC_MS;
      return 4 * h2 * s * (1 - s);
    }
    return 0; // Deslize no chão durante o settle
  }

  function positionAt(t: number): [number, number] {
    if (t <= 0) return [p0[0], p0[1]];
    if (t >= DURATION_MS) return [0, 0];

    let x = 0;
    let z = 0;

    if (t <= T1) {
      // Arremesso com impulsão vigorosa em direção à margem
      const u = t / T1;
      const s = u * (1.1 - 0.1 * u);
      x = p0[0] + (p1[0] - p0[0]) * s;
      z = p0[1] + (p1[1] - p0[1]) * s;
    } else if (t <= T2) {
      // Ricochete da margem para o outro lado
      const u = (t - T1) / SECOND_ARC_MS;
      const s = 1 - Math.pow(1 - u, 1.3);
      x = p1[0] + (p2[0] - p1[0]) * s;
      z = p1[1] + (p2[1] - p1[1]) * s;
    } else if (t <= T3) {
      // Quique curto direcionado para o centro
      const u = (t - T2) / THIRD_ARC_MS;
      const s = 1 - Math.pow(1 - u, 1.4);
      x = p2[0] + (p3[0] - p2[0]) * s;
      z = p2[1] + (p3[1] - p2[1]) * s;
    } else {
      // Desaceleração cúbica suave deslizando até [0, 0]
      const u = (t - T3) / SETTLE_MS;
      const s = easeOutCubic(u);
      x = p3[0] * (1 - s);
      z = p3[1] * (1 - s);
    }

    const cleanX = Object.is(x, -0) || Math.abs(x) < 1e-9 ? 0 : x;
    const cleanZ = Object.is(z, -0) || Math.abs(z) < 1e-9 ? 0 : z;
    return [cleanX, cleanZ];
  }

  return {
    durationMs: DURATION_MS,
    impactsMs: IMPACTS_MS,
    settleStartMs: SETTLE_START_MS,
    pose(tMs: number): DicePose {
      const t = Math.min(Math.max(tMs, 0), DURATION_MS);
      const done = t >= DURATION_MS;
      const u = t / DURATION_MS;
      const e = easeOutCubic(u);

      const base = quatSlerp(start, target, e);
      const spin = quatFromAxisAngle(SPIN_AXIS, SPIN_ANGLE * (1 - e));
      const orientation = done ? target : quatNormalize(quatMultiply(spin, base));

      const [px, pz] = done ? [0, 0] : positionAt(t);
      return {
        position: [px, heightAt(t), pz],
        orientation,
        done,
      };
    },
  };
}
