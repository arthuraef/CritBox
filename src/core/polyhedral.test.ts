import assert from 'node:assert/strict';
import test from 'node:test';
import {
  D20Polyhedral,
  D6Polyhedral,
  D4Polyhedral,
  D8Polyhedral,
  D10Polyhedral,
  D12Polyhedral,
  D100Polyhedral,
  DICE_REGISTRY,
} from './polyhedral.ts';
import { dot } from './d20.ts';

test('D20Polyhedral satisfaz a interface e regras do D20 canônico', () => {
  assert.equal(D20Polyhedral.id, 'd20');
  assert.equal(D20Polyhedral.facesCount, 20);
  assert.equal(D20Polyhedral.minValue, 1);
  assert.equal(D20Polyhedral.maxValue, 20);
  assert.equal(D20Polyhedral.faces.length, 20);

  for (let v = 1; v <= 20; v++) {
    const q = D20Polyhedral.orientationForFace(v, 0.5);
    assert.equal(D20Polyhedral.faceUp(q), v);
    assert.ok(D20Polyhedral.topFaceAlignment(q) > 0.999);
  }
});

test('D4Polyhedral satisfaz regras do tetraedro', () => {
  assert.equal(D4Polyhedral.id, 'd4');
  assert.equal(D4Polyhedral.facesCount, 4);
  assert.equal(D4Polyhedral.minValue, 1);
  assert.equal(D4Polyhedral.maxValue, 4);

  for (let v = 1; v <= 4; v++) {
    const q = D4Polyhedral.orientationForFace(v, 0.3);
    assert.equal(D4Polyhedral.faceUp(q), v);
    assert.ok(D4Polyhedral.topFaceAlignment(q) > 0.999);
  }
});

test('D6Polyhedral satisfaz regras canônicas de dados cúbicos', () => {
  assert.equal(D6Polyhedral.id, 'd6');
  assert.equal(D6Polyhedral.facesCount, 6);
  assert.equal(D6Polyhedral.minValue, 1);
  assert.equal(D6Polyhedral.maxValue, 6);

  // Faces opostas somam 7
  for (let v = 1; v <= 6; v++) {
    const face = D6Polyhedral.faceByValue(v);
    const oppositeValue = 7 - v;
    const oppositeFace = D6Polyhedral.faceByValue(oppositeValue);
    const d = dot(face.normal, oppositeFace.normal);
    assert.ok(d < -0.999, `Face ${v} e ${oppositeValue} devem ser opostas`);
  }

  for (let v = 1; v <= 6; v++) {
    const q = D6Polyhedral.orientationForFace(v, 0.4);
    assert.equal(D6Polyhedral.faceUp(q), v);
    assert.ok(D6Polyhedral.topFaceAlignment(q) > 0.999);
  }
});

test('D8Polyhedral satisfaz regras do octaedro regular', () => {
  assert.equal(D8Polyhedral.id, 'd8');
  assert.equal(D8Polyhedral.facesCount, 8);
  assert.equal(D8Polyhedral.minValue, 1);
  assert.equal(D8Polyhedral.maxValue, 8);

  // Faces opostas somam 9
  for (let v = 1; v <= 8; v++) {
    const face = D8Polyhedral.faceByValue(v);
    const oppFace = D8Polyhedral.faceByValue(9 - v);
    const d = dot(face.normal, oppFace.normal);
    assert.ok(d < -0.999, `Faces ${v} e ${9 - v} devem ser opostas`);
  }

  for (let v = 1; v <= 8; v++) {
    const q = D8Polyhedral.orientationForFace(v, 0.2);
    assert.equal(D8Polyhedral.faceUp(q), v);
    assert.ok(D8Polyhedral.topFaceAlignment(q) > 0.999);
  }
});

test('D10Polyhedral satisfaz regras do trapezoedro pentagonal', () => {
  assert.equal(D10Polyhedral.id, 'd10');
  assert.equal(D10Polyhedral.facesCount, 10);
  assert.equal(D10Polyhedral.minValue, 1);
  assert.equal(D10Polyhedral.maxValue, 10);

  // Faces opostas somam 11
  for (let v = 1; v <= 10; v++) {
    const face = D10Polyhedral.faceByValue(v);
    const oppFace = D10Polyhedral.faceByValue(11 - v);
    const d = dot(face.normal, oppFace.normal);
    assert.ok(d < -0.999, `Faces ${v} e ${11 - v} devem ser opostas`);
  }

  for (let v = 1; v <= 10; v++) {
    const q = D10Polyhedral.orientationForFace(v, 0.1);
    assert.equal(D10Polyhedral.faceUp(q), v);
    assert.ok(D10Polyhedral.topFaceAlignment(q) > 0.999);
  }
});

test('D12Polyhedral satisfaz regras do dodecaedro regular', () => {
  assert.equal(D12Polyhedral.id, 'd12');
  assert.equal(D12Polyhedral.facesCount, 12);
  assert.equal(D12Polyhedral.minValue, 1);
  assert.equal(D12Polyhedral.maxValue, 12);

  // Faces opostas somam 13
  for (let v = 1; v <= 12; v++) {
    const face = D12Polyhedral.faceByValue(v);
    const oppFace = D12Polyhedral.faceByValue(13 - v);
    const d = dot(face.normal, oppFace.normal);
    assert.ok(d < -0.999, `Faces ${v} e ${13 - v} devem ser opostas`);
  }

  for (let v = 1; v <= 12; v++) {
    const q = D12Polyhedral.orientationForFace(v, 0.7);
    assert.equal(D12Polyhedral.faceUp(q), v);
    assert.ok(D12Polyhedral.topFaceAlignment(q) > 0.999);
  }
});

test('D100Polyhedral satisfaz numeração percentual em dezenas', () => {
  assert.equal(D100Polyhedral.id, 'd100');
  assert.equal(D100Polyhedral.facesCount, 10);
  assert.equal(D100Polyhedral.minValue, 0);
  assert.equal(D100Polyhedral.maxValue, 90);

  const values = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  for (const v of values) {
    const f = D100Polyhedral.faceByValue(v);
    assert.equal(f.value, v);
    assert.equal(f.displayLabel, `${v}`.padStart(2, '0'));

    const q = D100Polyhedral.orientationForFace(v);
    assert.equal(D100Polyhedral.faceUp(q), v);
  }
});

test('DICE_REGISTRY contém todos os 7 dados de RPG registrados', () => {
  const expected = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
  for (const id of expected) {
    assert.ok(DICE_REGISTRY[id], `Dado ${id} deve existir no catálogo`);
  }
});
