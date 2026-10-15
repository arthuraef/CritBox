import * as THREE from 'three';
import type { Vec3 } from '../core/d20.ts';

const MAX_PARTICLES = 120;
const MAX_RINGS = 3;

function createSparkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 220, 120, 0.9)');
    gradient.addColorStop(0.5, 'rgba(235, 150, 40, 0.4)');
    gradient.addColorStop(1, 'rgba(200, 80, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRuneAuraTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;

    // Fundo transparente
    ctx.clearRect(0, 0, size, size);

    // Brilho radial de fundo
    const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, cx - 10);
    bgGrad.addColorStop(0, 'rgba(230, 170, 70, 0.35)');
    bgGrad.addColorStop(0.5, 'rgba(180, 110, 30, 0.15)');
    bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 10, 0, Math.PI * 2);
    ctx.fill();

    // Anéis concêntricos dourados
    ctx.strokeStyle = '#e6b349';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(245, 215, 140, 0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(215, 150, 50, 0.5)';
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    // 20 marcas místicas em volta do círculo (homenagem às 20 faces)
    ctx.strokeStyle = '#f5d78e';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const rInner = cx * (i % 5 === 0 ? 0.78 : 0.82);
      const rOuter = cx * 0.88;
      const x1 = cx + Math.cos(angle) * rInner;
      const y1 = cy + Math.sin(angle) * rInner;
      const x2 = cx + Math.cos(angle) * rOuter;
      const y2 = cy + Math.sin(angle) * rOuter;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  lifeMs: number;
  maxLifeMs: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  ageMs: number;
  maxAgeMs: number;
  startScale: number;
  endScale: number;
  active: boolean;
}

export class RollVFX {
  private readonly group = new THREE.Group();

  // Partículas
  private readonly particles: Particle[] = [];
  private readonly particleGeo: THREE.BufferGeometry;
  private readonly particleMat: THREE.PointsMaterial;
  private readonly particlePoints: THREE.Points;
  private readonly posAttr: THREE.Float32BufferAttribute;
  private readonly colAttr: THREE.Float32BufferAttribute;
  private readonly sparkTex: THREE.CanvasTexture;

  // Ondas de choque no impacto
  private readonly rings: ShockwaveRing[] = [];
  private readonly ringGeo: THREE.RingGeometry;

  // Aura rúnica central
  private readonly auraMesh: THREE.Mesh;
  private readonly auraMat: THREE.MeshBasicMaterial;
  private readonly auraTex: THREE.CanvasTexture;
  private auraPulseMs = 0;
  private auraBaseOpacity = 0.2;
  private isRolling = false;

  // Luz dinâmica de impacto
  private readonly impactLight: THREE.PointLight;

  constructor(private readonly scene: THREE.Scene) {
    // 1. Partículas (Points)
    this.sparkTex = createSparkTexture();
    this.particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);

    this.posAttr = new THREE.Float32BufferAttribute(positions, 3);
    this.colAttr = new THREE.Float32BufferAttribute(colors, 3);
    this.particleGeo.setAttribute('position', this.posAttr);
    this.particleGeo.setAttribute('color', this.colAttr);

