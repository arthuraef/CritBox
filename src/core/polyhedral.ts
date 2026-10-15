/**
 * Abstração pura para o conjunto de dados poliédricos (D4, D6, D8, D10, D12, D20, D100).
 *
 * Cada poliedro implementa a interface `PolyhedralDie`, garantindo que o algoritmo de
 * orientação por face, alinhamento visual e verificação de face-up funcionem de forma
 * universal e testável em qualquer dimensão platônica.
 */

import {
  cross,
  dot,
  faceByValue as d20FaceByValue,
  faceUp as d20FaceUp,
  normalize,
  orientationForFace as d20OrientationForFace,
  quatFromAxisAngle,
  quatFromUnitVectors,
  quatMultiply,
  quatNormalize,
  rotate,
  sub,
  topFaceAlignment as d20TopFaceAlignment,
  uprightYaw as d20UprightYaw,
  D20,
  type Quat,
  type Vec3,
} from './d20.ts';

const UP: Vec3 = [0, 1, 0];

export interface DieFace {
  /** Número impresso na face. */
  readonly value: number;
  /** Índices dos vértices na malha geométrica. */
  readonly vertices: readonly number[];
  /** Normal unitária apontando para fora do poliedro. */
  readonly normal: Vec3;
  /** Centro da face no espaço normalizado. */
  readonly centroid: Vec3;
  /** Vetor unitário no plano da face que indica o "alto" do número. */
  readonly labelUp: Vec3;
}

export interface PolyhedralDie {
  readonly id: string;
  readonly name: string;
  readonly facesCount: number;
  readonly minValue: number;
  readonly maxValue: number;
  readonly vertices: readonly Vec3[];
  readonly faces: readonly DieFace[];
  faceByValue(value: number): DieFace;
  orientationForFace(value: number, yaw?: number): Quat;
  uprightYaw(value: number): number;
  faceUp(orientation: Quat): number;
  topFaceAlignment(orientation: Quat): number;
}

/** D20 canônico do CritBox implementando a interface universal PolyhedralDie. */
export const D20Polyhedral: PolyhedralDie = {
  id: 'd20',
  name: 'D20 (Icosaedro)',
  facesCount: 20,
  minValue: 1,
  maxValue: 20,
  vertices: D20.vertices,
  faces: D20.faces,
  faceByValue: d20FaceByValue,
  orientationForFace: d20OrientationForFace,
  uprightYaw: d20UprightYaw,
  faceUp: d20FaceUp,
  topFaceAlignment: d20TopFaceAlignment,
};

// ---------------- D6 (Cubo Regular) ----------------

function buildD6Geometry(): { vertices: readonly Vec3[]; faces: readonly DieFace[] } {
  // 8 vértices do cubo unitário (raio ~1 na esfera circunscrita)
  const inv = 1 / Math.sqrt(3);
  const vertices: Vec3[] = [
    [-inv, -inv, -inv], // 0: ---
    [inv, -inv, -inv],  // 1: +--
    [inv, inv, -inv],   // 2: ++-
    [-inv, inv, -inv],  // 3: -+-
    [-inv, -inv, inv],  // 4: --+
    [inv, -inv, inv],   // 5: +-+
    [inv, inv, inv],    // 6: +++
    [-inv, inv, inv],   // 7: -++
  ];

  // 6 faces quadradas divididas em triângulos ou quads.
  // Regra canônica de RPG para D6: faces opostas somam 7.
  // 1 (topo +Y) oposto a 6 (base -Y)
  // 2 (+X) oposto a 5 (-X)
  // 3 (+Z) oposto a 4 (-Z)
  interface RawD6Face {
    value: number;
    indices: readonly number[];
    normal: Vec3;
    labelUp: Vec3;
  }

  const raw: RawD6Face[] = [
    { value: 1, indices: [3, 2, 6, 7], normal: [0, 1, 0], labelUp: [0, 0, -1] },
    { value: 6, indices: [4, 5, 1, 0], normal: [0, -1, 0], labelUp: [0, 0, 1] },
    { value: 2, indices: [1, 5, 6, 2], normal: [1, 0, 0], labelUp: [0, 1, 0] },
    { value: 5, indices: [0, 3, 7, 4], normal: [-1, 0, 0], labelUp: [0, 1, 0] },
    { value: 3, indices: [7, 6, 5, 4], normal: [0, 0, 1], labelUp: [0, 1, 0] },
    { value: 4, indices: [2, 3, 0, 1], normal: [0, 0, -1], labelUp: [0, 1, 0] },
  ];

  const faces: DieFace[] = raw.map((r) => {
    // Centroide da face é simplesmente o vetor normal escalado por 1/sqrt(3)
    const centroid: Vec3 = [r.normal[0] * inv, r.normal[1] * inv, r.normal[2] * inv];
    return {
      value: r.value,
      vertices: r.indices,
      normal: r.normal,
      centroid,
      labelUp: r.labelUp,
    };
  });

  faces.sort((a, b) => a.value - b.value);
  return { vertices, faces };
}

const D6Geo = buildD6Geometry();

export const D6Polyhedral: PolyhedralDie = {
  id: 'd6',
  name: 'D6 (Cubo)',
  facesCount: 6,
  minValue: 1,
  maxValue: 6,
  vertices: D6Geo.vertices,
  faces: D6Geo.faces,
  faceByValue(value: number): DieFace {
    if (!Number.isInteger(value) || value < 1 || value > 6) {
      throw new RangeError(`Valor inválido para D6: ${value}`);
    }
    return D6Geo.faces[value - 1];
  },
  orientationForFace(value: number, yaw = 0): Quat {
    const face = this.faceByValue(value);
    const toUp = quatFromUnitVectors(face.normal, UP);
    return quatNormalize(quatMultiply(quatFromAxisAngle(UP, yaw), toUp));
  },
  uprightYaw(value: number): number {
    const face = this.faceByValue(value);
    const seen = rotate(quatFromUnitVectors(face.normal, UP), face.labelUp);
    const target: Vec3 = [0, 0, -1];
    return Math.atan2(cross(seen, target)[1], dot(seen, target));
  },
  faceUp(orientation: Quat): number {
    let best = D6Geo.faces[0];
    let bestDot = -Infinity;
    for (const face of D6Geo.faces) {
      const d = dot(rotate(orientation, face.normal), UP);
      if (d > bestDot) {
        bestDot = d;
        best = face;
      }
    }
    return best.value;
  },
  topFaceAlignment(orientation: Quat): number {
    return Math.max(...D6Geo.faces.map((f) => dot(rotate(orientation, f.normal), UP)));
  },
};

/** Catálogo de dados poliédricos disponíveis. */
export const DICE_REGISTRY: Readonly<Record<string, PolyhedralDie>> = {
  d20: D20Polyhedral,
  d6: D6Polyhedral,
};
