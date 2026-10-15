/**
 * Abstração pura para o conjunto de dados poliédricos de RPG (D4, D6, D8, D10, D12, D20, D100).
 *
 * Cada poliedro implementa a interface `PolyhedralDie`, garantindo que o algoritmo de
 * orientação por face, alinhamento visual e verificação de face-up funcionem de forma
 * universal e testável em qualquer dimensão geométrica.
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
  /** Valor numérico da face (usado para regras e sorteio). */
  readonly value: number;
  /** Texto impresso na face (ex.: "1".."20", ou "00".."90" no D100). */
  readonly displayLabel: string;
  /** Índices dos vértices na malha geométrica em ordem anti-horária visto de fora. */
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

function createPolyhedralMethods(
  faces: readonly DieFace[],
): {
  faceByValue: (v: number) => DieFace;
  orientationForFace: (v: number, yaw?: number) => Quat;
  uprightYaw: (v: number) => number;
  faceUp: (orientation: Quat) => number;
  topFaceAlignment: (orientation: Quat) => number;
} {
  const byVal = new Map<number, DieFace>();
  for (const f of faces) byVal.set(f.value, f);

  return {
    faceByValue(value: number): DieFace {
      const f = byVal.get(value);
      if (!f) throw new RangeError(`Valor de face inválido: ${value}`);
      return f;
    },
    orientationForFace(value: number, yaw = 0): Quat {
      const face = byVal.get(value);
      if (!face) throw new RangeError(`Valor de face inválido: ${value}`);
      const toUp = quatFromUnitVectors(face.normal, UP);
      return quatNormalize(quatMultiply(quatFromAxisAngle(UP, yaw), toUp));
    },
    uprightYaw(value: number): number {
      const face = byVal.get(value);
      if (!face) throw new RangeError(`Valor de face inválido: ${value}`);
      const seen = rotate(quatFromUnitVectors(face.normal, UP), face.labelUp);
      const target: Vec3 = [0, 0, -1];
      return Math.atan2(cross(seen, target)[1], dot(seen, target));
    },
    faceUp(orientation: Quat): number {
      let best = faces[0];
      let bestDot = -Infinity;
      for (const face of faces) {
        const d = dot(rotate(orientation, face.normal), UP);
        if (d > bestDot) {
          bestDot = d;
          best = face;
        }
      }
      return best.value;
    },
    topFaceAlignment(orientation: Quat): number {
      return Math.max(...faces.map((f) => dot(rotate(orientation, f.normal), UP)));
    },
  };
}

// ---------------- 1. D4 (Tetraedro Regular) ----------------

function buildD4(): { vertices: readonly Vec3[]; faces: readonly DieFace[] } {
  const inv3 = 1 / Math.sqrt(3);
  const vertices: Vec3[] = [
    [inv3, inv3, inv3],
    [inv3, -inv3, -inv3],
    [-inv3, inv3, -inv3],
    [-inv3, -inv3, inv3],
  ];

  const raw = [
    { value: 1, indices: [0, 1, 2] },
    { value: 2, indices: [0, 2, 3] },
    { value: 3, indices: [0, 3, 1] },
    { value: 4, indices: [1, 3, 2] },
  ];

  const faces: DieFace[] = raw.map((r) => {
    const a = vertices[r.indices[0]];
    const b = vertices[r.indices[1]];
    const c = vertices[r.indices[2]];
    const normal = normalize(cross(sub(b, a), sub(c, a)));
    const centroid: Vec3 = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
    const labelUp = normalize(sub(a, centroid));
    return {
      value: r.value,
      displayLabel: String(r.value),
      vertices: r.indices,
      normal,
      centroid,
      labelUp,
    };
  });

  return { vertices, faces };
}

const D4Geo = buildD4();
const D4Methods = createPolyhedralMethods(D4Geo.faces);

export const D4Polyhedral: PolyhedralDie = {
  id: 'd4',
  name: 'D4 (Tetraedro)',
  facesCount: 4,
  minValue: 1,
  maxValue: 4,
  vertices: D4Geo.vertices,
  faces: D4Geo.faces,
  ...D4Methods,
};

// ---------------- 2. D6 (Cubo Regular) ----------------

