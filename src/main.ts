import { createCryptoSource, createVisualRandom } from './core/random.ts';
import { faceUp, orientationForFace, uprightYaw } from './core/d20.ts';
import { planRoll, type RollPlan } from './core/animation.ts';
import { FaceMismatchError, RollController, type RollTicket } from './core/rollController.ts';
import { DiceScene } from './render/diceScene.ts';
import { HistoryStore, type KeyValueStorage } from './core/history.ts';
import { setupHistoryView } from './ui/historyView.ts';
import { SettingsStore } from './core/settings.ts';
import { EventCursor, hapticFor, planFeedback, specialFor, type FeedbackEvent, type FeedbackKind } from './core/feedback.ts';
import { SoundPlayer } from './audio/sound.ts';
import { hapticsSupported, vibrate } from './audio/haptics.ts';
import { setupSettingsView } from './ui/settingsView.ts';
import { setupChangelogView } from './ui/changelogView.ts';
import { setupDiceSelector } from './ui/diceSelector.ts';
import { SkinsStore } from './core/skins.ts';
import { WebMockRewardedAdProvider } from './core/ads.ts';
import { setupSkinsView } from './ui/skinsView.ts';

declare const __APP_VERSION__: string;

const stage = document.getElementById('stage') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const critBanner = document.getElementById('crit-banner') as HTMLElement | null;
const critBannerText = document.getElementById('crit-banner-text') as HTMLElement | null;

const versionEl = document.getElementById('app-version');
if (versionEl && typeof __APP_VERSION__ !== 'undefined') {
  versionEl.textContent = `v${__APP_VERSION__}`;
}

const source = createCryptoSource();
const visualRandom = createVisualRandom(source);
const controller = new RollController({
  source,
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
});
const scene = new DiceScene(stage);

/** localStorage pode não existir ou lançar erro (modo privado): nesse caso fica só em memória. */
function openStorage(): KeyValueStorage | null {
  try {
    const probe = '__critbox_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}
const storage = openStorage();
const history = new HistoryStore(storage);
const settings = new SettingsStore(storage);
const skins = new SkinsStore(storage);
const adProvider = new WebMockRewardedAdProvider();
const sound = new SoundPlayer();

// Aplica a skin selecionada à cena 3D
scene.setSkin(skins.activeSkin);

/** Toca som e vibração conforme as configurações. Nunca lança nem altera a rolagem. */
function emit(kind: FeedbackKind, strength = 1): void {
  if (settings.value.sound) sound.play(kind, strength);
  if (settings.value.haptics) vibrate(hapticFor(kind, strength));
}

// Os navegadores só liberam áudio depois de um gesto do usuário.
for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, () => sound.unlock(), { passive: true });
}

setupSettingsView(settings, { hapticsSupported: hapticsSupported(), onSoundEnabled: () => sound.unlock() });
setupHistoryView(history, () => {
  // Ao limpar o histórico, nada no palco precisa ser resetado
});
setupChangelogView();
setupDiceSelector();
setupSkinsView(
  skins,
  adProvider,
  (newSkin) => {
    scene.setSkin(newSkin);
    requestRender();
  },
  () => {
    emit('crit');
  },
);

// ----- splash: D20 girando enquanto os recursos essenciais carregam -----
const appEl = document.getElementById('app') as HTMLElement;
const splashEl = document.getElementById('splash') as HTMLElement;
let splashing = true;
const SPLASH_MIN_MS = 1800;

void Promise.all([
  new Promise<void>((resolve) => setTimeout(resolve, SPLASH_MIN_MS)),
  document.fonts?.ready ?? Promise.resolve(),
]).then(() => {
  // Ao carregar, nenhum resultado deve ser exibido. O dado repousa neutro no centro.
  scene.setPose([0, 0, 0], orientationForFace(20, uprightYaw(20)));
  scene.highlightResult(null);
  splashing = false;
  appEl.classList.remove('splashing');
  splashEl.classList.add('fade');
  setTimeout(() => splashEl.remove(), 600);
});

interface ActiveRoll {
  ticket: RollTicket;
  plan: RollPlan;
  startedAt: number;
  cursor: EventCursor;
}
let active: ActiveRoll | null = null;

function setRolling(rolling: boolean): void {
  if (rolling) {
    stage.setAttribute('aria-busy', 'true');
  } else {
    stage.removeAttribute('aria-busy');
  }
}

