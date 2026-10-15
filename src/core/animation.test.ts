import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planRoll } from './animation.ts';
import { faceUp, orientationForFace, rotate, topFaceAlignment, type Quat } from './d20.ts';
import { createVisualRandom, rollD20 } from './random.ts';
import { RollController } from './rollController.ts';
import { seededSource } from './testing.ts';

const EPS = 1e-9;

function visualRandom(seed: number): () => number {
  return createVisualRandom(seededSource(seed));
}

function quatLength(q: Quat): number {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

describe('planRoll', () => {
  const start = orientationForFace(3, 0.7);

  it('termina exatamente na orientação-alvo, com a face sorteada em cima (20 valores, várias sementes)', () => {
    for (let n = 1; n <= 20; n++) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const target = orientationForFace(n, seed * 0.9);
        const plan = planRoll({ start, target, random: visualRandom(seed * 100 + n) });
        const end = plan.pose(plan.durationMs);
        assert.ok(end.done);
        assert.equal(faceUp(end.orientation), n, `valor ${n}, semente ${seed}`);
        assert.ok(topFaceAlignment(end.orientation) > 1 - EPS);
        assert.deepEqual([...end.position], [0, 0, 0]);
      }
    }
  });

  it('a orientação converge para o alvo continuamente (sem salto no final)', () => {
    const target = orientationForFace(12);
    const plan = planRoll({ start, target, random: visualRandom(8) });
    const almost = plan.pose(plan.durationMs - 1);
    const end = plan.pose(plan.durationMs);
    // Normais da face de cima giradas quase coincidem a 1 ms do fim.
    const a = rotate(almost.orientation, [0, 1, 0]);
    const b = rotate(end.orientation, [0, 1, 0]);
    const diff = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    assert.ok(diff < 0.05, `salto de ${diff} no último milissegundo`);
  });

  it('a altura nunca é negativa e o dado toca a mesa nos instantes de impacto', () => {
    const plan = planRoll({
      start,
      target: orientationForFace(5),
      random: visualRandom(11),
    });
    for (let t = 0; t <= plan.durationMs; t += 5) {
      const h = plan.pose(t).position[1];
      assert.ok(h >= -1e-9, `altura negativa ${h} em t=${t}`);
    }
    for (const impact of plan.impactsMs) {
      assert.ok(Math.abs(plan.pose(impact).position[1]) < 1e-6, `não tocou a mesa em ${impact}`);
    }
  });

  it('impactos estão em ordem crescente, dentro da duração, com arcos cada vez mais baixos', () => {
    const plan = planRoll({
      start,
      target: orientationForFace(9),
      random: visualRandom(21),
    });
    assert.ok(plan.impactsMs.length >= 3);
    for (let i = 1; i < plan.impactsMs.length; i++) {
      assert.ok(plan.impactsMs[i] > plan.impactsMs[i - 1]);
    }
    assert.ok(plan.impactsMs[plan.impactsMs.length - 1] <= plan.durationMs);
    assert.ok(plan.settleStartMs <= plan.durationMs);

    // Pico de cada arco (meio entre impactos consecutivos) diminui.
    const bounds = [0, ...plan.impactsMs];
    const peaks = bounds.slice(1).map((end, i) => plan.pose((bounds[i] + end) / 2).position[1]);
    for (let i = 1; i < peaks.length; i++) {
      assert.ok(peaks[i] < peaks[i - 1]);
    }
  });

  it('limita o tempo a [0, duração]', () => {
    const plan = planRoll({
      start,
      target: orientationForFace(1),
      random: visualRandom(4),
    });
    assert.deepEqual(plan.pose(-500).position, plan.pose(0).position);
    assert.equal(plan.pose(plan.durationMs + 10_000).done, true);
    assert.equal(plan.pose(0).done, false);
  });

  it('mantém o quaternion unitário durante toda a animação', () => {
    const plan = planRoll({
      start,
      target: orientationForFace(15),
      random: visualRandom(31),
    });
    for (let t = 0; t <= plan.durationMs; t += 7) {
      assert.ok(Math.abs(quatLength(plan.pose(t).orientation) - 1) < 1e-9);
    }
  });

  it('é determinística dada a mesma fonte visual', () => {
    const target = orientationForFace(18);
    const a = planRoll({ start, target, random: visualRandom(77) });
    const b = planRoll({ start, target, random: visualRandom(77) });
    for (let t = 0; t <= a.durationMs; t += 50) {
      assert.deepEqual(a.pose(t), b.pose(t));
    }
  });

  it('a fonte visual nunca altera o resultado final', () => {
    const target = orientationForFace(6);
    const finals = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const plan = planRoll({ start, target, random: visualRandom(seed) });
      finals.add(faceUp(plan.pose(plan.durationMs).orientation));
    }
    assert.deepEqual([...finals], [6]);
  });
});

