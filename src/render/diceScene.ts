/**
 * Cena three.js do D20. Só desenha e converte entrada: não sorteia nada e não
 * decide resultado. A orientação vem de `core/animation.ts`.
 */

import * as THREE from 'three';
import { D20, dot, type Quat, type Vec3 } from '../core/d20.ts';
import { ATLAS_COLS, ATLAS_ROWS, faceUVs } from './atlas.ts';

/** Altura do centro do dado quando uma face está apoiada na mesa (raio do inscrito). */
export const REST_HEIGHT = dot(D20.faces[0].normal, D20.faces[0].centroid);

const CELL_PX = 256;

function buildNumberAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL_PX;
  canvas.height = ATLAS_ROWS * CELL_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível.');
  }
  // Fundo neutro: a cor do material (skin) multiplica este mapa.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3a2a14';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${CELL_PX * 0.3}px Georgia, serif`;
  for (let value = 1; value <= 20; value++) {
    const col = (value - 1) % ATLAS_COLS;
    const row = Math.floor((value - 1) / ATLAS_COLS);
    const cx = col * CELL_PX + CELL_PX / 2;
    const cy = row * CELL_PX + CELL_PX / 2;
    ctx.fillText(String(value), cx, cy);
    if (value === 6 || value === 9) {
      // Sublinhado para distinguir 6 de 9.
      const w = ctx.measureText(String(value)).width;
      ctx.fillRect(cx - w / 2, cy + CELL_PX * 0.2, w, CELL_PX * 0.025);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const face of D20.faces) {
    const faceUv = faceUVs(face);
    face.vertices.forEach((vi, k) => {
      positions.push(...D20.vertices[vi]);
      uvs.push(faceUv[k][0], faceUv[k][1]);
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals(); // sem índices: normal plana por face
  return geometry;
}

export class DiceScene {
  readonly dice: THREE.Mesh;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  private readonly raycaster = new THREE.Raycaster();
  private readonly material: THREE.MeshStandardMaterial;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Skin "Scuffed Metal" (gratuita): metal escurecido e fosco.
    this.material = new THREE.MeshStandardMaterial({
      map: buildNumberAtlas(),
      color: 0xa3a7ac,
      metalness: 0.85,
      roughness: 0.5,
    });
    this.dice = new THREE.Mesh(buildGeometry(), this.material);
    this.dice.position.y = REST_HEIGHT;
    this.scene.add(this.dice);

    // Uma luz principal, uma de preenchimento quente e ambiente (sem sombras).
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
    key.position.set(2, 5, 3);
    this.scene.add(key);
    const fill = new THREE.PointLight(0xc98a3d, 6, 12);
    fill.position.set(-3, 2, 2);
    this.scene.add(fill);

    // Câmera de cima: a face sorteada (voltada para +Y) fica de frente, sem inclinação.
    // O alto da tela é -Z, o que casa com `uprightYaw` do núcleo.
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, 6.5, 0);
    this.camera.lookAt(0, 0, 0);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  /** Aplica uma pose: deslocamento em relação ao repouso e orientação. */
  setPose(position: Vec3, orientation: Quat): void {
    this.dice.position.set(position[0], REST_HEIGHT + position[1], position[2]);
    this.dice.quaternion.set(orientation[0], orientation[1], orientation[2], orientation[3]);
  }

  /** Gira o dado continuamente (splash). Só visual. */
  spin(dtMs: number): void {
    const axis = new THREE.Vector3(0.35, 1, 0.15).normalize();
    this.dice.rotateOnWorldAxis(axis, dtMs * 0.0011);
  }

  /** Orientação atual do dado, no formato do núcleo. */
  get orientation(): Quat {
    const q = this.dice.quaternion;
    return [q.x, q.y, q.z, q.w];
  }

  /** Verdadeiro se o ponto da tela (em px, relativo à página) atinge o dado. */
  hitTest(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.dice).length > 0;
  }

  /** Gira o dado só para dar retorno visual durante o arrasto (não afeta resultado). */
  nudge(dxPx: number, dyPx: number): void {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(dyPx * 0.01, dxPx * 0.01, 0, 'XYZ'),
    );
    this.dice.quaternion.premultiply(q);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResizeCallback?: () => void;

  setOnResize(cb: () => void): void {
    this.onResizeCallback = cb;
  }

  dispose(): void {
    this.dice.geometry.dispose();
    if (this.material.map) this.material.map.dispose();
    this.material.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.remove();
    }
  }

  private resize(): void {
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Em telas estreitas, afasta a câmera para o dado ocupar a largura.
    const narrow = w / h < 0.8;
    this.camera.fov = narrow ? 48 : 35;
    this.camera.position.set(0, narrow ? 7.5 : 6.5, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    if (this.onResizeCallback) {
      this.onResizeCallback();
    }
  }
}
