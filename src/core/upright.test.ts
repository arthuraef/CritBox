import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { faceByValue, faceUp, orientationForFace, rotate, uprightYaw } from './d20.ts';

describe('número em pé para a câmera de cima', () => {
  it('para cada valor, a face fica para cima e o topo do número aponta para -Z (alto da tela)', () => {
    for (let n = 1; n <= 20; n++) {
      const q = orientationForFace(n, uprightYaw(n));
      assert.equal(faceUp(q), n);
      const normal = rotate(q, faceByValue(n).normal);
      assert.ok(Math.abs(normal[1] - 1) < 1e-9, `face ${n} não está plana`);
      const up = rotate(q, faceByValue(n).labelUp);
      assert.ok(Math.abs(up[0]) < 1e-9 && Math.abs(up[1]) < 1e-9 && Math.abs(up[2] + 1) < 1e-9,
        `face ${n}: topo do número em [${up.map((x) => x.toFixed(3))}]`);
    }
  });
});
