/**
 * Cena three.js do D20 em marfim clássico sobre mesa de feltro de lã.
 * Só desenha e converte entrada: não sorteia nada e não decide resultado.
 * A orientação vem de `core/animation.ts`.
 */

import * as THREE from 'three';
import { D20, dot, type Quat, type Vec3 } from '../core/d20.ts';
import { D20Polyhedral, type PolyhedralDie } from '../core/polyhedral.ts';
import { getDieGrid, polyhedralFaceUVs } from './atlas.ts';
import { RollVFX } from './vfx.ts';
import { SKINS_CATALOG, type DiceSkin } from '../core/skins.ts';

export const DICE_SCALE = 0.8;

/** Altura do centro do dado quando uma face está apoiada na mesa (raio do círculo inscrito * escala). */
export function computeRestHeight(die: PolyhedralDie, scale = DICE_SCALE): number {
  return Math.abs(dot(die.faces[0].normal, die.faces[0].centroid)) * scale;
}

/** Altura padrão do D20 para compatibilidade retroativa. */
export const REST_HEIGHT = dot(D20.faces[0].normal, D20.faces[0].centroid) * DICE_SCALE;

const CELL_PX = 512; // Alta resolução para números nítidos e gravados com precisão

/**
 * Cria a textura do feltro de lã para a mesa de jogo.
 */
function createWoolTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Cor base escura com gradiente suave de iluminação
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.7);
    grad.addColorStop(0, '#1c150e');
    grad.addColorStop(1, '#110d0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Trama de fibras de lã (efeito têxtil entrelaçado)
    ctx.fillStyle = 'rgba(42, 32, 22, 0.18)';
    for (let y = 0; y < size; y += 4) {
      ctx.fillRect(0, y, size, 1.8);
    }
    ctx.fillStyle = 'rgba(28, 20, 14, 0.22)';
    for (let x = 0; x < size; x += 4) {
      ctx.fillRect(x, 0, 1.8, size);
    }

    // Fibras orgânicas aleatórias e ruído de feltro
    ctx.strokeStyle = 'rgba(75, 56, 38, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 3 + Math.random() * 6;
      const angle = Math.random() * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

/**
 * Cria o mapa de reflexão de ambiente para que o marfim reflita a mesa de feltro e a luz do ambiente.
 */
function createIvoryEnvMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Hemisfério superior (luz quente ambiente) e inferior (mesa de feltro de lã escura)
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#5a4632');
    grad.addColorStop(0.3, '#fff4dc');
    grad.addColorStop(0.5, '#402e1c');
    grad.addColorStop(0.65, '#1e1610');
    grad.addColorStop(1, '#110d0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Desenha o atlas com numeração de alta resolução gravada no material da skin.
 * Funciona para qualquer dado poliédrico (D4, D6, D8, D10, D12, D20, D100).
 * Quando `highlightedValue` for informado, a face correspondente recebe destaque luminoso.
 */
export function drawDieAtlas(
  canvas: HTMLCanvasElement,
  die: PolyhedralDie = D20Polyhedral,
  highlightedValue: number | null = null,
  skin: DiceSkin = SKINS_CATALOG[0],
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível.');
  }

  const { cols, rows } = getDieGrid(die);
  const targetW = cols * CELL_PX;
  const targetH = rows * CELL_PX;
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  // Cor base do material da skin
  ctx.fillStyle = skin.previewColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  die.faces.forEach((face, faceIndex) => {
    const col = faceIndex % cols;
    const row = Math.floor(faceIndex / cols);
    const cx = col * CELL_PX + CELL_PX / 2;
    const cy = row * CELL_PX + CELL_PX / 2;

    const value = face.value;
    const isHighlighted = value === highlightedValue;
    const isCrit = value === die.maxValue;
    const isFumble = value === die.minValue;
    const label = face.displayLabel;

    // Tamanho adaptativo da fonte para números simples ou dezenas percentuais (ex: D100 "00".."90")
    const fontScale = label.length > 2 ? 0.22 : (label.length === 2 ? 0.28 : 0.32);
    ctx.font = `bold ${Math.round(CELL_PX * fontScale)}px "Cinzel", "Palatino Linotype", "Book Antiqua", "Georgia", serif`;

    if (isHighlighted) {
      // Halo radial: dourado radiante para sucesso crítico, carmesim para falha crítica, âmbar suave para demais
      const glow = ctx.createRadialGradient(cx, cy, CELL_PX * 0.05, cx, cy, CELL_PX * 0.44);
      if (isFumble) {
        glow.addColorStop(0, 'rgba(255, 60, 80, 0.95)');
        glow.addColorStop(0.4, 'rgba(215, 30, 45, 0.7)');
        glow.addColorStop(0.8, 'rgba(160, 15, 25, 0.35)');
        glow.addColorStop(1, 'rgba(100, 10, 15, 0)');
      } else {
        glow.addColorStop(0, 'rgba(255, 235, 140, 0.95)');
        glow.addColorStop(0.4, 'rgba(230, 165, 45, 0.7)');
        glow.addColorStop(0.8, 'rgba(180, 110, 20, 0.35)');
        glow.addColorStop(1, 'rgba(140, 80, 15, 0)');
      }
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL_PX * 0.44, 0, Math.PI * 2);
      ctx.fill();

      // Círculo fino envolvente
      ctx.strokeStyle = isFumble
        ? 'rgba(255, 80, 100, 0.9)'
        : (isCrit ? 'rgba(255, 220, 100, 0.95)' : skin.material.highlightStroke);
      ctx.lineWidth = CELL_PX * 0.015;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL_PX * 0.34, 0, Math.PI * 2);
      ctx.stroke();

      // Número iluminado com glow e contorno vibrante
      ctx.shadowColor = isFumble ? 'rgba(255, 50, 70, 0.95)' : 'rgba(255, 215, 50, 0.95)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = isFumble ? '#ffedf0' : skin.material.highlightColor;
      ctx.fillText(label, cx, cy);

      ctx.strokeStyle = isFumble ? '#c41829' : skin.material.highlightStroke;
      ctx.lineWidth = CELL_PX * 0.02;
      ctx.strokeText(label, cx, cy);
      ctx.shadowBlur = 0;
    } else {
      // Número gravado no material
      const isDarkSkin = skin.id !== 'ivory';
      if (isDarkSkin) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillText(label, cx + 1.5, cy + 1.5);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillText(label, cx - 1.5, cy - 1.5);
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillText(label, cx - 1.5, cy - 1.5);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.fillText(label, cx + 1.5, cy + 1.5);
      }

      ctx.fillStyle = skin.material.numberColor;
      ctx.fillText(label, cx, cy);
    }

    if (label === '6' || label === '9') {
      const w = ctx.measureText(label).width * 0.9;
      const uy = cy + CELL_PX * 0.22;
      const uh = CELL_PX * 0.028;
      if (isHighlighted) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - w / 2, uy, w, uh);
        ctx.fillStyle = skin.material.highlightStroke;
        ctx.fillRect(cx - w / 2, uy - 1, w, 2);
      } else {
        ctx.fillStyle = skin.material.numberColor;
        ctx.fillRect(cx - w / 2, uy, w, uh);
      }
    }
  });
}

