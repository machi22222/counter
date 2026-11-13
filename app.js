'use strict';

/* ============================================================
   Zähler – gesamte App-Logik
   - keine Netzwerkanfragen, keine Bibliotheken
   - Ausgabe ins DOM ausschließlich über textContent
   ============================================================ */

// ---------- Konstanten ----------
// Eindeutiger Schlüssel: Alle Projekte unter <name>.github.io teilen sich denselben Speicher.
const KEY = 'zaehler-app';
const MIN = 0;
const MAX = 999_999_999;
const STEP_MIN = 1;
const STEP_MAX = 10_000;
const PRESETS = [1, 2, 5, 10];
const UNDO_MS = 10_000;

const fmt = new Intl.NumberFormat('de-DE').format;
const isIntIn = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;

// ---------- Elemente ----------
const $ = (id) => document.getElementById(id);
const countEl = $('count');
const minusBtn = $('minus');
const plusBtn = $('plus');
const resetBtn = $('reset');
const presetBtns = document.querySelectorAll('.seg[data-step]');
const customSeg = $('seg-custom');
const customForm = $('custom-form');
const customInput = $('custom-input');
const customError = $('custom-error');
const undoBox = $('undo');
const undoPrev = $('undo-prev');
const undoSecs = $('undo-secs');
const undoBar = $('undo-bar');
const storageWarning = $('storage-warning');
const updateBtn = $('update');

// ---------- Zustand ----------
// undo ist null oder { prev: Wert vor dem Reset, at: Zeitpunkt des Resets in ms }
const state = { count: 0, step: 1, undo: null };

// ---------- Speichern & Laden ----------
// Format (Version 1): { v: 1, count, step, undo }
function load() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    storageWarning.hidden = false;
    return;
  }
  if (raw === null) return; // erster Start → Standardwerte

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return; // kaputte Daten → Standardwerte
  }
  // Unbekannte Version → Standardwerte. Spätere Formate würden hier migriert.
  if (!data || typeof data !== 'object' || data.v !== 1) return;

  // Jeder Wert wird einzeln geprüft; Ungültiges bleibt beim sicheren Standard.
  if (isIntIn(data.count, MIN, MAX)) state.count = data.count;
  if (isIntIn(data.step, STEP_MIN, STEP_MAX)) state.step = data.step;
  const u = data.undo;
  if (u && typeof u === 'object' && isIntIn(u.prev, MIN, MAX) && Number.isSafeInteger(u.at)) {
    state.undo = { prev: u.prev, at: u.at };
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, count: state.count, step: state.step, undo: state.undo }));
    storageWarning.hidden = true;
  } catch {
    storageWarning.hidden = false; // App läuft weiter, nur ohne Speichern
  }
}

// ---------- Anzeige ----------
function renderCount() {
  const text = fmt(state.count);
  if (countEl.textContent !== text) { // nur echte Änderungen vorlesen lassen
    countEl.textContent = text;
    fitCount();
  }
  minusBtn.disabled = state.count <= MIN;
  plusBtn.disabled = state.count >= MAX;
  resetBtn.disabled = state.count === 0;
}

// Lange Zahlen verkleinern, damit sie immer in eine Zeile passen
// (Schrift skaliert nicht exakt proportional, daher notfalls pixelweise nachjustieren.)
function fitCount() {
  countEl.style.fontSize = '';
  const available = countEl.parentElement.clientWidth;
  let size = parseFloat(getComputedStyle(countEl).fontSize);
  while (countEl.scrollWidth > available && size > 8) {
    size = Math.min(size - 1, Math.floor((size * available) / countEl.scrollWidth));
    countEl.style.fontSize = size + 'px';
  }
}

function renderStep() {
  const s = state.step;
  for (const b of presetBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.step) === s));
  const isCustom = !PRESETS.includes(s);
  customSeg.setAttribute('aria-pressed', String(isCustom));
  customSeg.textContent = isCustom ? fmt(s) : 'Eigene';
  customSeg.setAttribute('aria-label', isCustom ? `Eigene Schrittgröße: ${fmt(s)}` : 'Eigene Schrittgröße');
  minusBtn.setAttribute('aria-label', `Um ${fmt(s)} verringern`);
  plusBtn.setAttribute('aria-label', `Um ${fmt(s)} erhöhen`);
}

// ---------- Zählen ----------
// Hinweis zum Rückgängig-Zeitraum: + und − lassen einen laufenden Rückgängig-Zeitraum
// bewusst unverändert. „Rückgängig“ stellt also auch nach weiteren Tipps den Wert
// VOR dem Reset wieder her; die seit dem Reset gezählten Schritte werden dabei verworfen.
function change(direction) {
  // Begrenzen statt überlaufen: z. B. 3 − 5 ergibt 0, nicht −2
  const next = Math.min(MAX, Math.max(MIN, state.count + direction * state.step));
  if (next === state.count) return;
  state.count = next;
  save();
  renderCount();
}

