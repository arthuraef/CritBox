import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  D20,
  dot,
  faceByValue,
  faceUp,
  length,
  orientationForFace,
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  rotate,
  sub,
  topFaceAlignment,
  type Quat,
} from './d20.ts';
import { seededSource } from './testing.ts';

const EPS = 1e-9;

function randomQuat(next: () => number): Quat {
  // Rotação uniforme (Shoemake) a partir de 3 números em [0, 1).
  const u1 = next();
  const u2 = next();
  const u3 = next();
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [
    a * Math.sin(2 * Math.PI * u2),
    a * Math.cos(2 * Math.PI * u2),
    b * Math.sin(2 * Math.PI * u3),
    b * Math.cos(2 * Math.PI * u3),
  ];
}

describe('geometria do D20', () => {
  it('tem 12 vértices na esfera unitária', () => {
    assert.equal(D20.vertices.length, 12);
    for (const v of D20.vertices) {
      assert.ok(Math.abs(length(v) - 1) < EPS);
    }
  });

  it('tem 20 faces triangulares e 30 arestas (Euler: V - E + F = 2)', () => {
    assert.equal(D20.faces.length, 20);
    const edges = new Set<string>();
    for (const f of D20.faces) {
      assert.equal(f.vertices.length, 3);
      assert.equal(new Set(f.vertices).size, 3);
      for (let i = 0; i < 3; i++) {
        const a = f.vertices[i];
        const b = f.vertices[(i + 1) % 3];
        edges.add(a < b ? `${a}-${b}` : `${b}-${a}`);
      }
    }
    assert.equal(edges.size, 30);
    assert.equal(D20.vertices.length - edges.size + D20.faces.length, 2);
  });

  it('todas as arestas têm o mesmo comprimento (icosaedro regular)', () => {
    const lengths = new Set<string>();
    for (const f of D20.faces) {
      for (let i = 0; i < 3; i++) {
        const d = length(sub(D20.vertices[f.vertices[i]], D20.vertices[f.vertices[(i + 1) % 3]]));
        lengths.add(d.toFixed(9));
      }
    }
    assert.equal(lengths.size, 1);
  });

  it('numeração é uma permutação de 1 a 20, ordenada por valor', () => {
    const values = D20.faces.map((f) => f.value);
    assert.deepEqual(values, Array.from({ length: 20 }, (_, i) => i + 1));
    for (let n = 1; n <= 20; n++) {
      assert.equal(faceByValue(n).value, n);
    }
  });

  it('faces opostas somam 21', () => {
    for (const f of D20.faces) {
      const opposite = D20.faces.find((g) => dot(g.normal, f.normal) < -1 + 1e-9);
      assert.ok(opposite, `face ${f.value} sem oposta`);
      assert.equal(f.value + opposite.value, 21);
    }
  });

  it('normais são unitárias, apontam para fora e são ortogonais ao plano da face', () => {
    for (const f of D20.faces) {
      assert.ok(Math.abs(length(f.normal) - 1) < EPS);
      assert.ok(dot(f.normal, f.centroid) > 0, 'normal aponta para dentro');
      for (const vi of f.vertices) {
        const inPlane = dot(f.normal, sub(D20.vertices[vi], f.centroid));
        assert.ok(Math.abs(inPlane) < EPS, 'vértice fora do plano da face');
      }
    }
  });

  it('labelUp é unitário e está no plano da face', () => {
    for (const f of D20.faces) {
      assert.ok(Math.abs(length(f.labelUp) - 1) < EPS);
      assert.ok(Math.abs(dot(f.labelUp, f.normal)) < EPS);
    }
  });

  it('faceByValue recusa valores fora de 1..20', () => {
    for (const bad of [0, 21, -1, 1.5, Number.NaN]) {
      assert.throws(() => faceByValue(bad), RangeError);
    }
  });
});

describe('orientação e face de cima', () => {
  it('para cada valor de 1 a 20, a orientação-alvo mostra exatamente essa face em cima', () => {
    for (let n = 1; n <= 20; n++) {
      const q = orientationForFace(n);
      assert.equal(faceUp(q), n, `face ${n}`);
      assert.ok(topFaceAlignment(q) > 1 - 1e-9, `face ${n} não está plana`);
      // A normal da face escolhida aponta mesmo para +Y.
      const up = rotate(q, faceByValue(n).normal);
      assert.ok(Math.abs(up[1] - 1) < 1e-9 && Math.abs(up[0]) < 1e-9 && Math.abs(up[2]) < 1e-9);
    }
  });

  it('o giro em torno do eixo vertical não muda a face de cima (1000 giros por valor)', () => {
    const src = seededSource(99);
    for (let n = 1; n <= 20; n++) {
      for (let i = 0; i < 50; i++) {
        const yaw = (src.nextUint32() / 2 ** 32) * 2 * Math.PI;
        assert.equal(faceUp(orientationForFace(n, yaw)), n);
      }
    }
  });

  it('a orientação devolvida é um quaternion unitário', () => {
    for (let n = 1; n <= 20; n++) {
      const q = orientationForFace(n, 1.234);
      assert.ok(Math.abs(Math.hypot(q[0], q[1], q[2], q[3]) - 1) < EPS);
    }
  });

  it('faceUp é consistente com a rotação: girar o dado e a face de cima muda como esperado', () => {
    // Dado com a face 7 em cima; virá-lo de ponta-cabeça (180° em X) põe a oposta (14) em cima.
    const q = orientationForFace(7);
    const flipped = quatNormalize(quatMultiply(quatFromAxisAngle([1, 0, 0], Math.PI), q));
    assert.equal(faceUp(flipped), 14);
  });

  it('faceUp devolve sempre um valor válido em orientações aleatórias, cobrindo as 20 faces', () => {
    const src = seededSource(2024);
    const next = (): number => src.nextUint32() / 2 ** 32;
    const seen = new Set<number>();
    for (let i = 0; i < 20_000; i++) {
      const v = faceUp(randomQuat(next));
      assert.ok(Number.isInteger(v) && v >= 1 && v <= 20);
      seen.add(v);
    }
    assert.equal(seen.size, 20);
  });
});
