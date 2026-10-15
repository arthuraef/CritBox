import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FaceMismatchError, RollController } from './rollController.ts';
import { scriptedSource, seededSource } from './testing.ts';

function makeController(source = seededSource(7)) {
  let n = 0;
  const clock = new Date('2026-10-14T20:00:00.000Z');
  return new RollController({
    source,
    now: () => clock,
    newId: () => `roll-${++n}`,
  });
}

describe('RollController', () => {
  it('começa ocioso', () => {
    const c = makeController();
    assert.equal(c.state, 'idle');
    assert.equal(c.active, null);
  });

  it('sorteia e guarda o resultado ao iniciar, antes de qualquer animação', () => {
    const src = scriptedSource([4]); // 4 % 20 + 1 = 5
    const c = makeController(src);
    const ticket = c.trigger();
    assert.ok(ticket);
    assert.equal(ticket.result, 5);
    assert.equal(src.consumed, 1);
    assert.equal(c.state, 'rolling');
    assert.deepEqual(c.active, ticket);
  });

  it('ignora disparos durante a rolagem e não sorteia de novo', () => {
    const src = scriptedSource([4, 9]);
    const c = makeController(src);
    const first = c.trigger();
    assert.ok(first);
    assert.equal(c.trigger(), null);
    assert.equal(c.trigger(), null);
    assert.equal(src.consumed, 1, 'disparos repetidos não podem consumir aleatoriedade');
    assert.equal(c.active?.id, first.id);
  });

  it('uma única ação gera exatamente um registro, mesmo com disparos e conclusões duplicados', () => {
    const c = makeController(scriptedSource([4, 9]));
    const records = [];
    const ticket = c.trigger();
    assert.ok(ticket);
    c.trigger(); // toque duplo
    c.trigger();
    const r1 = c.complete(ticket.id, ticket.result);
    const r2 = c.complete(ticket.id, ticket.result); // conclusão duplicada
    if (r1) records.push(r1);
    if (r2) records.push(r2);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0], {
      id: 'roll-1',
      result: 5,
      timestamp: '2026-10-14T20:00:00.000Z',
    });
    assert.equal(c.state, 'idle');
  });

  it('permite uma nova rolagem depois de concluir, com id novo', () => {
    const c = makeController(scriptedSource([4, 9]));
    const a = c.trigger();
    assert.ok(a);
    assert.ok(c.complete(a.id, a.result));
    const b = c.trigger();
    assert.ok(b);
    assert.notEqual(b.id, a.id);
    assert.equal(b.result, 10);
  });

  it('rejeita conclusão com id que não é da rolagem ativa', () => {
    const c = makeController(scriptedSource([4]));
    const t = c.trigger();
    assert.ok(t);
    assert.equal(c.complete('outro-id', t.result), null);
    assert.equal(c.state, 'rolling', 'rolagem ativa não pode ser afetada por id errado');
  });

  it('conclusão sem rolagem ativa devolve null', () => {
    assert.equal(makeController().complete('roll-1', 3), null);
  });

  it('lança FaceMismatchError se a face superior divergir, sem registrar o valor errado', () => {
    const c = makeController(scriptedSource([4]));
    const t = c.trigger();
    assert.ok(t);
    assert.throws(
      () => c.complete(t.id, t.result === 20 ? 1 : t.result + 1),
      (err: unknown) => err instanceof FaceMismatchError && err.expected === t.result,
    );
    assert.equal(c.state, 'idle', 'a rolagem inconsistente é descartada');
  });

  it('abort descarta a rolagem sem registro', () => {
    const c = makeController(scriptedSource([4]));
    const t = c.trigger();
    assert.ok(t);
    assert.equal(c.abort('x'), false);
    assert.equal(c.abort(t.id), true);
    assert.equal(c.state, 'idle');
    assert.equal(c.complete(t.id, t.result), null);
  });
});
