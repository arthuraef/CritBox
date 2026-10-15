/**
 * Configurações básicas do app (som e vibração), com persistência local.
 * Chave própria: independente do histórico e das skins.
 */

import type { KeyValueStorage } from './history.ts';

export interface Settings {
  readonly sound: boolean;
  readonly haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = { sound: true, haptics: true };
export const SETTINGS_KEY = 'critbox.settings.v1';

/** Lê as configurações salvas; campo ausente ou inválido usa o padrão. */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return DEFAULT_SETTINGS;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return DEFAULT_SETTINGS;
    const d = data as Record<string, unknown>;
    return {
      sound: typeof d.sound === 'boolean' ? d.sound : DEFAULT_SETTINGS.sound,
      haptics: typeof d.haptics === 'boolean' ? d.haptics : DEFAULT_SETTINGS.haptics,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export class SettingsStore {
  private current: Settings;
  private readonly storage: KeyValueStorage | null;

  constructor(storage: KeyValueStorage | null) {
    this.storage = storage;
    let raw: string | null = null;
    try {
      raw = storage?.getItem(SETTINGS_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.current = parseSettings(raw);
  }

  get value(): Settings {
    return this.current;
  }

  /** Aplica uma alteração parcial e grava. Falha ao gravar não perde a alteração em memória. */
  update(patch: Partial<Settings>): void {
    this.current = { ...this.current, ...patch };
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.current));
    } catch {
      // Sem armazenamento: vale até fechar o app.
    }
  }
}