/** Inicia uma rolagem: toque no dado, clique ou arrastar e soltar. */
function startRoll(): void {
  const ticket = controller.trigger(); // sorteia aqui, antes da animação
  if (ticket === null) {
    return; // já rolando: ignora
  }

  if (critBanner) critBanner.hidden = true;

  const bounds = scene.getPlayfieldBounds();
  const plan = planRoll({
    start: scene.orientation,
    target: orientationForFace(ticket.result, uprightYaw(ticket.result)),
    random: visualRandom,
    throwHeight: 0.7,
    bounds,
    startPosition: scene.position2D,
  });
  const events: FeedbackEvent[] = planFeedback(plan); // não depende do resultado
  active = { ticket, plan, startedAt: performance.now(), cursor: new EventCursor(events) };
  setRolling(true);
  statusEl.textContent = '';
  scene.onRollStart();
}

function finishRoll(roll: ActiveRoll): void {
  active = null;
  try {
    const record = controller.complete(roll.ticket.id, faceUp(scene.orientation));
    if (record !== null) {
      history.add(record);
      // Destaque luminoso do número sorteado diretamente na face do dado
      scene.highlightResult(record.result);

      // Banners e efeitos especiais para 20 (Sucesso Crítico) e 1 (Falha Crítica) estilo Baldur's Gate 3
      if (critBanner && critBannerText) {
        if (record.result === 20) {
          critBanner.className = 'crit-banner success';
          critBannerText.textContent = 'CRITICAL SUCCESS';
          critBanner.hidden = false;
        } else if (record.result === 1) {
          critBanner.className = 'crit-banner failure';
          critBannerText.textContent = 'CRITICAL FAILURE';
          critBanner.hidden = false;
        } else {
          critBanner.hidden = true;
        }
      }

      const special = specialFor(record.result);
      if (special !== null) {
        emit(special);
      }
    }
  } catch (error) {
    if (error instanceof FaceMismatchError) {
      statusEl.textContent = 'Erro ao ler o dado. Role novamente.';
      console.error(error);
    } else {
      throw error;
    }
  } finally {
    setRolling(false);
  }
}

let needsRender = true;
function requestRender(): void {
  needsRender = true;
}
scene.setOnResize(requestRender);

let lastFrame = performance.now();
function frame(now: number): void {
  const dt = Math.min(now - lastFrame, 100);
  lastFrame = now;
  if (splashing) {
    scene.spin(dt);
    needsRender = true;
  }
  if (active !== null) {
    const elapsed = now - active.startedAt;
    const pose = active.plan.pose(elapsed);

    // Durante a rolagem, o dado é 25% menor (escala 0.75), retornando suavemente a 1.0 no repouso
    let scaleFactor = 0.75;
    if (elapsed >= active.plan.settleStartMs) {
      const settleSpan = Math.max(active.plan.durationMs - active.plan.settleStartMs, 1);
      const settleProgress = Math.min((elapsed - active.plan.settleStartMs) / settleSpan, 1);
      const s = 1 - Math.pow(1 - settleProgress, 3);
      scaleFactor = 0.75 + 0.25 * s;
    }

    scene.setPose(pose.position, pose.orientation, scaleFactor);

    for (const ev of active.cursor.due(elapsed)) {
      emit(ev.kind, ev.strength);
      if (ev.kind === 'impact') {
        scene.onImpact(pose.position, ev.strength);
      } else if (ev.kind === 'settle') {
        scene.onSettle();
      }
    }
    scene.updateVFX(dt, pose.position, true);
    needsRender = true;
    if (pose.done) {
      finishRoll(active);
    }
  } else if (scene.hasActiveVFX()) {
    scene.updateVFX(dt, [0, 0, 0], false);
    needsRender = true;
  }
  if (needsRender) {
    scene.render();
    if (!splashing && active === null && !scene.hasActiveVFX()) {
      needsRender = false;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ----- entrada: toque no dado e arrastar/soltar -----
// A intensidade do gesto NUNCA entra no sorteio: o gesto só dispara a rolagem.

const DRAG_THRESHOLD_PX = 8;
let pointer: { id: number; x: number; y: number; moved: number; onDice: boolean } | null = null;

stage.addEventListener('pointerdown', (e) => {
  if (active !== null || pointer !== null) return;
  pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, onDice: scene.hitTest(e.clientX, e.clientY) };
  stage.setPointerCapture(e.pointerId);
});

stage.addEventListener('pointermove', (e) => {
  if (pointer === null || e.pointerId !== pointer.id) return;
  const dx = e.clientX - pointer.x;
  const dy = e.clientY - pointer.y;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.moved += Math.hypot(dx, dy);
  if (pointer.onDice && pointer.moved > DRAG_THRESHOLD_PX) {
    scene.nudge(dx, dy); // só retorno visual
    requestRender();
  }
});

function release(e: PointerEvent): void {
  if (pointer === null || e.pointerId !== pointer.id) return;
  pointer = null;
  if (e.type === 'pointerup') {
    startRoll(); // tocou ou arrastou e soltou: inicia a rolagem
  }
}
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);
