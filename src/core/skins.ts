/**
 * Gerenciamento de skins do D20 no CritBox.
 *
 * Cada skin define propriedades visuais de cor, material PBR e numeração.
 * As skins desbloqueadas e a skin ativa são persistidas em `critbox.skins.v1`.
 */

import type { KeyValueStorage } from './history.ts';

export const SKINS_STORAGE_KEY = 'critbox.skins.v1';

export interface SkinMaterialDef {
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly numberColor: string;
  readonly highlightColor: string;
  readonly highlightStroke: string;
}

export interface DiceSkin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly unlockedByDefault: boolean;
  readonly previewColor: string;
  readonly material: SkinMaterialDef;
}

export const SKINS_CATALOG: readonly DiceSkin[] = [
  {
    id: 'ivory',
    name: 'Marfim Clássico',
    description: 'Osso polido com numeração tradicional entalhada à mão.',
    unlockedByDefault: true,
    previewColor: '#faf5e9',
    material: {
      color: 0xfcf6ea,
      roughness: 0.25,
      metalness: 0.02,
      clearcoat: 0.45,
      clearcoatRoughness: 0.16,
      numberColor: '#22160b',
      highlightColor: '#ffffff',
      highlightStroke: '#d49b28',
    },
  },
  {
    id: 'scuffed-metal',
    name: 'Metal Escurecido',
    description: 'Aço de batalha temperado com inscrições em prata.',
    unlockedByDefault: true,
    previewColor: '#2f3138',
    material: {
      color: 0x33363d,
      roughness: 0.42,
      metalness: 0.88,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
      numberColor: '#e2e5eb',
      highlightColor: '#ffffff',
      highlightStroke: '#e6c364',
    },
  },
  {
    id: 'dragonflame',
    name: 'Chama do Dragão',
    description: 'Rubi vulcânico lapidado com runas que ardem em ouro.',
    unlockedByDefault: false,
    previewColor: '#8a1d22',
    material: {
      color: 0x821c22,
      roughness: 0.18,
      metalness: 0.15,
      clearcoat: 0.65,
      clearcoatRoughness: 0.1,
      numberColor: '#fce39f',
      highlightColor: '#ffffff',
      highlightStroke: '#ffcc33',
    },
  },
] as const;

export interface SkinsState {
  readonly activeId: string;
  readonly unlockedIds: readonly string[];
}

export const DEFAULT_SKINS_STATE: SkinsState = {
  activeId: 'ivory',
  unlockedIds: ['ivory', 'scuffed-metal'],
};

export function parseSkinsState(raw: string | null): SkinsState {
  if (raw === null) return DEFAULT_SKINS_STATE;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return DEFAULT_SKINS_STATE;

    const catalogIds = new Set(SKINS_CATALOG.map((s) => s.id));
    const defaultUnlocked = SKINS_CATALOG.filter((s) => s.unlockedByDefault).map((s) => s.id);

    const unlockedSet = new Set<string>(defaultUnlocked);
    if (Array.isArray(data.unlockedIds)) {
      for (const id of data.unlockedIds) {
        if (typeof id === 'string' && catalogIds.has(id)) {
          unlockedSet.add(id);
        }
      }
    }

    const activeId =
      typeof data.activeId === 'string' && unlockedSet.has(data.activeId)
        ? data.activeId
        : DEFAULT_SKINS_STATE.activeId;

    return {
      activeId,
      unlockedIds: Array.from(unlockedSet),
    };
  } catch {
    return DEFAULT_SKINS_STATE;
  }
}

export class SkinsStore {
  private readonly storage: KeyValueStorage | null;
  private state: SkinsState;

  constructor(storage: KeyValueStorage | null) {
    this.storage = storage;
    let raw: string | null = null;
    try {
      raw = storage?.getItem(SKINS_STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.state = parseSkinsState(raw);
  }

  get value(): SkinsState {
    return this.state;
  }

  get activeSkin(): DiceSkin {
    return (
      SKINS_CATALOG.find((s) => s.id === this.state.activeId) ??
      SKINS_CATALOG[0]
    );
  }

  isUnlocked(id: string): boolean {
    return this.state.unlockedIds.includes(id);
  }

  select(id: string): boolean {
    if (!this.isUnlocked(id)) return false;
    this.state = {
      ...this.state,
      activeId: id,
    };
    this.persist();
    return true;
  }

  unlock(id: string): boolean {
    const exists = SKINS_CATALOG.some((s) => s.id === id);
    if (!exists) return false;

    if (!this.state.unlockedIds.includes(id)) {
      this.state = {
        ...this.state,
        unlockedIds: [...this.state.unlockedIds, id],
      };
      this.persist();
    }
    return true;
  }

  private persist(): void {
    try {
      this.storage?.setItem(SKINS_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Segue em memória se o storage falhar
    }
  }
}
