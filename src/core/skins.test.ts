import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINS_CATALOG,
  SKINS_STORAGE_KEY,
  DEFAULT_SKINS_STATE,
  SkinsStore,
  parseSkinsState,
} from './skins.ts';
import type { KeyValueStorage } from './history.ts';

function mem(): KeyValueStorage & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('SkinsStore', () => {
  it('inicializa com estado padrão e skins gratuitas desbloqueadas', () => {
    const s = new SkinsStore(null);
    assert.equal(s.value.activeId, 'ivory');
    assert.deepEqual(s.value.unlockedIds, ['ivory', 'scuffed-metal']);
    assert.equal(s.activeSkin.id, 'ivory');
  });

  it('permite selecionar skin desbloqueada e persiste a escolha', () => {
    const storage = mem();
    const s = new SkinsStore(storage);
    const ok = s.select('scuffed-metal');
    assert.ok(ok);
    assert.equal(s.value.activeId, 'scuffed-metal');
    assert.equal(s.activeSkin.id, 'scuffed-metal');

    // Nova instância sobre o mesmo storage preserva a escolha
    const s2 = new SkinsStore(storage);
    assert.equal(s2.value.activeId, 'scuffed-metal');
  });

  it('recusa selecionar skin bloqueada', () => {
    const s = new SkinsStore(null);
    const ok = s.select('dragonflame');
    assert.equal(ok, false);
    assert.equal(s.value.activeId, 'ivory');
  });

  it('desbloqueia skin e persiste para próximas sessões', () => {
    const storage = mem();
    const s = new SkinsStore(storage);
    assert.equal(s.isUnlocked('dragonflame'), false);

    const ok = s.unlock('dragonflame');
    assert.ok(ok);
    assert.equal(s.isUnlocked('dragonflame'), true);

    // Agora pode ser selecionada
    assert.ok(s.select('dragonflame'));
    assert.equal(s.value.activeId, 'dragonflame');

    // Sobrevive a reiniciar o app
    const s2 = new SkinsStore(storage);
    assert.equal(s2.isUnlocked('dragonflame'), true);
    assert.equal(s2.value.activeId, 'dragonflame');
  });

  it('recusa desbloquear skin inexistente', () => {
    const s = new SkinsStore(null);
    assert.equal(s.unlock('inexistente'), false);
  });

  it('trata dados corrompidos ou inválidos com fallback seguro', () => {
    assert.deepEqual(parseSkinsState('lixo'), DEFAULT_SKINS_STATE);
    assert.deepEqual(parseSkinsState('{"activeId": 123}'), DEFAULT_SKINS_STATE);
    assert.deepEqual(parseSkinsState('{"unlockedIds": ["inexistente"]}'), DEFAULT_SKINS_STATE);
  });

  it('usa chave de armazenamento própria sem interferir em outras', () => {
    const storage = mem();
    storage.data['critbox.history.v1'] = 'H';
    storage.data['critbox.settings.v1'] = 'S';

    const s = new SkinsStore(storage);
    s.unlock('dragonflame');
    assert.equal(storage.data['critbox.history.v1'], 'H');
    assert.equal(storage.data['critbox.settings.v1'], 'S');
    assert.ok(SKINS_STORAGE_KEY in storage.data);
  });
});