function buildD6(): { vertices: readonly Vec3[]; faces: readonly DieFace[] } {
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

  const raw = [
    { value: 1, indices: [7, 6, 2, 3], normal: [0, 1, 0] as Vec3, labelUp: [0, 0, -1] as Vec3 },
    { value: 6, indices: [0, 1, 5, 4], normal: [0, -1, 0] as Vec3, labelUp: [0, 0, 1] as Vec3 },
    { value: 2, indices: [2, 6, 5, 1], normal: [1, 0, 0] as Vec3, labelUp: [0, 1, 0] as Vec3 },
    { value: 5, indices: [4, 7, 3, 0], normal: [-1, 0, 0] as Vec3, labelUp: [0, 1, 0] as Vec3 },
    { value: 3, indices: [4, 5, 6, 7], normal: [0, 0, 1] as Vec3, labelUp: [0, 1, 0] as Vec3 },
    { value: 4, indices: [1, 0, 3, 2], normal: [0, 0, -1] as Vec3, labelUp: [0, 1, 0] as Vec3 },
  ];

  const faces: DieFace[] = raw.map((r) => {
    const centroid: Vec3 = [r.normal[0] * inv, r.normal[1] * inv, r.normal[2] * inv];
    return {
      value: r.value,
      displayLabel: String(r.value),
      vertices: r.indices,
      normal: r.normal,
      centroid,
      labelUp: r.labelUp,
    };
  });

  faces.sort((a, b) => a.value - b.value);
  return { vertices, faces };
}

const D6Geo = buildD6();
const D6Methods = createPolyhedralMethods(D6Geo.faces);

export const D6Polyhedral: PolyhedralDie = {
  id: 'd6',
  name: 'D6 (Cubo)',
  facesCount: 6,
  minValue: 1,
  maxValue: 6,
  vertices: D6Geo.vertices,
  faces: D6Geo.faces,
  ...D6Methods,
};

// ---------------- 3. D8 (Octaedro Regular) ----------------

function buildD8(): { vertices: readonly Vec3[]; faces: readonly DieFace[] } {
  const vertices: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  // Faces opostas somam 9 (1+8, 2+7, 3+6, 4+5)
  const raw = [
    { value: 1, indices: [0, 2, 4] },
    { value: 8, indices: [1, 5, 3] },
    { value: 2, indices: [0, 4, 3] },
    { value: 7, indices: [1, 2, 5] },
    { value: 3, indices: [0, 3, 5] },
    { value: 6, indices: [1, 4, 2] },
    { value: 4, indices: [0, 5, 2] },
    { value: 5, indices: [1, 3, 4] },
  ];

  const faces: DieFace[] = raw.map((r) => {
    const a = vertices[r.indices[0]];
    const b = vertices[r.indices[1]];
    const c = vertices[r.indices[2]];
    const normal = normalize(cross(sub(b, a), sub(c, a)));
    const centroid: Vec3 = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
    const labelUp = normalize(sub(a, centroid));
    return {
      value: r.value,
      displayLabel: String(r.value),
      vertices: r.indices,
      normal,
      centroid,
      labelUp,
    };
  });

  faces.sort((a, b) => a.value - b.value);
  return { vertices, faces };
}

const D8Geo = buildD8();
const D8Methods = createPolyhedralMethods(D8Geo.faces);

export const D8Polyhedral: PolyhedralDie = {
  id: 'd8',
  name: 'D8 (Octaedro)',
  facesCount: 8,
  minValue: 1,
  maxValue: 8,
  vertices: D8Geo.vertices,
  faces: D8Geo.faces,
  ...D8Methods,
};

// ---------------- 4. D10 & D100 (Trapezoedro Pentagonal) ----------------