describe('fluxo completo (passos 1 a 7 do documento, sem renderização)', () => {
  it('2000 rolagens: face de cima sempre igual ao resultado sorteado, um registro por ação', () => {
    const resultSource = seededSource(424242);
    const visualSource = seededSource(31337);
    let n = 0;
    const controller = new RollController({
      source: resultSource,
      now: () => new Date('2026-10-14T20:00:00.000Z'),
      newId: () => `r${++n}`,
    });

    const history: { id: string; result: number }[] = [];
    let orientation = orientationForFace(1);
    const counts = new Array<number>(20).fill(0);

    for (let i = 0; i < 2000; i++) {
      const ticket = controller.trigger(); // passos 1 e 2: sorteia e guarda
      assert.ok(ticket);
      assert.equal(controller.trigger(), null); // toque duplo durante a rolagem é ignorado

      const target = orientationForFace(ticket.result, (visualSource.nextUint32() / 2 ** 32) * 6.2832);
      const plan = planRoll({ start: orientation, target, random: createVisualRandom(visualSource) }); // 3 e 4
      const end = plan.pose(plan.durationMs);
      orientation = end.orientation;

      const observed = faceUp(end.orientation); // passo 5: confirma a face superior
      const record = controller.complete(ticket.id, observed); // passos 6 e 7
      assert.ok(record);
      assert.equal(controller.complete(ticket.id, observed), null); // conclusão duplicada ignorada
      history.push({ id: record.id, result: record.result });
      counts[record.result - 1]++;
    }

    assert.equal(history.length, 2000);
    assert.equal(new Set(history.map((h) => h.id)).size, 2000, 'ids repetidos');
    assert.ok(history.every((h) => h.result >= 1 && h.result <= 20));
    assert.ok(counts.every((c) => c > 0), 'algum valor nunca saiu em 2000 rolagens');
  });

  it('os resultados são exatamente os do gerador, independentemente da animação', () => {
    // Mesma semente de resultado => mesma sequência, qualquer que seja a fonte visual.
    const expected: number[] = [];
    const ref = seededSource(2718);
    for (let i = 0; i < 50; i++) expected.push(rollD20(ref));

    for (const visualSeed of [1, 2, 3]) {
      let n = 0;
      const controller = new RollController({
        source: seededSource(2718),
        now: () => new Date(0),
        newId: () => `x${++n}`,
      });
      const visual = seededSource(visualSeed);
      const got: number[] = [];
      for (let i = 0; i < 50; i++) {
        const ticket = controller.trigger();
        assert.ok(ticket);
        const plan = planRoll({
          start: orientationForFace(1),
          target: orientationForFace(ticket.result),
          random: createVisualRandom(visual),
        });
        const record = controller.complete(ticket.id, faceUp(plan.pose(plan.durationMs).orientation));
        assert.ok(record);
        got.push(record.result);
      }
      assert.deepEqual(got, expected);
    }
  });
});
