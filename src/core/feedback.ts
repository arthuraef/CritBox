/**
 * Quando e como tocar som e vibração durante uma rolagem.
 *
 * Tudo aqui é puro. `planFeedback` NÃO recebe o resultado: som e vibração da
 * rolagem não podem depender dele nem influenciá-lo. Os efeitos especiais de
 * 1 e 20 só são pedidos depois que a face foi confirmada (`specialFor`).
 */

export type FeedbackKind = 'throw' | 'impact' | 'settle' | 'crit' | 'fumble';

export interface FeedbackEvent {
  /** Instante, em ms desde o início da rolagem. */
  readonly atMs: number;
  readonly kind: FeedbackKind;
  /** Intensidade relativa, de 0 a 1 (impactos diminuem a cada quique). */
  readonly strength: number;
}

/** Parte do plano de animação de que o feedback precisa. */
export interface FeedbackTiming {
  /** Instantes em que o dado toca a mesa; o último é a acomodação. */
  readonly impactsMs: readonly number[];
}

/** Lançamento no início, um impacto por quique e a estabilização no último toque. */
export function planFeedback(timing: FeedbackTiming): FeedbackEvent[] {
  const impacts = timing.impactsMs;
  const events: FeedbackEvent[] = [{ atMs: 0, kind: 'throw', strength: 1 }];
  impacts.forEach((atMs, i) => {
    const isLast = i === impacts.length - 1;
    events.push({
      atMs,
      kind: isLast ? 'settle' : 'impact',
      strength: isLast ? 0.6 : 1 - i / Math.max(impacts.length, 1),
    });
  });
  return events.sort((a, b) => a.atMs - b.atMs);
}

/** Efeito especial do resultado já confirmado: 20 vitória, 1 derrota, demais nenhum. */
export function specialFor(result: number): 'crit' | 'fumble' | null {
  if (result === 20) return 'crit';
  if (result === 1) return 'fumble';
  return null;
}

/**
 * Entrega cada evento uma única vez, em ordem, conforme o tempo avança.
 * Eventos muito atrasados (aba em segundo plano, quadro travado) são
 * descartados em vez de tocar todos de uma vez.
 */
export class EventCursor {
  private next = 0;
  private readonly events: readonly FeedbackEvent[];
  private readonly staleMs: number;

  constructor(events: readonly FeedbackEvent[], staleMs = 250) {
    this.events = events;
    this.staleMs = staleMs;
  }

  due(tMs: number): FeedbackEvent[] {
    const out: FeedbackEvent[] = [];
    while (this.next < this.events.length && this.events[this.next].atMs <= tMs) {
      const ev = this.events[this.next++];
      if (tMs - ev.atMs <= this.staleMs) out.push(ev);
    }
    return out;
  }
}

/** Padrão de vibração em ms (número = pulso único; lista = pulso, pausa, pulso...). */
export function hapticFor(kind: FeedbackKind, strength = 1): number | number[] {
  switch (kind) {
    case 'throw':
      return 15;
    case 'impact':
      return Math.round(8 + 14 * Math.min(Math.max(strength, 0), 1));
    case 'settle':
      return 25;
    case 'crit':
      return [30, 50, 30, 50, 70];
    case 'fumble':
      return [110, 70, 110];
  }
}

/** Duração total de um padrão, em ms. */
export function hapticDuration(pattern: number | number[]): number {
  return typeof pattern === 'number' ? pattern : pattern.reduce((s, n) => s + n, 0);
}
