import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCryptoSource, rollD20, uniformInt } from './random.ts';
import { chiSquareUniform, scriptedSource, seededSource } from './testing.ts';

// Valor crítico do qui-quadrado com 19 graus de liberdade (20 faces) em p = 0,001.
const CHI2_CRITICAL_19DF_P001 = 43.82;
// Limiar bem folgado para a fonte criptográfica (não determinística): falso
// alarme praticamente impossível, mas ainda pega uma fonte claramente viciada.
const CHI2_LOOSE_19DF = 70;

function tally(rolls: number, next: () => number): number[] {
  const counts = new Array<number>(20).fill(0);
  for (let i = 0; i < rolls; i++) {
    counts[next() - 1]++;
  }
  return counts;
}

describe('uniformInt', () => {
  it('rejeita intervalos inválidos', () => {
    const src = seededSource(1);
    assert.throws(() => uniformInt(src, 5, 4), RangeError);
    assert.throws(() => uniformInt(src, 1.5, 4), RangeError);
    assert.throws(() => uniformInt(src, 1, Number.NaN), RangeError);
  });

  it('devolve o próprio valor quando min === max', () => {
    assert.equal(uniformInt(seededSource(2), 7, 7), 7);
  });

  it('descarta valores acima do limite (amostragem por rejeição)', () => {
    // range 20 => limit = floor(2^32 / 20) * 20 = 4294967280.
    // 4294967280..4294967295 devem ser rejeitados; 4294967279 é aceito (mod 20 = 19 => 20).
    const src = scriptedSource([4294967295, 4294967280, 4294967279]);
    assert.equal(uniformInt(src, 1, 20), 20);
    assert.equal(src.consumed, 3);
  });

  it('mapeia o primeiro valor aceito sem viés de borda', () => {
    assert.equal(uniformInt(scriptedSource([0]), 1, 20), 1);
    assert.equal(uniformInt(scriptedSource([19]), 1, 20), 20);
    assert.equal(uniformInt(scriptedSource([20]), 1, 20), 1);
  });

  it('falha se a fonte devolver valor fora de uint32', () => {
    assert.throws(() => uniformInt(scriptedSource([-1]), 1, 20), RangeError);
    assert.throws(() => uniformInt(scriptedSource([4294967296]), 1, 20), RangeError);
    assert.throws(() => uniformInt(scriptedSource([1.5]), 1, 20), RangeError);
  });
});

describe('rollD20', () => {
  it('sempre devolve inteiros entre 1 e 20 (fonte determinística, 200 mil rolagens)', () => {
    const src = seededSource(12345);
    for (let i = 0; i < 200_000; i++) {
      const v = rollD20(src);
      assert.ok(Number.isInteger(v) && v >= 1 && v <= 20, `fora da faixa: ${v}`);
    }
  });

  it('todos os 20 valores aparecem e o qui-quadrado fica abaixo do crítico (p = 0,001)', () => {
    const src = seededSource(987654321);
    const counts = tally(400_000, () => rollD20(src));
    assert.ok(counts.every((c) => c > 0), 'algum valor nunca saiu');
    const chi2 = chiSquareUniform(counts);
    assert.ok(chi2 < CHI2_CRITICAL_19DF_P001, `qui-quadrado ${chi2.toFixed(2)} >= ${CHI2_CRITICAL_19DF_P001}`);
  });

  it('é uniforme em várias sementes (nenhuma com qui-quadrado extremo)', () => {
    // Com p = 0,001 por semente, 10 sementes falham por acaso em ~1% dos casos;
    // as sementes abaixo são fixas, então o resultado é reprodutível.
    for (const seed of [1, 2, 3, 42, 1337, 2024, 31415, 271828, 8675309, 4294967295]) {
      const src = seededSource(seed);
      const counts = tally(100_000, () => rollD20(src));
      const chi2 = chiSquareUniform(counts);
      assert.ok(chi2 < CHI2_CRITICAL_19DF_P001 + 10, `semente ${seed}: qui-quadrado ${chi2.toFixed(2)}`);
    }
  });

  it('não tem correlação óbvia entre rolagens consecutivas (pares 20x20)', () => {
    const src = seededSource(555);
    const cells = new Array<number>(400).fill(0);
    const pairs = 400_000;
    for (let i = 0; i < pairs; i++) {
      const a = rollD20(src) - 1;
      const b = rollD20(src) - 1;
      cells[a * 20 + b]++;
    }
    // 399 graus de liberdade; crítico em p = 0,001 é ~ 460,8.
    const chi2 = chiSquareUniform(cells);
    assert.ok(chi2 < 470, `qui-quadrado dos pares ${chi2.toFixed(1)}`);
  });

  it('fonte criptográfica: faixa correta e distribuição plausível', () => {
    const src = createCryptoSource();
    const counts = tally(200_000, () => rollD20(src));
    assert.equal(counts.reduce((s, c) => s + c, 0), 200_000);
    assert.ok(counts.every((c) => c > 0));
    const chi2 = chiSquareUniform(counts);
    assert.ok(chi2 < CHI2_LOOSE_19DF, `qui-quadrado ${chi2.toFixed(2)}`);
  });
});

describe('createCryptoSource', () => {
  it('falha com clareza se não houver Web Crypto', () => {
    assert.throws(() => createCryptoSource({} as Pick<Crypto, 'getRandomValues'>), /Web Crypto indisponível/);
  });

  it('devolve uint32 válidos', () => {
    const src = createCryptoSource();
    for (let i = 0; i < 1000; i++) {
      const v = src.nextUint32();
      assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 32);
    }
  });
});