/**
 * Constrói a geometria 3D (malha de triângulos planos) para qualquer poliedro de RPG.
 * Faces poligonais (quadriláteros no D6/D10/D100, pentágonos no D12) são trianguladas
 * em leque convexo com normais planas estritas e UVs correspondentes.
 */
export function buildDieGeometry(die: PolyhedralDie): THREE.BufferGeometry {
  const { cols, rows } = getDieGrid(die);
  const positions: number[] = [];
  const uvs: number[] = [];

  die.faces.forEach((face, faceIndex) => {
    const faceUv = polyhedralFaceUVs(die, face, faceIndex, cols, rows);
    const k = face.vertices.length;
    for (let m = 1; m < k - 1; m++) {
      const idxs = [0, m, m + 1];
      for (const idx of idxs) {
        positions.push(...die.vertices[face.vertices[idx]]);
        uvs.push(faceUv[idx][0], faceUv[idx][1]);
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export class DiceScene {
  readonly dice: THREE.Mesh;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  private readonly raycaster = new THREE.Raycaster();
  private readonly material: THREE.MeshPhysicalMaterial;
  private readonly vfx: RollVFX;

  private readonly atlasCanvas: HTMLCanvasElement;
  private readonly atlasTexture: THREE.CanvasTexture;
  private readonly woolTexture: THREE.CanvasTexture;
  private readonly envTexture: THREE.CanvasTexture;
  private readonly tableMesh: THREE.Mesh;

  private currentDie: PolyhedralDie = D20Polyhedral;
  private currentScaleFactor = 1.0;
  private currentSkin: DiceSkin = SKINS_CATALOG[0];
  private highlightedValue: number | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // 1. Textura do feltro de lã para a mesa
    this.woolTexture = createWoolTexture();
    const tableGeo = new THREE.PlaneGeometry(24, 24);
    const tableMat = new THREE.MeshStandardMaterial({
      map: this.woolTexture,
      roughness: 0.94,
      metalness: 0.0,
    });
    this.tableMesh = new THREE.Mesh(tableGeo, tableMat);
    this.tableMesh.rotation.x = -Math.PI / 2;
    this.tableMesh.position.y = 0;
    this.scene.add(this.tableMesh);

    // 2. Reflexão de ambiente (marfim refletindo a mesa de feltro e a luz)
    this.envTexture = createIvoryEnvMap();
    this.scene.environment = this.envTexture;

    // 3. Atlas de numeração em alta resolução gravado no material
    const { cols, rows } = getDieGrid(this.currentDie);
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = cols * CELL_PX;
    this.atlasCanvas.height = rows * CELL_PX;
    drawDieAtlas(this.atlasCanvas, this.currentDie, null, this.currentSkin);

    this.atlasTexture = new THREE.CanvasTexture(this.atlasCanvas);
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    this.atlasTexture.anisotropy = 8;
    this.atlasTexture.generateMipmaps = true;
    this.atlasTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlasTexture.magFilter = THREE.LinearFilter;

    // 4. Material Físico de Marfim Polido
    this.material = new THREE.MeshPhysicalMaterial({
      map: this.atlasTexture,
      color: 0xfcf6ea, // Marfim clássico, quente e orgânico
      roughness: 0.25, // Toque acetinado de osso polido
      metalness: 0.02, // Dielétrico
      clearcoat: 0.45, // Verniz e polimento natural
      clearcoatRoughness: 0.16,
      reflectivity: 0.5,
    });

    this.dice = new THREE.Mesh(buildDieGeometry(this.currentDie), this.material);
    this.dice.scale.set(DICE_SCALE, DICE_SCALE, DICE_SCALE);
    this.dice.position.y = computeRestHeight(this.currentDie, DICE_SCALE);
    const initQ = this.currentDie.orientationForFace(this.currentDie.maxValue, this.currentDie.uprightYaw(this.currentDie.maxValue));
    this.dice.quaternion.set(initQ[0], initQ[1], initQ[2], initQ[3]);
    this.scene.add(this.dice);

    // 5. Esquema de Iluminação
    // Luz ambiente com reflexão do feltro escuro de baixo e luz quente de cima
    const hemiLight = new THREE.HemisphereLight(0xfff5e4, 0x18120c, 1.3);
    this.scene.add(hemiLight);

    // Luz principal direta
    const keyLight = new THREE.DirectionalLight(0xfff8ed, 2.4);
    keyLight.position.set(2.5, 6, 2.5);
    this.scene.add(keyLight);

    // Luz de preenchimento âmbar suave
    const fillLight = new THREE.PointLight(0xdba04e, 3.2, 14);
    fillLight.position.set(-3.5, 2.5, 2);
    this.scene.add(fillLight);

    // Luz de recorte (rim) sutil
    const rimLight = new THREE.DirectionalLight(0x947854, 1.1);
    rimLight.position.set(0, -2, -3);
    this.scene.add(rimLight);

    // 6. Câmera ortogonal/perspectiva de topo
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, 6.5, 0);
    this.camera.lookAt(0, 0, 0);

    // 7. Efeitos Visuais
    this.vfx = new RollVFX(this.scene);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  /** Retorna o dado poliédrico ativo no momento. */
  get die(): PolyhedralDie {
    return this.currentDie;
  }

  /** Altura de repouso atual do dado na mesa. */
  get restHeight(): number {
    return computeRestHeight(this.currentDie, DICE_SCALE);
  }

  /**
   * Substitui o dado na cena 3D por outro da família poliédrica (D4, D6, D8, D10, D12, D20, D100).
   * Atualiza malha geométrica, atlas de texturas e pose neutra com a face máxima voltada para cima.
   */
  setDie(die: PolyhedralDie): void {
    if (this.currentDie.id === die.id) return;
    this.currentDie = die;
    this.highlightedValue = null;

    // 1. Atualiza malha geométrica
    const oldGeo = this.dice.geometry;
    this.dice.geometry = buildDieGeometry(die);
    oldGeo.dispose();

    // 2. Atualiza textura do atlas para as faces do novo dado
    drawDieAtlas(this.atlasCanvas, this.currentDie, null, this.currentSkin);
    this.atlasTexture.needsUpdate = true;

    // 3. Atualiza orientação padrão mostrando a face máxima voltada para cima
    const targetQ = die.orientationForFace(die.maxValue, die.uprightYaw(die.maxValue));
    this.setPose([0, 0, 0], targetQ, 1.0);
  }

  /** Aplica uma nova skin PBR e redesenha o atlas de texturas. */
  setSkin(skin: DiceSkin): void {
    this.currentSkin = skin;
    this.material.color.setHex(skin.material.color);
    this.material.roughness = skin.material.roughness;
    this.material.metalness = skin.material.metalness;
    this.material.clearcoat = skin.material.clearcoat;
    this.material.clearcoatRoughness = skin.material.clearcoatRoughness;
    drawDieAtlas(this.atlasCanvas, this.currentDie, this.highlightedValue, this.currentSkin);
    this.atlasTexture.needsUpdate = true;
  }

  /** Destaca o número sorteado diretamente na face do dado com brilho e cor adequados à skin. */
  highlightResult(result: number | null): void {
    this.highlightedValue = result;
    drawDieAtlas(this.atlasCanvas, this.currentDie, result, this.currentSkin);
    this.atlasTexture.needsUpdate = true;
  }

  /** Início de rolagem: limpa destaque anterior e aciona transição da aura central. */
  onRollStart(): void {
    this.highlightResult(null);
    this.vfx.onRollStart();
  }

  /** Impacto com a margem ou mesa: flash de luz, onda de choque e faíscas. */
  onImpact(pos: Vec3, strength = 1): void {
    this.vfx.onImpact(pos, strength);
  }

  /** Repouso final no centro: pulso luminoso da aura rúnica com efeitos críticos especiais. */
  onSettle(result?: number): void {
    this.vfx.onSettle(result);
  }

  /** Atualiza partículas, luzes e animações de VFX a cada quadro. */
  updateVFX(dtMs: number, dicePos: Vec3, isRolling: boolean): void {
    this.vfx.update(dtMs, dicePos, isRolling);
  }

  /** Retorna verdadeiro se ainda há efeitos ativos precisando de renderização. */
  hasActiveVFX(): boolean {
    return this.vfx.hasActiveEffects();
  }

  /**
   * Limites visíveis da mesa (em X e Z) onde o centro do dado pode se mover sem sair da margem da tela.
   */
  getPlayfieldBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.y;
    const w = h * this.camera.aspect;
    const margin = DICE_SCALE * 1.15;
    const halfW = Math.max(w / 2 - margin, 0.4);
    const halfH = Math.max(h / 2 - margin, 0.4);
    return {
      minX: -halfW,
      maxX: halfW,
      minZ: -halfH,
      maxZ: halfH,
    };
  }

  /** Aplica uma pose com suporte a redução de tamanho durante a rolagem (ex: 25% menor). */
  setPose(position: Vec3, orientation: Quat, scaleFactor = 1.0): void {
    this.currentScaleFactor = scaleFactor;
    const s = DICE_SCALE * scaleFactor;
    this.dice.scale.set(s, s, s);

    const restH = computeRestHeight(this.currentDie, DICE_SCALE) * scaleFactor;
    this.dice.position.set(position[0], restH + position[1], position[2]);
    this.dice.quaternion.set(orientation[0], orientation[1], orientation[2], orientation[3]);
  }

  /** Gira o dado continuamente (splash). Só visual. */
  spin(dtMs: number): void {
    const axis = new THREE.Vector3(0.35, 1, 0.15).normalize();
    this.dice.rotateOnWorldAxis(axis, dtMs * 0.0011);
  }

  /** Posição atual do dado no plano da mesa [x, z]. */
  get position2D(): readonly [number, number] {
    return [this.dice.position.x, this.dice.position.z];
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
    this.vfx.dispose();
    this.tableMesh.geometry.dispose();
    (this.tableMesh.material as THREE.Material).dispose();
    this.woolTexture.dispose();
    this.envTexture.dispose();
    this.dice.geometry.dispose();
    this.atlasTexture.dispose();
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