function buildTrapezohedron(isD100 = false): { vertices: readonly Vec3[]; faces: readonly DieFace[] } {
  const topPole: Vec3 = [0, 1, 0];
  const bottomPole: Vec3 = [0, -1, 0];
  const girdle: Vec3[] = [];
  const h = 0.28;
  const r = Math.sqrt(1 - h * h);

  for (let k = 0; k < 10; k++) {
    const angle = (k / 10) * Math.PI * 2;
    const y = k % 2 === 0 ? h : -h;
    girdle.push([r * Math.cos(angle), y, r * Math.sin(angle)]);
  }
  const vertices: Vec3[] = [topPole, bottomPole, ...girdle];

  // Faces opostas somam 11 para D10 (ou pares equivalentes para D100)
  // 5 faces superiores e 5 inferiores
  const rawPairs: [number, number][] = [
    [1, 10],
    [2, 9],
    [3, 8],
    [4, 7],
    [5, 6],
  ];

  interface HalfFace {
    indices: readonly number[];
    normal: Vec3;
    centroid: Vec3;
    labelUp: Vec3;
  }

  const topHalf: HalfFace[] = [];
  for (let j = 0; j < 5; j++) {
    const even = j * 2;
    const oddLeft = (even + 9) % 10;
    const oddRight = (even + 1) % 10;
    const topIndices = [0, oddRight + 2, even + 2, oddLeft + 2];
    const ta = vertices[topIndices[0]];
    const tb = vertices[topIndices[1]];
    const tc = vertices[topIndices[2]];
    const td = vertices[topIndices[3]];
    const tCentroid: Vec3 = [
      (ta[0] + tb[0] + tc[0] + td[0]) / 4,
      (ta[1] + tb[1] + tc[1] + td[1]) / 4,
      (ta[2] + tb[2] + tc[2] + td[2]) / 4,
    ];
    const tNormal = normalize(cross(sub(tb, ta), sub(td, ta)));
    const tLabelUp = normalize(sub(ta, tCentroid));
    topHalf.push({ indices: topIndices, normal: tNormal, centroid: tCentroid, labelUp: tLabelUp });
  }

  const botHalf: HalfFace[] = [];
  for (let j = 0; j < 5; j++) {
    const odd = j * 2 + 1;
    const evenL = (odd + 9) % 10;
    const evenR = (odd + 1) % 10;
    const botIndices = [1, evenL + 2, odd + 2, evenR + 2];
    const ba = vertices[botIndices[0]];
    const bb = vertices[botIndices[1]];
    const bc = vertices[botIndices[2]];
    const bd = vertices[botIndices[3]];
    const bCentroid: Vec3 = [
      (ba[0] + bb[0] + bc[0] + bd[0]) / 4,
      (ba[1] + bb[1] + bc[1] + bd[1]) / 4,
      (ba[2] + bb[2] + bc[2] + bd[2]) / 4,
    ];
    const bNormal = normalize(cross(sub(bb, ba), sub(bd, ba)));
    const bLabelUp = normalize(sub(bc, bCentroid));
    botHalf.push({ indices: botIndices, normal: bNormal, centroid: bCentroid, labelUp: bLabelUp });
  }

  const faces: DieFace[] = [];
  for (let j = 0; j < 5; j++) {
    const topVal = rawPairs[j][0];
    const botVal = rawPairs[j][1];
    const top = topHalf[j];
    // No trapezoedro pentagonal, a face oposta a j no topo é a face (j + 2) % 5 na base
    const bot = botHalf[(j + 2) % 5];

    const topLabel = isD100 ? `${(topVal - 1) * 10}`.padStart(2, '0') : String(topVal);
    const botLabel = isD100 ? `${(botVal - 1) * 10}`.padStart(2, '0') : String(botVal);

    faces.push({
      value: isD100 ? (topVal - 1) * 10 : topVal,
      displayLabel: topLabel,
      vertices: top.indices,
      normal: top.normal,
      centroid: top.centroid,
      labelUp: top.labelUp,
    });
    faces.push({
      value: isD100 ? (botVal - 1) * 10 : botVal,
      displayLabel: botLabel,
      vertices: bot.indices,
      normal: bot.normal,
      centroid: bot.centroid,
      labelUp: bot.labelUp,
    });
  }

  faces.sort((a, b) => a.value - b.value);
  return { vertices, faces };
}

const D10Geo = buildTrapezohedron(false);
const D10Methods = createPolyhedralMethods(D10Geo.faces);

export const D10Polyhedral: PolyhedralDie = {
  id: 'd10',
  name: 'D10 (Trapezoedro)',
  facesCount: 10,
  minValue: 1,
  maxValue: 10,
  vertices: D10Geo.vertices,
  faces: D10Geo.faces,
  ...D10Methods,
};

const D100Geo = buildTrapezohedron(true);
const D100Methods = createPolyhedralMethods(D100Geo.faces);

export const D100Polyhedral: PolyhedralDie = {
  id: 'd100',
  name: 'D100 (Dezenas)',
  facesCount: 10,
  minValue: 0,
  maxValue: 90,
  vertices: D100Geo.vertices,
  faces: D100Geo.faces,
  ...D100Methods,
};

// ---------------- 5. D12 (Dodecaedro Regular) ----------------

