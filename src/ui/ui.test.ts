import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { Window } from 'happy-dom';

import { HistoryStore, type KeyValueStorage } from '../core/history.ts';
import { SettingsStore } from '../core/settings.ts';
import { SkinsStore } from '../core/skins.ts';
import { WebMockRewardedAdProvider } from '../core/ads.ts';
import { setupHistoryView } from './historyView.ts';
import { setupSettingsView } from './settingsView.ts';
import { setupSkinsView } from './skinsView.ts';
import { setupPrivacyView } from './privacyView.ts';
import { setupChangelogView } from './changelogView.ts';
import { setupDiceSelector } from './diceSelector.ts';

function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

let window: Window;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
  (globalThis as unknown as { window: Window }).window = window;
  (globalThis as unknown as { document: Document }).document = document;
  (globalThis as unknown as { HTMLElement: unknown }).HTMLElement = window.HTMLElement;
  (globalThis as unknown as { HTMLButtonElement: unknown }).HTMLButtonElement = window.HTMLButtonElement;
});

test('HistoryView: abre lista, exibe registros com destaque e limpa após confirmação', () => {
  document.body.innerHTML = `
    <button id="history-btn"></button>
    <div id="history" hidden>
      <button id="history-close"></button>
      <ul id="history-list"></ul>
      <div id="history-empty" hidden></div>
      <span id="history-note"></span>
      <button id="history-clear"></button>
    </div>
    <div id="confirm" hidden>
      <button id="confirm-yes"></button>
      <button id="confirm-no"></button>
    </div>
  `;

  const storage = createMemoryStorage();
  const store = new HistoryStore(storage);
  store.add({ id: 'roll-1', timestamp: new Date(Date.now() - 1000).toISOString(), result: 20 });
  store.add({ id: 'roll-2', timestamp: new Date().toISOString(), result: 1 });

  let clearedCalled = false;
  setupHistoryView(store, () => {
    clearedCalled = true;
  });

  const openBtn = document.getElementById('history-btn') as HTMLButtonElement;
  const overlay = document.getElementById('history') as HTMLElement;
  const list = document.getElementById('history-list') as HTMLUListElement;
  const clearBtn = document.getElementById('history-clear') as HTMLButtonElement;
  const confirmYes = document.getElementById('confirm-yes') as HTMLButtonElement;

  openBtn.click();
  assert.equal(overlay.hidden, false);
  assert.equal(list.children.length, 2);

  // Primeiro da lista é o mais recente (roll-2, resultado 1 -> fumble)
  const firstItem = list.children[0] as HTMLElement;
  assert.ok(firstItem.innerHTML.includes('fumble'));

  // Segundo da lista é roll-1 (resultado 20 -> crit)
  const secondItem = list.children[1] as HTMLElement;
  assert.ok(secondItem.innerHTML.includes('crit'));

  // Clicar em limpar abre o diálogo de confirmação
  clearBtn.click();
  const confirmModal = document.getElementById('confirm') as HTMLElement;
  assert.equal(confirmModal.hidden, false);

  // Confirmar exclusão
  confirmYes.click();
  assert.equal(confirmModal.hidden, true);
  assert.equal(store.records.length, 0);
  assert.equal(clearedCalled, true);
});

test('SettingsView: alterna som e vibração e persiste configurações', () => {
  document.body.innerHTML = `
    <button id="settings-btn"></button>
    <div id="settings" hidden>
      <button id="settings-close"></button>
      <button id="toggle-sound" role="switch" aria-checked="true"></button>
      <button id="toggle-haptics" role="switch" aria-checked="true"></button>
      <span id="haptics-note" hidden></span>
    </div>
  `;

  const storage = createMemoryStorage();
  const store = new SettingsStore(storage);
  let soundUnlocked = false;

  setupSettingsView(store, {
    hapticsSupported: true,
    onSoundEnabled: () => {
      soundUnlocked = true;
    },
  });

  const openBtn = document.getElementById('settings-btn') as HTMLButtonElement;
  const overlay = document.getElementById('settings') as HTMLElement;
  const soundBtn = document.getElementById('toggle-sound') as HTMLButtonElement;
  const hapticBtn = document.getElementById('toggle-haptics') as HTMLButtonElement;

  openBtn.click();
  assert.equal(overlay.hidden, false);

  // Desliga som
  soundBtn.click();
  assert.equal(store.value.sound, false);
  assert.equal(soundBtn.getAttribute('aria-checked'), 'false');

  // Liga som novamente
  soundBtn.click();
  assert.equal(store.value.sound, true);
  assert.equal(soundUnlocked, true);

  // Desliga vibração
  hapticBtn.click();
  assert.equal(store.value.haptics, false);
  assert.equal(hapticBtn.getAttribute('aria-checked'), 'false');
});