    this.particleMat = new THREE.PointsMaterial({
      size: 0.28,
      map: this.sparkTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });
    this.particlePoints = new THREE.Points(this.particleGeo, this.particleMat);
    this.particlePoints.frustumCulled = false;
    this.group.add(this.particlePoints);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        lifeMs: 0,
        maxLifeMs: 1,
        size: 0.2,
        r: 1,
        g: 0.8,
        b: 0.3,
      });
    }

    // 2. Ondas de choque nos impactos (RingGeometry)
    this.ringGeo = new THREE.RingGeometry(0.18, 0.32, 32);
    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xf5c358,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.005;
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({
        mesh,
        ageMs: 0,
        maxAgeMs: 380,
        startScale: 0.4,
        endScale: 2.2,
        active: false,
      });
    }

    // 3. Aura rúnica no centro (onde o dado finaliza a rolagem)
    this.auraTex = createRuneAuraTexture();
    this.auraMat = new THREE.MeshBasicMaterial({
      map: this.auraTex,
      transparent: true,
      opacity: this.auraBaseOpacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const auraGeo = new THREE.PlaneGeometry(2.4, 2.4);
    this.auraMesh = new THREE.Mesh(auraGeo, this.auraMat);
    this.auraMesh.rotation.x = -Math.PI / 2;
    this.auraMesh.position.set(0, 0.002, 0);
    this.group.add(this.auraMesh);

    // 4. Luz de impacto (flash)
    this.impactLight = new THREE.PointLight(0xffbe44, 0, 7);
    this.impactLight.position.set(0, 0.6, 0);
    this.group.add(this.impactLight);

    this.scene.add(this.group);
  }

  onRollStart(): void {
    this.isRolling = true;
    this.auraBaseOpacity = 0.45;
  }

  onImpact(pos: Vec3, strength = 1): void {
    // 1. Flash de luz dinâmico
    this.impactLight.position.set(pos[0], pos[1] + 0.4, pos[2]);
    this.impactLight.intensity = 4.5 * Math.min(Math.max(strength, 0.5), 1.2);

    // 2. Onda de choque no chão
    this.triggerShockwave(pos[0], pos[2], 1.4 * strength);

    // 3. Explosão de faíscas brilhantes
    const count = Math.round(18 * strength);
    this.emitBurst(pos, count);
  }

  onSettle(result?: number): void {
    this.isRolling = false;
    if (result === 20) {
      // Sucesso Crítico (Baldur's Gate 3): pulso radiante dourado, ondas expansivas e faíscas ascendentes
      this.auraPulseMs = 1200;
      this.auraBaseOpacity = 0.85;
      this.impactLight.color.setHex(0xffd700);
      this.impactLight.position.set(0, 0.8, 0);
      this.impactLight.intensity = 6.0;
      this.triggerShockwave(0, 0, 2.5);
      this.emitBurst([0, 0.1, 0], 36, { r: 1.0, g: 0.85, b: 0.2 });
    } else if (result === 1) {
      // Falha Crítica (Baldur's Gate 3): pulso carmesim rubi sombrio
      this.auraPulseMs = 1000;
      this.auraBaseOpacity = 0.75;
      this.impactLight.color.setHex(0xff2244);
      this.impactLight.position.set(0, 0.7, 0);
      this.impactLight.intensity = 5.0;
      this.triggerShockwave(0, 0, 2.0);
      this.emitBurst([0, 0.1, 0], 28, { r: 1.0, g: 0.12, b: 0.22 });
    } else {
      this.auraPulseMs = 600;
      this.auraBaseOpacity = 0.25;
      this.impactLight.color.setHex(0xffbe44);
      this.emitBurst([0, 0.1, 0], 12);
    }
  }

  private triggerShockwave(x: number, z: number, scaleFactor: number): void {
    const ring = this.rings.find((r) => !r.active) ?? this.rings[0];
    ring.active = true;
    ring.ageMs = 0;
    ring.startScale = 0.3;
    ring.endScale = 1.8 * scaleFactor;
    ring.mesh.position.set(x, 0.005, z);
    ring.mesh.scale.set(ring.startScale, ring.startScale, 1);
    ring.mesh.material.opacity = 0.85;
    ring.mesh.visible = true;
  }

  private emitBurst(origin: Vec3, count: number, color?: { r: number; g: number; b: number }): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (!p.active) {
        p.active = true;
        p.x = origin[0] + (Math.random() - 0.5) * 0.15;
        p.y = Math.max(origin[1] + 0.05, 0.02);
        p.z = origin[2] + (Math.random() - 0.5) * 0.15;

        // Dispersão hemisférica com impulsão para cima
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.2;
        p.vx = Math.cos(angle) * speed;
        p.vz = Math.sin(angle) * speed;
        p.vy = 0.8 + Math.random() * 2.5;

        p.lifeMs = 0;
        p.maxLifeMs = 280 + Math.random() * 250;
        p.size = 0.24 + Math.random() * 0.15;
        if (color) {
          p.r = color.r;
          p.g = color.g;
          p.b = color.b;
        } else {
          p.r = 1.0;
          p.g = 0.75 + Math.random() * 0.25;
          p.b = 0.2 + Math.random() * 0.2;
        }
        spawned++;
      }
    }
  }

  private emitTrail(pos: Vec3): void {
    // 1 partícula a cada quadro durante o deslocamento no ar
    for (const p of this.particles) {
      if (!p.active) {
        p.active = true;
        p.x = pos[0] + (Math.random() - 0.5) * 0.2;
        p.y = pos[1] + (Math.random() - 0.5) * 0.2;
        p.z = pos[2] + (Math.random() - 0.5) * 0.2;
        p.vx = (Math.random() - 0.5) * 0.3;
        p.vy = (Math.random() - 0.5) * 0.3;
        p.vz = (Math.random() - 0.5) * 0.3;
        p.lifeMs = 0;
        p.maxLifeMs = 180 + Math.random() * 120;
        p.size = 0.18;
        p.r = 1.0;
        p.g = 0.85;
        p.b = 0.4;
        break;
      }
    }
  }

  update(dtMs: number, dicePos: Vec3, isRolling: boolean): void {
    const dtSec = dtMs * 0.001;

    // Rastro durante rolagem
    if (isRolling) {
      this.emitTrail(dicePos);
      this.auraMesh.rotation.z += dtSec * 0.18; // rotação mística sutil
    }

    // Amortecimento do flash de luz
    if (this.impactLight.intensity > 0.01) {
      this.impactLight.intensity *= Math.exp(-dtMs / 80);
    } else {
      this.impactLight.intensity = 0;
    }

    // Atualização da aura no centro
    if (this.auraPulseMs > 0) {
      this.auraPulseMs -= dtMs;
      const pulseRatio = Math.max(this.auraPulseMs / 600, 0);
      this.auraMat.opacity = this.auraBaseOpacity + 0.65 * pulseRatio;
    } else {
      // Respiração ociosa sutil
      const breathe = Math.sin(performance.now() * 0.002) * 0.05;
      this.auraMat.opacity = this.auraBaseOpacity + breathe;
    }

    // Atualização das ondas de choque
    for (const r of this.rings) {
      if (r.active) {
        r.ageMs += dtMs;
        const u = r.ageMs / r.maxAgeMs;
        if (u >= 1) {
          r.active = false;
          r.mesh.visible = false;
        } else {
          const scale = r.startScale + (r.endScale - r.startScale) * (1 - (1 - u) * (1 - u));
          r.mesh.scale.set(scale, scale, 1);
          r.mesh.material.opacity = 0.85 * (1 - u);
        }
      }
    }

    // Atualização das partículas
    const posArray = this.posAttr.array as Float32Array;
    const colArray = this.colAttr.array as Float32Array;
    let anyActive = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.active) {
        anyActive = true;
        p.lifeMs += dtMs;
        const u = p.lifeMs / p.maxLifeMs;
        if (u >= 1) {
          p.active = false;
          posArray[i * 3 + 1] = -999; // oculta fora da visão
          colArray[i * 3 + 0] = 0;
          colArray[i * 3 + 1] = 0;
          colArray[i * 3 + 2] = 0;
        } else {
          // Física: movimento + gravidade + arrasto
          p.x += p.vx * dtSec;
          p.y += p.vy * dtSec;
          p.z += p.vz * dtSec;
          p.vy -= 7.5 * dtSec; // gravidade
          p.vx *= 0.98;
          p.vz *= 0.98;

          if (p.y < 0.01) {
            p.y = 0.01;
            p.vy = -p.vy * 0.3; // pequeno quique no chão
          }

          posArray[i * 3 + 0] = p.x;
          posArray[i * 3 + 1] = p.y;
          posArray[i * 3 + 2] = p.z;

          const fade = 1 - u;
          colArray[i * 3 + 0] = p.r * fade;
          colArray[i * 3 + 1] = p.g * fade;
          colArray[i * 3 + 2] = p.b * fade;
        }
      } else {
        posArray[i * 3 + 1] = -999;
      }
    }

    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  hasActiveEffects(): boolean {
    if (this.isRolling) return true;
    if (this.auraPulseMs > 0) return true;
    if (this.impactLight.intensity > 0.01) return true;
    for (const r of this.rings) {
      if (r.active) return true;
    }
    for (const p of this.particles) {
      if (p.active) return true;
    }
    return false;
  }

  dispose(): void {
    this.sparkTex.dispose();
    this.particleGeo.dispose();
    this.particleMat.dispose();

    this.ringGeo.dispose();
    for (const r of this.rings) {
      r.mesh.material.dispose();
    }

    this.auraTex.dispose();
    this.auraMesh.geometry.dispose();
    this.auraMat.dispose();

    this.scene.remove(this.group);
  }
}
