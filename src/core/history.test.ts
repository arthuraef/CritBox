import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_KEY, HISTORY_LIMIT, HistoryStore, parseHistory, type KeyValueStorage } from './history.ts';
import type { RollRecord } from './rollController.ts';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const rec = (n: number, result = 10): RollRecord => ({
  id: `id-${n}`,
  result,
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
});

describe('HistoryStore', () => {
  it('começa vazio sem dados salvos', () => {
    const h = new HistoryStore(memoryStorage());
    assert.equal(h.records.length, 0);
    assert.equal(h.latest, null);
  });

  it('registra em ordem cronológica e guarda data, resultado e id', () => {
    const h = new HistoryStore(memoryStorage());
    h.add(rec(1, 5));
    h.add(rec(2, 20));
    assert.deepEqual(h.records.map((r) => r.result), [5, 20]);
    assert.equal(h.latest?.id, 'id-2');
    assert.ok(h.records[0].timestamp.endsWith('Z'));
  });

  it('sobrevive a reiniciar o app (nova instância sobre o mesmo armazenamento)', () => {
    const storage = memoryStorage();
    const a = new HistoryStore(storage);
    a.add(rec(1, 7));
    a.add(rec(2, 1));
    const b = new HistoryStore(storage);
    assert.deepEqual(b.records, a.records);
  });

  it('ignora id repetido (uma ação não gera dois registros)', () => {
    const h = new HistoryStore(memoryStorage());
    assert.equal(h.add(rec(1)), true);
    assert.equal(h.add(rec(1)), false);
    assert.equal(h.records.length, 1);
  });

  it('limpar apaga o histórico e persiste, sem tocar em outras chaves (skins)', () => {
    const storage = memoryStorage({ 'critbox.skins.v1': '{"unlocked":["dragonflame"]}' });
    const h = new HistoryStore(storage);
    h.add(rec(1));
    h.clear();
    assert.equal(h.records.length, 0);
    assert.equal(new HistoryStore(storage).records.length, 0);
    assert.equal(storage.data['critbox.skins.v1'], '{"unlocked":["dragonflame"]}');
  });

  it('guarda no máximo HISTORY_LIMIT registros, descartando os mais antigos', () => {
    const h = new HistoryStore(memoryStorage());
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h.add(rec(i));
    assert.equal(h.records.length, HISTORY_LIMIT);
    assert.equal(h.records[0].id, 'id-5');
  });

  it('armazenamento que falha ao gravar não quebra: segue em memória e avisa', () => {
    const broken: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const h = new HistoryStore(broken);
    assert.equal(h.add(rec(1, 3)), true);
    assert.equal(h.records.length, 1);
    assert.equal(h.isPersistent, false);
  });

  it('sem armazenamento (null) funciona só em memória', () => {
    const h = new HistoryStore(null);
    h.add(rec(1));
    assert.equal(h.records.length, 1);
    assert.equal(h.isPersistent, false);
  });

  it('leitura que lança erro vira histórico vazio', () => {
    const h = new HistoryStore({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    });
    assert.equal(h.records.length, 0);
  });
});

describe('parseHistory', () => {
  it('dados corrompidos ou de outra versão viram lista vazia', () => {
    assert.deepEqual(parseHistory('{não é json'), []);
    assert.deepEqual(parseHistory('null'), []);
    assert.deepEqual(parseHistory('{"version":2,"records":[]}'), []);
    assert.deepEqual(parseHistory('{"version":1,"records":"x"}'), []);
  });

  it('descarta registros inválidos (resultado fora de 1..20, data inválida, id repetido)', () => {
    const good = rec(1, 12);
    const raw = JSON.stringify({
      version: 1,
      records: [
        good,
        { ...rec(2), result: 21 },
        { ...rec(3), result: 0 },
        { ...rec(4), result: 3.5 },
        { ...rec(5), timestamp: 'ontem' },
        { ...good },
        { id: '', result: 5, timestamp: good.timestamp },
        42,
      ],
    });
    assert.deepEqual(parseHistory(raw), [good]);
  });

  it('a chave usada é versionada', () => {
    assert.equal(HISTORY_KEY, 'critbox.history.v1');
  });
});