test('SkinsView: lista skins, equipa gratuita e inicia anúncio para skin bloqueada', async () => {
  document.body.innerHTML = `
    <button id="skins-btn"></button>
    <div id="skins-modal" hidden>
      <button id="skins-close"></button>
      <ul id="skins-list"></ul>
    </div>
    <div id="ad-modal" hidden>
      <span id="ad-timer"></span>
      <div id="ad-progress"></div>
      <button id="ad-close-btn" disabled></button>
    </div>
  `;

  const storage = createMemoryStorage();
  const store = new SkinsStore(storage);
  const adProvider = new WebMockRewardedAdProvider();
  let equippedSkinId = '';

  setupSkinsView(
    store,
    adProvider,
    (skin) => {
      equippedSkinId = skin.id;
    },
    () => {},
  );

  const openBtn = document.getElementById('skins-btn') as HTMLButtonElement;
  const overlay = document.getElementById('skins-modal') as HTMLElement;
  const list = document.getElementById('skins-list') as HTMLUListElement;

  openBtn.click();
  assert.equal(overlay.hidden, false);
  assert.equal(list.children.length, 3); // ivory, scuffed-metal, dragonflame

  // Equipa a skin gratuita 'scuffed-metal'
  const scuffedBtn = list.querySelector('button[data-skin="scuffed-metal"]') as HTMLButtonElement;
  assert.ok(scuffedBtn);
  scuffedBtn.click();
  assert.equal(store.activeSkin.id, 'scuffed-metal');
  assert.equal(equippedSkinId, 'scuffed-metal');

  // Clica na skin bloqueada 'dragonflame' -> abre modal de anúncio
  const dragonBtn = list.querySelector('button[data-skin="dragonflame"]') as HTMLButtonElement;
  assert.ok(dragonBtn);
  dragonBtn.click();

  const adModal = document.getElementById('ad-modal') as HTMLElement;
  assert.equal(adModal.hidden, false);
});

test('PrivacyView e ChangelogView: abrem e fecham corretamente', () => {
  document.body.innerHTML = `
    <button id="privacy-btn"></button>
    <div id="privacy-modal" hidden>
      <button id="privacy-close"></button>
    </div>
    <button id="app-version"></button>
    <div id="changelog" hidden>
      <button id="changelog-close"></button>
    </div>
  `;

  setupPrivacyView();
  setupChangelogView();

  const privOpen = document.getElementById('privacy-btn') as HTMLButtonElement;
  const privClose = document.getElementById('privacy-close') as HTMLButtonElement;
  const privModal = document.getElementById('privacy-modal') as HTMLElement;

  privOpen.click();
  assert.equal(privModal.hidden, false);
  privClose.click();
  assert.equal(privModal.hidden, true);

  const verOpen = document.getElementById('app-version') as HTMLButtonElement;
  const verClose = document.getElementById('changelog-close') as HTMLButtonElement;
  const verModal = document.getElementById('changelog') as HTMLElement;

  verOpen.click();
  assert.equal(verModal.hidden, false);
  verClose.click();
  assert.equal(verModal.hidden, true);
});

test('DiceSelector: notifica seleção de dado e exibe feedback amigável', () => {
  document.body.innerHTML = `
    <nav id="dice-selector">
      <button class="dice-chip" data-dice="d6">D6</button>
      <button class="dice-chip active" data-dice="d20">D20</button>
    </nav>
    <div id="status"></div>
  `;

  let selected = '';
  setupDiceSelector((dice) => {
    selected = dice;
  });

  const d6Btn = document.querySelector('[data-dice="d6"]') as HTMLButtonElement;
  const statusEl = document.getElementById('status') as HTMLElement;

  d6Btn.click();
  assert.equal(selected, 'd6');
  assert.ok(statusEl.textContent?.includes('D6'));
});
