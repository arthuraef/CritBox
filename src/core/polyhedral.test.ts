import assert from 'node:assert/strict';
import test from 'node:test';
import { D20Polyhedral, D6Polyhedral, DICE_REGISTRY } from './polyhedral.ts';
import { dot } from './d20.ts';

test('D20Polyhedral satisfaz a interface e regras do D20 canônico', () => {
  assert.equal(D20Polyhedral.id, 'd20');
  assert.equal(D20Polyhedral.facesCount, 20);
  assert.equal(D20Polyhedral.minValue, 1);
  assert.equal(D20Polyhedral.maxValue, 20);
  assert.equal(D20Polyhedral.faces.length, 20);

  // Cada valor 1..20 é verificado com faceUp
  for (let v = 1; v <= 20; v++) {
    const q = D20Polyhedral.orientationForFace(v, 0.5);
    assert.equal(D20Polyhedral.faceUp(q), v);
    assert.ok(D20Polyhedral.topFaceAlignment(q) > 0.999);
  }
});

test('D6Polyhedral satisfaz regras canônicas de dados cúbicos', () => {
  assert.equal(D6Polyhedral.id, 'd6');
  assert.equal(D6Polyhedral.facesCount, 6);
  assert.equal(D6Polyhedral.minValue, 1);
  assert.equal(D6Polyhedral.maxValue, 6);
  assert.equal(D6Polyhedral.faces.length, 6);

  // Regra canônica de RPG para D6: faces opostas somam 7
  for (let v = 1; v <= 6; v++) {
    const face = D6Polyhedral.faceByValue(v);
    const oppositeValue = 7 - v;
    const oppositeFace = D6Polyhedral.faceByValue(oppositeValue);
    const d = dot(face.normal, oppositeFace.normal);
    assert.ok(d < -0.999, `Face ${v} e ${oppositeValue} devem ser opostas (dot = ${d})`);
  }

  // Cada valor 1..6 orientado para cima é confirmado por faceUp
  for (let v = 1; v <= 6; v++) {
    for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      const q = D6Polyhedral.orientationForFace(v, yaw);
      assert.equal(D6Polyhedral.faceUp(q), v);
      assert.ok(D6Polyhedral.topFaceAlignment(q) > 0.999);
    }
  }

  // uprightYaw coloca o número em pé
  for (let v = 1; v <= 6; v++) {
    const yaw = D6Polyhedral.uprightYaw(v);
    const q = D6Polyhedral.orientationForFace(v, yaw);
    assert.equal(D6Polyhedral.faceUp(q), v);
  }

  // RangeError em valores fora de 1..6
  assert.throws(() => D6Polyhedral.faceByValue(0), RangeError);
  assert.throws(() => D6Polyhedral.faceByValue(7), RangeError);
});

test('DICE_REGISTRY contém d20 e d6 registrados', () => {
  assert.ok(DICE_REGISTRY.d20);
  assert.ok(DICE_REGISTRY.d6);
  assert.equal(DICE_REGISTRY.d20.facesCount, 20);
  assert.equal(DICE_REGISTRY.d6.facesCount, 6);
});
