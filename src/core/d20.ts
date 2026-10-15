/**
 * Geometria do D20 (icosaedro regular) e orientação por face.
 *
 * Tudo aqui é matemática pura, sem three.js nem navegador, para que a
 * correspondência "valor sorteado = face de cima" seja verificável em teste.
 * Convenção de eixos igual à do three.js: +Y é para cima, mão direita.
 */

export type Vec3 = readonly [number, number, number];
/** Quaternion unitário [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

const PHI = (1 + Math.sqrt(5)) / 2;
const UP: Vec3 = [0, 1, 0];

export interface D20Face {
  /** Número impresso na face (1 a 20). */
  readonly value: number;
  /** Índices dos 3 vértices (sentido anti-horário visto de fora). */
  readonly vertices: readonly [number, number, number];
  /** Normal unitária apontando para fora. */
  readonly normal: Vec3;
  /** Centro da face (na esfera circunscrita de raio ~1,0). */
  readonly centroid: Vec3;
  /** Direção unitária no plano da face, do centro ao primeiro vértice: o "alto" do número. */
  readonly labelUp: Vec3;
}

export interface D20Geometry {
  /** 12 vértices, normalizados para a esfera de raio 1. */
  readonly vertices: readonly Vec3[];
  /** 20 faces; `faces[i].value` é o número impresso. */
  readonly faces: readonly D20Face[];
}

// ---------- álgebra mínima ----------

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l === 0) {
    throw new Error('Vetor nulo não pode ser normalizado.');
  }
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normalize(axis);
  const s = Math.sin(angle / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
}

/** Rotação de menor arco que leva o vetor unitário `from` ao vetor unitário `to`. */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const d = dot(from, to);
  if (d > 1 - 1e-12) {
    return [0, 0, 0, 1];
  }
  if (d < -1 + 1e-12) {
    // Vetores opostos: gira meia volta em torno de qualquer eixo perpendicular.
    const helper: Vec3 = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return quatFromAxisAngle(cross(from, helper), Math.PI);
  }
  const c = cross(from, to);
  return quatNormalize([c[0], c[1], c[2], 1 + d]);
}

/** Gira o vetor `v` pelo quaternion `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cosHalf = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cosHalf < 0) {
    // Caminho mais curto.
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cosHalf = -cosHalf;
  }
  if (cosHalf > 0.9995) {
    return quatNormalize([
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ]);
  }
  const half = Math.acos(cosHalf);
  const sinHalf = Math.sin(half);
  const wa = Math.sin((1 - t) * half) / sinHalf;
  const wb = Math.sin(t * half) / sinHalf;
  return [
    a[0] * wa + bx * wb,
    a[1] * wa + by * wb,
    a[2] * wa + bz * wb,
    a[3] * wa + bw * wb,
  ];
}

// ---------- construção do icosaedro ----------

function buildVertices(): Vec3[] {
  const raw: Vec3[] = [];
  for (const s1 of [1, -1]) {
    for (const s2 of [1, -1]) {
      raw.push([0, s1, s2 * PHI]);
      raw.push([s1, s2 * PHI, 0]);
      raw.push([s2 * PHI, 0, s1]);
    }
  }
  return raw.map((v) => normalize(v));
}

function buildGeometry(): D20Geometry {
  const vertices = buildVertices();

  // Aresta = menor distância entre vértices distintos. Face = trio de vértices
  // mutuamente a essa distância.
  let edge = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      edge = Math.min(edge, length(sub(vertices[i], vertices[j])));
    }
  }
  const near = (i: number, j: number): boolean =>
    Math.abs(length(sub(vertices[i], vertices[j])) - edge) < 1e-9;

  interface RawFace {
    vertices: [number, number, number];
    normal: Vec3;
    centroid: Vec3;
  }
  const rawFaces: RawFace[] = [];
  for (let a = 0; a < vertices.length; a++) {
    for (let b = a + 1; b < vertices.length; b++) {
      if (!near(a, b)) continue;
      for (let c = b + 1; c < vertices.length; c++) {
        if (!near(a, c) || !near(b, c)) continue;
        const centroidSum: Vec3 = [
          vertices[a][0] + vertices[b][0] + vertices[c][0],
          vertices[a][1] + vertices[b][1] + vertices[c][1],
          vertices[a][2] + vertices[b][2] + vertices[c][2],
        ];
        const centroid: Vec3 = [centroidSum[0] / 3, centroidSum[1] / 3, centroidSum[2] / 3];
        let normal = normalize(cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a])));
        let tri: [number, number, number] = [a, b, c];
        if (dot(normal, centroid) < 0) {
          // Garante sentido anti-horário visto de fora e normal para fora.
          normal = [-normal[0], -normal[1], -normal[2]];
          tri = [a, c, b];
        }
        rawFaces.push({ vertices: tri, normal, centroid });
      }
    }
  }
  if (rawFaces.length !== 20) {
    throw new Error(`Icosaedro inválido: ${rawFaces.length} faces em vez de 20.`);
  }

  // Numeração: faces opostas somam 21. Para cada par de faces opostas, a face de
  // menor índice recebe k (1..10) e a oposta recebe 21 - k.
  const values = new Array<number>(rawFaces.length).fill(0);
  let k = 1;
  for (let i = 0; i < rawFaces.length; i++) {
    if (values[i] !== 0) continue;
    const opposite = rawFaces.findIndex(
      (f, j) => j !== i && dot(f.normal, rawFaces[i].normal) < -1 + 1e-9,
    );
    if (opposite < 0) {
      throw new Error('Face sem oposta: geometria inconsistente.');
    }
    values[i] = k;
    values[opposite] = 21 - k;
    k++;
  }

  const faces: D20Face[] = rawFaces.map((f, i) => {
    const toVertex = sub(vertices[f.vertices[0]], f.centroid);
    return {
      value: values[i],
      vertices: f.vertices,
      normal: f.normal,
      centroid: f.centroid,
      labelUp: normalize(toVertex),
    };
  });
  // Ordena por valor para que `faces[n - 1]` seja a face de número n.
  faces.sort((x, y) => x.value - y.value);
  return { vertices, faces };
}

/** Geometria única do D20 (calculada uma vez). */
export const D20: D20Geometry = buildGeometry();

