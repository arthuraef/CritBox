import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { D20 } from '../core/d20.ts';
import { ATLAS_COLS, ATLAS_ROWS, cellCenter, faceUVs } from './atlas.ts';

describe('atlas de texturas do D20', () => {
  it('cada face usa só a própria célula (sem vazar para a vizinha)', () => {
    for (const face of D20.faces) {
      const [cu, cv] = cellCenter(face.value);
      for (const [u, v] of faceUVs(face)) {
        assert.ok(Math.abs(u - cu) < 0.5 / ATLAS_COLS, `u fora da célula na face ${face.value}`);
        assert.ok(Math.abs(v - cv) < 0.5 / ATLAS_ROWS, `v fora da célula na face ${face.value}`);
      }
    }
  });

  it('as 20 células são distintas e cobrem o atlas', () => {
    const keys = new Set(D20.faces.map((f) => cellCenter(f.value).join(',')));
    assert.equal(keys.size, 20);
    assert.equal(ATLAS_COLS * ATLAS_ROWS, 20);
  });

  it('o centro da face fica no centro da célula (número centrado)', () => {
    for (const face of D20.faces) {
      const uvs = faceUVs(face);
      const mu = (uvs[0][0] + uvs[1][0] + uvs[2][0]) / 3;
      const mv = (uvs[0][1] + uvs[1][1] + uvs[2][1]) / 3;
      const [cu, cv] = cellCenter(face.value);
      assert.ok(Math.abs(mu - cu) < 1e-9 && Math.abs(mv - cv) < 1e-9);
    }
  });

  it('o triângulo em UV não é espelhado (mesmo sentido anti-horário) nem degenerado', () => {
    for (const face of D20.faces) {
      const [a, b, c] = faceUVs(face);
      // Escala para pixels quadrados antes de medir a área com sinal.
      const area =
        ((b[0] - a[0]) * ATLAS_ROWS * (c[1] - a[1]) * ATLAS_COLS -
          (c[0] - a[0]) * ATLAS_ROWS * (b[1] - a[1]) * ATLAS_COLS) /
        2;
      assert.ok(area > 1e-3, `face ${face.value}: área UV ${area} (espelhada ou degenerada)`);
    }
  });

  it('o vértice de "cima" do número fica acima do centro da célula', () => {
    for (const face of D20.faces) {
      const [, cv] = cellCenter(face.value);
      const [, v0] = faceUVs(face)[0];
      assert.ok(v0 > cv, `face ${face.value}: labelUp não aponta para cima no atlas`);
    }
  });

  it('todos os dados poliédricos (D4, D6, D8, D10, D12, D20, D100) mapeiam UVs válidas sem vazar', async () => {
    const { DICE_REGISTRY } = await import('../core/polyhedral.ts');
    const { getDieGrid, dieCellCenter, polyhedralFaceUVs } = await import('./atlas.ts');

    for (const [id, die] of Object.entries(DICE_REGISTRY)) {
      const { cols, rows } = getDieGrid(die);
      assert.ok(cols * rows >= die.facesCount, `${id}: grid insuficiente`);

      die.faces.forEach((face, idx) => {
        const [cu, cv] = dieCellCenter(idx, cols, rows);
        const uvs = polyhedralFaceUVs(die, face, idx, cols, rows);
        assert.equal(uvs.length, face.vertices.length);

        for (const [u, v] of uvs) {
          assert.ok(Math.abs(u - cu) < 0.5 / cols, `${id} face ${face.value}: u vaza da célula`);
          assert.ok(Math.abs(v - cv) < 0.5 / rows, `${id} face ${face.value}: v vaza da célula`);
        }

        // Subtriângulos gerados pelo leque (fan) têm área positiva
        for (let m = 1; m < uvs.length - 1; m++) {
          const a = uvs[0];
          const b = uvs[m];
          const c = uvs[m + 1];
          const area =
            ((b[0] - a[0]) * rows * (c[1] - a[1]) * cols -
              (c[0] - a[0]) * rows * (b[1] - a[1]) * cols) /
            2;
          assert.ok(area > 1e-4, `${id} face ${face.value} sub-triângulo ${m}: área inválida`);
        }
      });
    }
  });
});

