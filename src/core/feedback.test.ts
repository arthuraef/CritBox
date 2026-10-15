import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventCursor, hapticDuration, hapticFor, planFeedback, specialFor, type FeedbackKind } from './feedback.ts';
import { planRoll } from './animation.ts';
import { orientationForFace } from './d20.ts';
import { seededSource } from './testing.ts';
import { createVisualRandom } from './random.ts';
import { SETTINGS_KEY, DEFAULT_SETTINGS, SettingsStore, parseSettings } from './settings.ts';
import type { KeyValueStorage } from './history.ts';

function realPlan(seed: number) {
  return planRoll({
    start: orientationForFace(1),
    target: orientationForFace(20),
    random: createVisualRandom(seededSource(seed)),
    throwHeight: 0.7,
  });
}

describe('planFeedback', () => {
  it('um lançamento, impactos em cada quique e a estabilização no último toque', () => {
    const plan = realPlan(1);
    const ev = planFeedback(plan);
    assert.equal(ev[0].kind, 'throw');
    assert.equal(ev[0].atMs, 0);
    assert.equal(ev.filter((e) => e.kind === 'throw').length, 1);
    assert.equal(ev.filter((e) => e.kind === 'settle').length, 1);
    assert.equal(ev.filter((e) => e.kind === 'impact').length, plan.impactsMs.length - 1);
    assert.equal(ev[ev.length - 1].kind, 'settle');
    assert.equal(ev[ev.length - 1].atMs, plan.impactsMs[plan.impactsMs.length - 1]);
  });

  it('está em ordem crescente, dentro da duração, e impactos ficam mais fracos', () => {
    const plan = realPlan(2);
    const ev = planFeedback(plan);
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].atMs >= ev[i - 1].atMs);
    assert.ok(ev.every((e) => e.atMs >= 0 && e.atMs <= plan.durationMs));
    const impacts = ev.filter((e) => e.kind === 'impact');
    for (let i = 1; i < impacts.length; i++) assert.ok(impacts[i].strength < impacts[i - 1].strength);
    assert.ok(ev.every((e) => e.strength > 0 && e.strength <= 1));
  });

  it('não depende do resultado: a assinatura nem recebe o valor sorteado', () => {
    assert.equal(planFeedback.length, 1);
  });
});

describe('specialFor', () => {
  it('20 é vitória, 1 é derrota, o resto não tem efeito', () => {
    assert.equal(specialFor(20), 'crit');
    assert.equal(specialFor(1), 'fumble');
    for (let n = 2; n <= 19; n++) assert.equal(specialFor(n), null);
  });
});

describe('EventCursor', () => {
  it('entrega cada evento exatamente uma vez, em ordem, mesmo com quadros irregulares', () => {
    const events = planFeedback(realPlan(3));
    const cursor = new EventCursor(events, Infinity);
    const seen: number[] = [];
    for (let t = 0; t <= 2500; t += 7) {
      for (const e of cursor.due(t)) seen.push(e.atMs);
    }
    for (const e of cursor.due(99999)) seen.push(e.atMs);
    assert.equal(seen.length, events.length);
    assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
    assert.deepEqual(cursor.due(99999), []);
  });

  it('descarta eventos muito atrasados em vez de tocar tudo de uma vez', () => {
    const cursor = new EventCursor(
      [
        { atMs: 0, kind: 'throw', strength: 1 },
        { atMs: 500, kind: 'impact', strength: 1 },
        { atMs: 900, kind: 'settle', strength: 0.6 },
      ],
      250,
    );
    assert.deepEqual(cursor.due(5000).length, 0); // aba parada por 5 s: nada toca
    assert.deepEqual(cursor.due(6000), []);
  });

  it('um quadro normal entrega o evento no instante certo', () => {
    const cursor = new EventCursor([{ atMs: 100, kind: 'impact', strength: 1 }]);
    assert.equal(cursor.due(99).length, 0);
    assert.equal(cursor.due(116).length, 1);
  });
});

describe('vibração', () => {
  const kinds: FeedbackKind[] = ['throw', 'impact', 'settle', 'crit', 'fumble'];

  it('todo padrão é breve (nada de vibração contínua)', () => {
    for (const k of kinds) {
      const p = hapticFor(k, 1);
      assert.ok(hapticDuration(p) <= 400, `${k} dura ${hapticDuration(p)} ms`);
      if (Array.isArray(p)) assert.ok(p.every((n) => n > 0 && n <= 120));
    }
  });

  it('resultados especiais têm padrões diferentes entre si e das vibrações comuns', () => {
    const crit = JSON.stringify(hapticFor('crit'));
    const fumble = JSON.stringify(hapticFor('fumble'));
    assert.notEqual(crit, fumble);
    for (const k of ['throw', 'impact', 'settle'] as const) {
      assert.notEqual(JSON.stringify(hapticFor(k)), crit);
      assert.notEqual(JSON.stringify(hapticFor(k)), fumble);
    }
  });

  it('impactos mais fracos vibram menos', () => {
    assert.ok((hapticFor('impact', 0.2) as number) < (hapticFor('impact', 1) as number));
  });
});

describe('SettingsStore', () => {
  const mem = (): KeyValueStorage & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
  };

  it('começa com som e vibração ligados', () => {
    assert.deepEqual(new SettingsStore(mem()).value, { sound: true, haptics: true });
  });

  it('persiste alterações entre sessões', () => {
    const s = mem();
    new SettingsStore(s).update({ sound: false });
    assert.deepEqual(new SettingsStore(s).value, { sound: false, haptics: true });
    new SettingsStore(s).update({ haptics: false });
    assert.deepEqual(new SettingsStore(s).value, { sound: false, haptics: false });
  });

  it('dados inválidos voltam ao padrão, campo a campo', () => {
    assert.deepEqual(parseSettings('{lixo'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('{"sound":"não","haptics":false}'), { sound: true, haptics: false });
    assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  });

  it('armazenamento quebrado ou ausente não impede de usar', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    for (const storage of [broken, null]) {
      const s = new SettingsStore(storage);
      s.update({ sound: false });
      assert.equal(s.value.sound, false);
    }
  });

  it('usa chave própria (não mexe em histórico nem skins)', () => {
    const s = mem();
    s.data['critbox.history.v1'] = 'H';
    s.data['critbox.skins.v1'] = 'S';
    new SettingsStore(s).update({ sound: false });
    assert.equal(s.data['critbox.history.v1'], 'H');
    assert.equal(s.data['critbox.skins.v1'], 'S');
    assert.ok(SETTINGS_KEY in s.data);
  });
});
