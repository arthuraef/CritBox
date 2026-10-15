import { rollD20, type RandomSource } from './random.ts';

export type RollState = 'idle' | 'rolling';

/** Rolagem em andamento: resultado já decidido, animação ainda por executar. */
export interface RollTicket {
  readonly id: string;
  readonly result: number;
}

/** Registro final de uma rolagem concluída, pronto para o histórico. */
export interface RollRecord {
  readonly id: string;
  readonly result: number;
  /** ISO 8601 em UTC. */
  readonly timestamp: string;
}

export interface RollControllerDeps {
  readonly source: RandomSource;
  readonly now: () => Date;
  /** Gera identificadores únicos de rolagem. */
  readonly newId: () => string;
}

export class FaceMismatchError extends Error {
  readonly expected: number;
  readonly observed: number;

  constructor(expected: number, observed: number) {
    super(`Face superior (${observed}) difere do resultado sorteado (${expected}).`);
    this.name = 'FaceMismatchError';
    this.expected = expected;
    this.observed = observed;
  }
}

/**
 * Máquina de estados da rolagem: idle -> rolling -> idle.
 *
 * - O resultado é sorteado e guardado ao iniciar, antes da animação.
 * - Enquanto rola, novos disparos são ignorados (sem resultado duplicado).
 * - Cada rolagem só pode ser concluída uma vez.
 * - A conclusão confere a face superior observada com o resultado sorteado.
 */
export class RollController {
  private readonly deps: RollControllerDeps;
  private current: RollTicket | null = null;

  constructor(deps: RollControllerDeps) {
    this.deps = deps;
  }

  get state(): RollState {
    return this.current === null ? 'idle' : 'rolling';
  }

  /** Rolagem em curso, se houver. */
  get active(): RollTicket | null {
    return this.current;
  }

  /**
   * Inicia uma rolagem. Devolve `null` se já houver uma em andamento,
   * sem sortear nada nesse caso.
   */
  trigger(): RollTicket | null {
    if (this.current !== null) {
      return null;
    }
    const ticket: RollTicket = {
      id: this.deps.newId(),
      result: rollD20(this.deps.source),
    };
    this.current = ticket;
    return ticket;
  }

  /**
   * Conclui a rolagem em andamento com a face superior observada.
   *
   * Devolve o registro para o histórico, ou `null` se não havia rolagem ativa
   * (conclusão duplicada ou fora de ordem). Se a face observada divergir do
   * resultado, a rolagem é descartada e `FaceMismatchError` é lançado: o valor
   * errado nunca é exibido nem registrado.
   */
  complete(ticketId: string, observedTopFace: number): RollRecord | null {
    const ticket = this.current;
    if (ticket === null || ticket.id !== ticketId) {
      return null;
    }
    this.current = null;
    if (observedTopFace !== ticket.result) {
      throw new FaceMismatchError(ticket.result, observedTopFace);
    }
    return {
      id: ticket.id,
      result: ticket.result,
      timestamp: this.deps.now().toISOString(),
    };
  }

  /** Abandona a rolagem em andamento sem registrá-la (ex.: erro de renderização). */
  abort(ticketId: string): boolean {
    if (this.current !== null && this.current.id === ticketId) {
      this.current = null;
      return true;
    }
    return false;
  }
}
