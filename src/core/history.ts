/**
 * Histórico de rolagens com persistência local.
 *
 * O armazenamento é injetado (`KeyValueStorage`), então o núcleo roda em teste
 * sem navegador. Skins desbloqueadas ficam em outra chave: limpar o histórico
 * nunca as toca.
 */

import type { RollRecord } from './rollController.ts';

/** Subconjunto de `Storage` (localStorage) que o app usa. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const HISTORY_KEY = 'critbox.history.v1';
/** Limite de registros guardados; os mais antigos saem primeiro. */
export const HISTORY_LIMIT = 500;

interface HistoryFile {
  readonly version: 1;
  readonly records: readonly RollRecord[];
}

function isValidRecord(value: unknown): value is RollRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.result === 'number' &&
    Number.isInteger(r.result) &&
    r.result >= 1 &&
    r.result <= 20 &&
    typeof r.timestamp === 'string' &&
    !Number.isNaN(Date.parse(r.timestamp))
  );
}

/** Lê o histórico salvo. Dado ausente, ilegível ou de outra versão vira lista vazia. */
export function parseHistory(raw: string | null): RollRecord[] {
  if (raw === null) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return [];
    const file = data as Partial<HistoryFile>;
    if (file.version !== 1 || !Array.isArray(file.records)) return [];
    const seen = new Set<string>();
    const records: RollRecord[] = [];
    for (const item of file.records as unknown[]) {
      if (isValidRecord(item) && !seen.has(item.id)) {
        seen.add(item.id);
        records.push({ id: item.id, result: item.result, timestamp: item.timestamp });
      }
    }
    return records.slice(-HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export class HistoryStore {
  private items: RollRecord[];
  private persistent = true;
  private readonly storage: KeyValueStorage | null;

  /** `storage` nulo (ex.: navegador sem armazenamento) mantém o histórico só em memória. */
  constructor(storage: KeyValueStorage | null) {
    this.storage = storage;
    let raw: string | null = null;
    if (storage !== null) {
      try {
        raw = storage.getItem(HISTORY_KEY);
      } catch {
        this.persistent = false;
      }
    } else {
      this.persistent = false;
    }
    this.items = parseHistory(raw);
  }

  /** Registros em ordem cronológica (do mais antigo ao mais recente). */
  get records(): readonly RollRecord[] {
    return this.items;
  }

  /** Último registro, se houver. */
  get latest(): RollRecord | null {
    return this.items.length > 0 ? this.items[this.items.length - 1] : null;
  }

  /** Falso quando o armazenamento falhou: o histórico vale só até fechar o app. */
  get isPersistent(): boolean {
    return this.persistent;
  }

  /** Adiciona um registro. Um id já existente é ignorado (devolve falso). */
  add(record: RollRecord): boolean {
    if (this.items.some((r) => r.id === record.id)) return false;
    this.items = [...this.items, record].slice(-HISTORY_LIMIT);
    this.save();
    return true;
  }

  /** Apaga todos os registros. */
  clear(): void {
    this.items = [];
    this.save();
  }

  private save(): void {
    if (this.storage === null) return;
    const file: HistoryFile = { version: 1, records: this.items };
    try {
      this.storage.setItem(HISTORY_KEY, JSON.stringify(file));
      this.persistent = true;
    } catch {
      this.persistent = false; // cota cheia, modo privado etc.
    }
  }
}
