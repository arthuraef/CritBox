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

declare const __APP_VERSION__: string;

const stage = document.getElementById('stage') as HTMLElement;
const resultEl = document.getElementById('result') as HTMLElement;
const rollButton = document.getElementById('roll') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;
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
const sound = new SoundPlayer();

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
  resultEl.textContent = '–';
  resultEl.classList.remove('crit', 'fumble');
});
if (history.latest !== null) {
  resultEl.textContent = String(history.latest.result);
}

// ----- splash: D20 girando enquanto os recursos essenciais carregam -----
const appEl = document.getElementById('app') as HTMLElement;
const splashEl = document.getElementById('splash') as HTMLElement;
let splashing = true;
const SPLASH_MIN_MS = 1800;
void Promise.all([
  new Promise<void>((resolve) => setTimeout(resolve, SPLASH_MIN_MS)),
  document.fonts?.ready ?? Promise.resolve(),
]).then(() => {
  // Dado em repouso mostrando o último resultado (ou 20 na primeira vez).
  const shown = history.latest?.result ?? 20;
  scene.setPose([0, 0, 0], orientationForFace(shown, uprightYaw(shown)));
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
  rollButton.disabled = rolling;
  resultEl.classList.toggle('rolling', rolling);
}

/** Único ponto de partida de uma rolagem: toque, arrasto solto ou botão. */
function startRoll(): void {
  const ticket = controller.trigger(); // sorteia aqui, antes da animação
  if (ticket === null) {
    return; // já rolando: ignora
  }
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
  resultEl.classList.remove('crit', 'fumble');
  setRolling(true);
  statusEl.textContent = '';
}

function finishRoll(roll: ActiveRoll): void {
  active = null;
  try {
    const record = controller.complete(roll.ticket.id, faceUp(scene.orientation));
    if (record !== null) {
      resultEl.textContent = String(record.result);
      history.add(record);
      // Efeito especial só depois de a face ser confirmada; não altera o resultado.
      const special = specialFor(record.result);
      if (special !== null) {
        resultEl.classList.add(special);
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
    const pose = active.plan.pose(now - active.startedAt);
    scene.setPose(pose.position, pose.orientation);
    for (const ev of active.cursor.due(now - active.startedAt)) {
      emit(ev.kind, ev.strength);
    }
    needsRender = true;
    if (pose.done) {
      finishRoll(active);
    }
  }
  if (needsRender) {
    scene.render();
    if (!splashing && active === null) {
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
  const { onDice } = pointer;
  pointer = null;
  if (e.type === 'pointerup' && onDice) {
    startRoll(); // tocou ou arrastou e soltou: ambos só disparam a rolagem
  }
}
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);

rollButton.addEventListener('click', startRoll);