function buildD12(): { vertices: readonly Vec3[]; faces: readonly DieFace[] } {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const INV_PHI = 1 / PHI;

  const rawVerts: Vec3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        rawVerts.push([x, y, z]);
      }
    }
  }
  for (const y of [-PHI, PHI]) {
    for (const z of [-INV_PHI, INV_PHI]) {
      rawVerts.push([0, y, z]);
    }
  }
  for (const x of [-INV_PHI, INV_PHI]) {
    for (const z of [-PHI, PHI]) {
      rawVerts.push([x, 0, z]);
    }
  }
  for (const x of [-PHI, PHI]) {
    for (const y of [-INV_PHI, INV_PHI]) {
      rawVerts.push([x, y, 0]);
    }
  }
  const vertices: Vec3[] = rawVerts.map((v) => normalize(v));

  // As 12 normais do dodecaedro correspondem aos 12 vértices do icosaedro dual
  const rawNormals: Vec3[] = [
    [0, 1, PHI],
    [0, -1, -PHI], // oposto
    [0, -1, PHI],
    [0, 1, -PHI],  // oposto
    [1, PHI, 0],
    [-1, -PHI, 0], // oposto
    [-1, PHI, 0],
    [1, -PHI, 0],  // oposto
    [PHI, 0, 1],
    [-PHI, 0, -1], // oposto
    [-PHI, 0, 1],
    [PHI, 0, -1],  // oposto
  ];

  // Pares opostos somam 13: (1, 12), (2, 11), (3, 10), (4, 9), (5, 8), (6, 7)
  const values = [1, 12, 2, 11, 3, 10, 4, 9, 5, 8, 6, 7];

  const faces: DieFace[] = rawNormals.map((rn, idx) => {
    const normal = normalize(rn);
    const indexed = vertices.map((v, i) => ({ i, v, dot: dot(normal, v) }));
    indexed.sort((a, b) => b.dot - a.dot);
    const top5 = indexed.slice(0, 5);

    const centroid: Vec3 = [
      top5.reduce((s, x) => s + x.v[0], 0) / 5,
      top5.reduce((s, x) => s + x.v[1], 0) / 5,
      top5.reduce((s, x) => s + x.v[2], 0) / 5,
    ];

    // Ordena os 5 vértices no sentido anti-horário
    const u = normalize(sub(top5[0].v, [normal[0] * dot(top5[0].v, normal), normal[1] * dot(top5[0].v, normal), normal[2] * dot(top5[0].v, normal)]));
    const w = cross(normal, u);
    top5.sort((a, b) => {
      const angleA = Math.atan2(dot(a.v, w), dot(a.v, u));
      const angleB = Math.atan2(dot(b.v, w), dot(b.v, u));
      return angleA - angleB;
    });

    const orderedIndices = top5.map((x) => x.i);
    const labelUp = normalize(sub(vertices[orderedIndices[0]], centroid));

    return {
      value: values[idx],
      displayLabel: String(values[idx]),
      vertices: orderedIndices,
      normal,
      centroid,
      labelUp,
    };
  });

  faces.sort((a, b) => a.value - b.value);
  return { vertices, faces };
}

const D12Geo = buildD12();
const D12Methods = createPolyhedralMethods(D12Geo.faces);

export const D12Polyhedral: PolyhedralDie = {
  id: 'd12',
  name: 'D12 (Dodecaedro)',
  facesCount: 12,
  minValue: 1,
  maxValue: 12,
  vertices: D12Geo.vertices,
  faces: D12Geo.faces,
  ...D12Methods,
};

// ---------------- 6. D20 (Icosaedro Regular) ----------------

const d20FacesWithLabel: DieFace[] = D20.faces.map((f) => ({
  value: f.value,
  displayLabel: String(f.value),
  vertices: f.vertices,
  normal: f.normal,
  centroid: f.centroid,
  labelUp: f.labelUp,
}));

const d20Methods = createPolyhedralMethods(d20FacesWithLabel);

export const D20Polyhedral: PolyhedralDie = {
  id: 'd20',
  name: 'D20 (Icosaedro)',
  facesCount: 20,
  minValue: 1,
  maxValue: 20,
  vertices: D20.vertices,
  faces: d20FacesWithLabel,
  ...d20Methods,
};

// ---------------- Catálogo Universal ----------------

export const DICE_REGISTRY: Readonly<Record<string, PolyhedralDie>> = {
  d4: D4Polyhedral,
  d6: D6Polyhedral,
  d8: D8Polyhedral,
  d10: D10Polyhedral,
  d12: D12Polyhedral,
  d20: D20Polyhedral,
  d100: D100Polyhedral,
};