// ---------- Schrittgröße ----------
function setStep(n) {
  state.step = n;
  save();
  renderStep();
}

function toggleCustom(open) {
  customForm.hidden = !open;
  customSeg.setAttribute('aria-expanded', String(open));
  if (open) {
    customInput.value = PRESETS.includes(state.step) ? '' : String(state.step);
    showError('');
    customInput.focus();
  }
}

function showError(message) {
  customError.textContent = message;
  if (message) customInput.setAttribute('aria-invalid', 'true');
  else customInput.removeAttribute('aria-invalid');
}

// Eigene Schrittgröße prüfen: nur Ziffern, 1 bis 10.000 – sonst ablehnen und erklären
function submitCustom(event) {
  event.preventDefault();
  const raw = customInput.value.trim();
  if (raw === '') {
    showError('Bitte gib eine Zahl ein.');
  } else if (!/^[0-9]+$/.test(raw)) {
    showError('Nur ganze Zahlen – ohne Komma, Punkt, Minus oder Leerzeichen.');
  } else if (!isIntIn(Number(raw), STEP_MIN, STEP_MAX)) {
    showError('Erlaubt sind Werte von 1 bis 10.000.');
  } else {
    setStep(Number(raw));
    customSeg.focus(); // schließt die Tastatur
    toggleCustom(false);
  }
}

// ---------- Reset & Rückgängig ----------
let frame = 0;

function reset() {
  if (state.count === 0) return; // nichts zu tun; schützt einen gesicherten Wert vor dem Überschreiben mit 0
  state.undo = { prev: state.count, at: Date.now() };
  state.count = 0;
  save(); // Wert + Zeitpunkt sind gespeichert → Rückgängig klappt auch nach Neuladen
  renderCount();
  showUndo();
}

// Verbleibende Rückgängig-Zeit in ms (0 = abgelaufen oder ungültig, z. B. Uhr zurückgestellt)
function undoLeft() {
  if (!state.undo) return 0;
  const elapsed = Date.now() - state.undo.at;
  return elapsed >= 0 && elapsed < UNDO_MS ? UNDO_MS - elapsed : 0;
}

function undo() {
  if (undoLeft() > 0) {
    state.count = state.undo.prev;
    renderCount();
  }
  clearUndo();
}

// Gesicherten Wert löschen und Banner ausblenden
function clearUndo() {
  cancelAnimationFrame(frame);
  state.undo = null;
  save();
  undoBox.hidden = true;
}

function showUndo() {
  undoPrev.textContent = 'vorher ' + fmt(state.undo.prev);
  undoBox.hidden = false;
  cancelAnimationFrame(frame);
  tick();
}

// Countdown: Sekundenanzeige + schrumpfender Balken. Läuft die Zeit ab
// (auch während die App im Hintergrund war), wird der Wert gelöscht.
function tick() {
  const left = undoLeft();
  if (left === 0) {
    clearUndo();
    return;
  }
  undoSecs.textContent = Math.ceil(left / 1000) + ' s';
  undoBar.style.transform = `scaleX(${left / UNDO_MS})`;
  frame = requestAnimationFrame(tick);
}

// ---------- Start ----------
load();
renderCount();
renderStep();
if (undoLeft() > 0) showUndo();       // Neuladen innerhalb der 10 s → Rückgängig für die Restzeit
else if (state.undo) clearUndo();     // abgelaufen → gesicherten Wert löschen

plusBtn.addEventListener('click', () => change(1));
minusBtn.addEventListener('click', () => change(-1));
resetBtn.addEventListener('click', reset);
$('undo-btn').addEventListener('click', undo);
for (const b of presetBtns) {
  b.addEventListener('click', () => {
    setStep(Number(b.dataset.step));
    toggleCustom(false);
  });
}
customSeg.addEventListener('click', () => toggleCustom(customForm.hidden));
customForm.addEventListener('submit', submitCustom);
customInput.addEventListener('input', () => showError(''));
window.addEventListener('resize', fitCount);
// iOS zeigt den Drück-Effekt (:active) nur, wenn ein touchstart-Listener existiert
document.addEventListener('touchstart', () => {}, { passive: true });

// ---------- Offline & Updates ----------
if ('serviceWorker' in navigator) {
  let waiting = null;
  let updating = false;

  const offerUpdate = (worker) => {
    waiting = worker;
    updateBtn.hidden = false;
  };

  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker.addEventListener('statechange', () => {
        // Nur bei einem echten Update Hinweis zeigen, nicht bei der allerersten Installation
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    // Home-Bildschirm-Apps werden oft nur fortgesetzt statt neu geladen → dann nach Updates suchen
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {}); // ohne Service Worker läuft die App weiter, nur nicht offline

  updateBtn.addEventListener('click', () => {
    if (!waiting) return;
    updating = true;
    waiting.postMessage('skip-waiting');
  });

  // Neue Version hat übernommen → einmal neu laden (nur wenn ausdrücklich gewünscht)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload();
  });
}