/** Face impressa com o número `value` (1 a 20). */
export function faceByValue(value: number): D20Face {
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new RangeError(`Valor de face inválido: ${value}`);
  }
  return D20.faces[value - 1];
}

// ---------- orientação ----------

/**
 * Orientação (rotação do dado) que deixa a face `value` voltada para cima,
 * seguida de um giro de `yaw` radianos em torno do eixo vertical. O giro
 * vertical só muda o aspecto: a face de cima continua sendo a mesma.
 */
export function orientationForFace(value: number, yaw = 0): Quat {
  const face = faceByValue(value);
  const toUp = quatFromUnitVectors(face.normal, UP);
  return quatNormalize(quatMultiply(quatFromAxisAngle(UP, yaw), toUp));
}

/**
 * Giro em torno de +Y (em radianos) que deixa o número da face `value`
 * "em pé" para uma câmera que olha de cima para baixo com o alto da tela
 * apontando para -Z: o topo do número (`labelUp`) fica alinhado a -Z.
 */
export function uprightYaw(value: number): number {
  const face = faceByValue(value);
  const seen = rotate(quatFromUnitVectors(face.normal, UP), face.labelUp);
  const target: Vec3 = [0, 0, -1];
  // Ângulo (em torno de +Y) que leva `seen` até `target`.
  return Math.atan2(cross(seen, target)[1], dot(seen, target));
}

/**
 * Face voltada para cima dado a orientação do dado. Escolhe a face cuja normal
 * (já girada) está mais alinhada com +Y. Independe de como a orientação foi
 * produzida, por isso serve como confirmação do resultado.
 */
export function faceUp(orientation: Quat): number {
  let best = D20.faces[0];
  let bestDot = -Infinity;
  for (const face of D20.faces) {
    const d = dot(rotate(orientation, face.normal), UP);
    if (d > bestDot) {
      bestDot = d;
      best = face;
    }
  }
  return best.value;
}

/**
 * Quão "plano" o dado está apoiado: cosseno entre a normal da face de cima e
 * +Y. 1 = perfeitamente plano. Útil para recusar estados ambíguos.
 */
export function topFaceAlignment(orientation: Quat): number {
  return Math.max(...D20.faces.map((f) => dot(rotate(orientation, f.normal), UP)));
}
