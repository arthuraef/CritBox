/**
 * Mapeamento das faces do D20 para um atlas de texturas (5 x 4 células, uma por
 * número). Esta parte é matemática pura, sem three.js, para poder ser testada.
 *
 * Cada vértice de cada face recebe uma coordenada UV dentro da célula do número
 * correspondente, com o centro da face no centro da célula e o "alto" do número
 * apontando para o primeiro vértice da face.
 */

import { cross, dot, sub, D20, type D20Face, type Vec3 } from '../core/d20.ts';

export const ATLAS_COLS = 5;
export const ATLAS_ROWS = 4;

/** Raio da circunferência que passa pelos 3 vértices de uma face (esfera unitária). */
const FACE_CIRCUMRADIUS = Math.hypot(
  D20.vertices[D20.faces[0].vertices[0]][0] - D20.faces[0].centroid[0],
  D20.vertices[D20.faces[0].vertices[0]][1] - D20.faces[0].centroid[1],
  D20.vertices[D20.faces[0].vertices[0]][2] - D20.faces[0].centroid[2],
);

/** Fração da célula ocupada pelo raio da face (0,45 deixa folga até a borda). */
const CELL_FILL = 0.45;

/** Centro (u, v) da célula do número `value`; v cresce para cima. */
export function cellCenter(value: number): readonly [number, number] {
  const index = value - 1;
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS); // 0 = linha de cima do canvas
  return [(col + 0.5) / ATLAS_COLS, 1 - (row + 0.5) / ATLAS_ROWS];
}

/** UVs dos 3 vértices da face, na mesma ordem de `face.vertices`. */
export function faceUVs(face: D20Face): readonly (readonly [number, number])[] {
  const [cu, cv] = cellCenter(face.value);
  // Visto de fora, com "alto" = labelUp, a direita é labelUp x normal.
  const right: Vec3 = cross(face.labelUp, face.normal);
  return face.vertices.map((vi) => {
    const offset = sub(D20.vertices[vi], face.centroid);
    const x = dot(offset, right) / FACE_CIRCUMRADIUS;
    const y = dot(offset, face.labelUp) / FACE_CIRCUMRADIUS;
    return [cu + (x * CELL_FILL) / ATLAS_COLS, cv + (y * CELL_FILL) / ATLAS_ROWS] as const;
  });
}
