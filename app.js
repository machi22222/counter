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
const MAX_COUNTERS = 10;
const COLORS = 8;     // Farben stehen in styles.css unter [data-color="0"] … [data-color="7"]
const NAME_MAX = 40;
const SWIPE_PX = 60;  // so weit muss man wischen, damit der Zähler wechselt

const fmt = new Intl.NumberFormat('de-DE').format;
const isIntIn = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;

// ---------- Elemente ----------
const $ = (id) => document.getElementById(id);
const countEl = $('count');
const card = $('card');
const display = card.parentElement;
const nameBtn = $('name');
const dotList = $('dots');
const addBtn = $('add');
const pagerHint = $('pager-hint');
const minusBtn = $('minus');
const plusBtn = $('plus');
const resetBtn = $('reset');
const presetBtns = document.querySelectorAll('.seg[data-step]');
const customSeg = $('seg-custom');
const customForm = $('custom-form');
const customInput = $('custom-input');
const customError = $('custom-error');
const undoBox = $('undo');
const undoSecs = $('undo-secs');
const undoBar = $('undo-bar');
const editSheet = $('edit');
const editName = $('edit-name');
const editDelete = $('edit-delete');
const swatches = document.querySelectorAll('.swatch');
const modeBtns = document.querySelectorAll('.seg[data-mode]');
const editStart = $('edit-start');
const editStartError = $('edit-start-error');
const subEl = $('sub');
const pad = plusBtn.parentElement;
const storageWarning = $('storage-warning');
const updateBtn = $('update');

// ---------- Zustand ----------
// counters: Liste der Zähler { id, name, count, step, color, mode, start, fresh }
//   mode = 'up' (hochzählen, ab 0) oder 'down' (runterzählen vom Startwert start bis 0)
//   fresh = gerade per Wischen angelegt und noch unbenutzt → verschwindet beim Verlassen wieder
// current: Position des angezeigten Zählers
// undo: null oder { kind: 'reset' | 'mode' | 'delete', at: Zeitpunkt in ms, index: Position, counter: Kopie davor }
const state = { counters: [], current: 0, undo: null };
const cur = () => state.counters[state.current];
const nameOf = (c) => c.name.trim() || `Zähler ${c.id}`; // Platzhalter bleibt stabil, auch wenn Zähler davor dazukommen

function newCounter() {
  const used = state.counters.map((c) => c.color);
  const free = [...Array(COLORS).keys()].find((n) => !used.includes(n)); // erste noch freie Farbe
  return {
    id: Math.max(0, ...state.counters.map((c) => c.id)) + 1,
    name: '',
    count: 0,
    step: 1,
    color: free ?? state.counters.length % COLORS,
    mode: 'up',
    start: 10,
    fresh: true,
  };
}

// ---------- Speichern & Laden ----------
// Format (Version 2): { v: 2, current, counters: [...], undo }
// (mode/start sind später dazugekommen; fehlen sie, gilt „Hochzählen“.)
// Version 1 (nur ein Zähler: { v: 1, count, step, undo }) wird beim Laden übernommen.
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
  if (data && data.v === 1) data = migrateV1(data);
  if (!data || data.v !== 2 || !Array.isArray(data.counters)) return; // unbekannt → Standardwerte

  // Jeder Zähler wird einzeln geprüft; Ungültiges fällt weg oder auf sichere Standardwerte zurück.
  const seen = new Set();
  for (const item of data.counters) {
    const c = cleanCounter(item);
    if (c && !seen.has(c.id) && state.counters.length < MAX_COUNTERS) {
      seen.add(c.id);
      state.counters.push(c);
    }
  }
  if (isIntIn(data.current, 0, state.counters.length - 1)) state.current = data.current;
  const u = data.undo;
  if (u && typeof u === 'object' && ['reset', 'mode', 'delete'].includes(u.kind)
      && Number.isSafeInteger(u.at) && isIntIn(u.index, 0, MAX_COUNTERS)) {
    const c = cleanCounter(u.counter);
    if (c) state.undo = { kind: u.kind, at: u.at, index: u.index, counter: c };
  }
}

// Liefert eine geprüfte Kopie eines gespeicherten Zählers oder null
function cleanCounter(c) {
  if (!c || typeof c !== 'object' || !isIntIn(c.id, 1, Number.MAX_SAFE_INTEGER)) return null;
  const clean = {
    id: c.id,
    name: typeof c.name === 'string' && c.name.length <= NAME_MAX ? c.name : '',
    count: isIntIn(c.count, MIN, MAX) ? c.count : 0,
    step: isIntIn(c.step, STEP_MIN, STEP_MAX) ? c.step : 1,
    color: isIntIn(c.color, 0, COLORS - 1) ? c.color : 0,
    mode: 'up',
    start: isIntIn(c.start, 1, MAX) ? c.start : 10,
    fresh: c.fresh === true,
  };
  // Runterzählen nur mit gültigem Startwert; Stand nie über dem Startwert
  if (c.mode === 'down' && isIntIn(c.start, 1, MAX)) {
    clean.mode = 'down';
    clean.count = Math.min(clean.count, clean.start);
  }
  return clean;
}

// Version 1 → 2: der bisherige Zähler wird der erste Zähler (inkl. laufendem Rückgängig)
function migrateV1(d) {
  const counter = { id: 1, name: '', count: d.count, step: d.step, color: 0 };
  const u = d.undo;
  return {
    v: 2,
    current: 0,
    counters: [counter],
    undo: u && typeof u === 'object' ? { kind: 'reset', at: u.at, index: 0, counter: { ...counter, count: u.prev } } : null,
  };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 2, current: state.current, counters: state.counters, undo: state.undo }));
    storageWarning.hidden = true;
  } catch {
    storageWarning.hidden = false; // App läuft weiter, nur ohne Speichern
  }
}

// ---------- Anzeige ----------
function render() {
  const c = cur();
  document.documentElement.dataset.color = c.color; // färbt die ganze Bedienung ein
  renderCount();
  renderStep();
  // Runterzählen: großer Knopf rechts (Daumen) wird „−“, kleiner links „+“
  const down = c.mode === 'down';
  const [side, main] = down ? [plusBtn, minusBtn] : [minusBtn, plusBtn];
  side.classList.replace('btn-main', 'btn-side');
  main.classList.replace('btn-side', 'btn-main');
  if (pad.firstElementChild !== side) pad.prepend(side);
  resetBtn.setAttribute('aria-label', down ? `Zähler auf Startwert ${fmt(c.start)} zurücksetzen` : 'Zähler auf 0 zurücksetzen');
  const name = nameOf(c);
  $('name-text').textContent = name;
  nameBtn.classList.toggle('unnamed', !c.name.trim());
  nameBtn.setAttribute('aria-label', `${name} – Name und Farbe ändern`);

  // Punkte: einer pro Zähler in seiner Farbe; Tippen springt hin
  const dotFocused = dotList.contains(document.activeElement);
  dotList.replaceChildren(...state.counters.map((counter, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot';
    dot.dataset.color = counter.color;
    dot.setAttribute('aria-label', nameOf(counter));
    if (i === state.current) dot.setAttribute('aria-current', 'true');
    dot.addEventListener('click', () => navigate(i));
    return dot;
  }));
  if (dotFocused) dotList.children[state.current].focus();
  addBtn.hidden = c.fresh || state.counters.length >= MAX_COUNTERS;
  pagerHint.textContent = c.fresh ? 'Neuer Zähler – er bleibt, sobald du zählst oder ihn benennst.'
    : state.counters.length === 1 ? 'Zur Seite wischen für einen weiteren Zähler'
    : state.counters.length >= MAX_COUNTERS ? `Maximal ${MAX_COUNTERS} Zähler` : '';
}

function renderCount() {
  const c = cur();
  const text = fmt(c.count);
  if (countEl.textContent !== text) { // nur echte Änderungen vorlesen lassen
    countEl.textContent = text;
    fitCount();
  }
  minusBtn.disabled = c.count <= MIN;
  plusBtn.disabled = c.count >= upper(c);
  resetBtn.disabled = c.count === base(c);
  // Runterzählen: „von 50“ bzw. „Geschafft!“ unter der Zahl
  const sub = c.mode === 'down' ? (c.count === 0 ? 'Geschafft! 🎉' : `von ${fmt(c.start)}`) : '';
  if (subEl.textContent !== sub) subEl.textContent = sub;
  subEl.hidden = !sub;
}

// Obergrenze und Ausgangswert je nach Modus
const upper = (c) => (c.mode === 'down' ? c.start : MAX);
const base = (c) => (c.mode === 'down' ? c.start : 0);

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
  const s = cur().step;
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
  const c = cur();
  // Begrenzen statt überlaufen: z. B. 3 − 5 ergibt 0, nicht −2
  const next = Math.min(upper(c), Math.max(MIN, c.count + direction * c.step));
  if (next === c.count) return;
  c.count = next;
  const wasFresh = c.fresh;
  c.fresh = false; // benutzt → bleibt
  save();
  if (wasFresh) render();
  else renderCount();
}

// ---------- Schrittgröße ----------
function setStep(n) {
  const c = cur();
  c.step = n;
  c.fresh = false;
  save();
  render();
}

function toggleCustom(open) {
  customForm.hidden = !open;
  customSeg.setAttribute('aria-expanded', String(open));
  if (open) {
    customInput.value = PRESETS.includes(cur().step) ? '' : String(cur().step);
    showError('');
    customInput.focus();
  }
}

function showError(message) {
  customError.textContent = message;
  if (message) customInput.setAttribute('aria-invalid', 'true');
  else customInput.removeAttribute('aria-invalid');
}

// Prüft eine Eingabe: nur Ziffern im erlaubten Bereich. Liefert die Zahl oder einen Fehlertext.
function parseWhole(raw, lo, hi) {
  const text = raw.trim();
  if (text === '') return 'Bitte gib eine Zahl ein.';
  if (!/^[0-9]+$/.test(text)) return 'Nur ganze Zahlen – ohne Komma, Punkt, Minus oder Leerzeichen.';
  const n = Number(text);
  return isIntIn(n, lo, hi) ? n : `Erlaubt sind Werte von ${fmt(lo)} bis ${fmt(hi)}.`;
}

// Eigene Schrittgröße: ungültig → ablehnen und erklären
function submitCustom(event) {
  event.preventDefault();
  const result = parseWhole(customInput.value, STEP_MIN, STEP_MAX);
  if (typeof result === 'string') {
    showError(result);
  } else {
    setStep(result);
    customSeg.focus(); // schließt die Tastatur
    toggleCustom(false);
  }
}

// ---------- Mehrere Zähler: wechseln, neu anlegen, aufräumen ----------
// Ein unbenutzter neuer Zähler wird beim Verlassen wieder entfernt.
function dropFresh() {
  if (!cur().fresh || state.counters.length < 2) return false;
  state.counters.splice(state.current, 1);
  return true;
}

// target: Position des Ziels; -1 oder Anzahl = über den Rand → neuen Zähler anlegen
function canGo(target) {
  if (target === state.current) return false;
  const outside = target < 0 || target >= state.counters.length;
  // Kein neuer Zähler aus einem unbenutzten neuen heraus und nicht über das Maximum
  return !(outside && (cur().fresh || state.counters.length >= MAX_COUNTERS));
}

function go(target) {
  if (dropFresh() && target > state.current) target--;
  if (target < 0 || target >= state.counters.length) {
    target = target < 0 ? 0 : state.counters.length;
    state.counters.splice(target, 0, newCounter());
  }
  state.current = target;
  toggleCustom(false);
  save();
  render();
}

// Wechsel mit kurzer Wisch-Animation (bei „Bewegung reduzieren“ ohne)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let busy = false;

function navigate(target, fromX = 0) {
  if (busy) return;
  if (!canGo(target)) {
    snapBack(fromX);
    return;
  }
  if (reduceMotion.matches) {
    go(target);
    return;
  }
  busy = true;
  const dir = target > state.current ? -1 : 1; // -1: Inhalt wandert nach links hinaus
  const out = card.animate(
    [{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${dir * 100}%)`, opacity: 0 }],
    { duration: 160, easing: 'ease-in', fill: 'forwards' },
  );
  out.onfinish = () => {
    go(target);
    out.cancel();
    card.animate(
      [{ transform: `translateX(${-dir * 60}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 200, easing: 'ease-out' },
    ).onfinish = () => { busy = false; };
  };
}

function snapBack(fromX) {
  if (fromX) card.animate([{ transform: `translateX(${fromX}px)` }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
}

// Wischgeste über dem Zählerbereich: die Zahl folgt dem Finger
let drag = null;
let swiped = false;

display.addEventListener('pointerdown', (event) => {
  swiped = false;
  if (busy || !event.isPrimary) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, axis: '' };
});
display.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.axis && Math.abs(dx) + Math.abs(dy) > 10) {
    drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (drag.axis === 'x') display.setPointerCapture(event.pointerId);
  }
  if (drag.axis !== 'x') return;
  drag.dx = dx;
  card.style.transform = `translateX(${dx}px)`;
});
function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const { dx, axis } = drag;
  drag = null;
  if (axis !== 'x') return;
  swiped = true; // den folgenden Klick (z. B. auf den Namen) nicht auslösen
  card.style.transform = '';
  if (event.type === 'pointerup' && Math.abs(dx) > SWIPE_PX) navigate(state.current + (dx < 0 ? 1 : -1), dx);
  else snapBack(dx);
}
display.addEventListener('pointerup', endDrag);
display.addEventListener('pointercancel', endDrag);
display.addEventListener('click', (event) => {
  if (swiped) {
    event.stopPropagation();
    event.preventDefault();
  }
}, true);

// ---------- Name, Farbe & Modus ----------
// Name und Farbe gelten sofort. Modus/Startwert werden erst beim Schließen übernommen,
// weil sie den Zähler neu starten (mit 10 Sekunden Rückgängig).
let editing = null;    // der Zähler, der gerade bearbeitet wird
let editMode = 'up';   // im Fenster gewählter Modus

function openEdit() {
  if (busy) return; // nicht mitten in einer Wisch-Animation
  editing = cur();
  editName.value = editing.name;
  editMode = editing.mode;
  editStart.value = editing.mode === 'down' ? String(editing.start) : '';
  editStartError.textContent = '';
  editStart.removeAttribute('aria-invalid');
  editDelete.hidden = state.counters.length < 2;
  renderSwatches();
  renderEditMode();
  editSheet.showModal();
}

// Was beim Schließen passiert: null = nichts, sonst der neue Modus samt Startwert
function pendingMode(c) {
  if (editMode === 'up') return c.mode === 'up' ? null : { mode: 'up', start: c.start };
  const start = parseWhole(editStart.value, 1, MAX);
  if (typeof start !== 'number' || (c.mode === 'down' && c.start === start)) return null;
  return { mode: 'down', start };
}

function renderEditMode() {
  for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === editMode));
  $('edit-start-row').hidden = editMode !== 'down';
  $('edit-mode-note').hidden = !pendingMode(editing);
}

// „Fertig“: bei ungültigem Startwert nicht schließen, sondern den Fehler zeigen
function finishEdit() {
  const result = editMode === 'down' ? parseWhole(editStart.value, 1, MAX) : 0;
  if (typeof result === 'string') {
    editStartError.textContent = result;
    editStart.setAttribute('aria-invalid', 'true');
    editStart.focus();
    return;
  }
  applyEdit(); // sofort übernehmen, nicht erst beim (verzögerten) Schließen-Ereignis
  editSheet.close();
}

// Übernimmt die Bearbeitung genau einmal: Name ohne Leerzeichen am Rand, ggf. neuer Modus.
// Moduswechsel startet den Zähler neu (runter: beim Startwert, hoch: bei 0) – 10 s rückgängig machbar.
// Ungültiger Startwert (Fenster per Escape/Hintergrund geschlossen) → Modus bleibt, wie er war.
function applyEdit() {
  const c = editing;
  editing = null;
  if (!c || !state.counters.includes(c)) return; // z. B. gerade gelöscht
  c.name = c.name.trim();
  const next = pendingMode(c);
  if (next) {
    state.undo = { kind: 'mode', at: Date.now(), index: state.counters.indexOf(c), counter: { ...c } };
    Object.assign(c, next, { count: next.mode === 'down' ? next.start : 0, fresh: false });
  }
  save();
  render();
  if (next) showUndo();
}

function renderSwatches() {
  for (const s of swatches) s.setAttribute('aria-pressed', String(Number(s.dataset.color) === cur().color));
}

// ---------- Reset, Löschen & Rückgängig ----------
let frame = 0;

function reset() {
  const c = cur();
  if (c.count === base(c)) return; // nichts zu tun; schützt einen gesicherten Wert vor dem Überschreiben
  state.undo = { kind: 'reset', at: Date.now(), index: state.current, counter: { ...c } };
  c.count = base(c); // hochzählen: 0, runterzählen: Startwert
  save(); // Wert + Zeitpunkt sind gespeichert → Rückgängig klappt auch nach Neuladen
  renderCount();
  showUndo();
}

function removeCurrent() {
  if (state.counters.length < 2) return;
  const [c] = state.counters.splice(state.current, 1);
  state.undo = { kind: 'delete', at: Date.now(), index: state.current, counter: c };
  state.current = Math.min(state.current, state.counters.length - 1);
  save();
  render();
  showUndo();
}

// Verbleibende Rückgängig-Zeit in ms (0 = abgelaufen oder ungültig, z. B. Uhr zurückgestellt)
function undoLeft() {
  if (!state.undo) return 0;
  const elapsed = Date.now() - state.undo.at;
  return elapsed >= 0 && elapsed < UNDO_MS ? UNDO_MS - elapsed : 0;
}

// Reset/Moduswechsel: Stand, Modus und Startwert von vorher zurück.
// Löschen: Zähler an seine Stelle zurück. Die Anzeige springt jeweils zu diesem Zähler.
function undo() {
  if (busy) return; // nicht mitten in einer Wisch-Animation
  const u = state.undo;
  if (undoLeft() > 0) {
    dropFresh();
    state.current = Math.min(state.current, state.counters.length - 1);
    if (u.kind === 'delete') {
      const i = Math.min(u.index, state.counters.length);
      state.counters.splice(i, 0, u.counter);
      state.current = i;
    } else {
      const i = state.counters.findIndex((c) => c.id === u.counter.id);
      if (i >= 0) {
        const { count, mode, start } = u.counter;
        Object.assign(state.counters[i], { count, mode, start });
        state.current = i;
      }
    }
    render();
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
  const u = state.undo;
  const deleted = u.kind === 'delete';
  $('undo-title').textContent = { reset: 'Zurückgesetzt', mode: 'Modus geändert', delete: 'Gelöscht' }[u.kind];
  $('undo-prev').textContent = `${nameOf(u.counter)} · ${deleted ? 'Stand' : 'vorher'} ${fmt(u.counter.count)}`;
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
if (!state.counters.length) {
  state.counters.push({ ...newCounter(), fresh: false }); // der erste Zähler ist immer „echt“
}
render();
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
addBtn.addEventListener('click', () => navigate(state.counters.length));

nameBtn.addEventListener('click', openEdit);
editName.addEventListener('input', () => {
  const c = cur();
  c.name = editName.value;
  c.fresh = false;
  save();
  render();
});
for (const input of [editName, editStart]) {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finishEdit();
  });
}
for (const b of modeBtns) {
  b.addEventListener('click', () => {
    editMode = b.dataset.mode;
    renderEditMode();
    if (editMode === 'down' && !editStart.value) editStart.focus();
  });
}
editStart.addEventListener('input', () => {
  const result = parseWhole(editStart.value, 1, MAX);
  editStartError.textContent = typeof result === 'string' ? result : '';
  if (typeof result === 'string') editStart.setAttribute('aria-invalid', 'true');
  else editStart.removeAttribute('aria-invalid');
  renderEditMode();
});
for (const s of swatches) {
  s.addEventListener('click', () => {
    const c = cur();
    c.color = Number(s.dataset.color);
    c.fresh = false;
    save();
    render();
    renderSwatches();
  });
}
$('edit-done').addEventListener('click', finishEdit);
editDelete.addEventListener('click', () => {
  editing = null; // gelöscht → beim Schließen nichts mehr übernehmen
  editSheet.close();
  removeCurrent();
});
editSheet.addEventListener('close', applyEdit); // Escape oder Tipp auf den Hintergrund
// Fenster schließen sich auch per Tipp auf den abgedunkelten Hintergrund
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

window.addEventListener('resize', fitCount);
// iOS zeigt den Drück-Effekt (:active) nur, wenn ein touchstart-Listener existiert
document.addEventListener('touchstart', () => {}, { passive: true });

// ---------- Als App nutzen: Anleitung je nach Handy und Browser ----------
// Erscheint nur auf Handys im Browser: beim ersten Besuch automatisch (einmalig),
// danach über den Knopf „Als App nutzen“. In der installierten App nie.
const HINT_KEY = 'zaehler-hinweis'; // Werte: 'gezeigt' oder 'installiert'

// Texte der Anleitungen. *fett* = Name eines Knopfs, {name} = Symbol aus #icon-set.
const PLATFORMS = {
  ios: {
    lead: 'Leg den Zähler auf deinen Home-Bildschirm. Dann startet er wie eine App – im Vollbild und auch ohne Internet.',
    note: 'Gut zu wissen: Die App hat einen eigenen Zählerstand – was du hier im Browser gezählt hast, wird nicht übernommen.',
  },
  android: {
    lead: 'Installiere den Zähler auf deinem Startbildschirm. Dann startet er wie eine App – im Vollbild und auch ohne Internet.',
    note: '',
  },
};
const GUIDES = {
  'ios-safari': {
    title: 'So geht’s in Safari',
    steps: [
      'Tippe auf das Teilen-Symbol {teilen}. Nicht zu sehen? Dann erst auf {punkte} neben der Adresse tippen, danach auf *Teilen*.',
      'Scrolle im Menü nach unten und tippe auf *Zum Home-Bildschirm* {plus}.',
      '*Als Web-App öffnen* eingeschaltet lassen (falls angezeigt) und auf *Hinzufügen* tippen.',
      'Fertig! Starte den Zähler ab jetzt über das neue Symbol.',
    ],
  },
  'ios-chrome': {
    title: 'So geht’s in Chrome',
    steps: [
      'Tippe oben in der Adressleiste auf das Teilen-Symbol {teilen}.',
      'Scrolle im Menü nach unten und tippe auf *Zum Home-Bildschirm* {plus}.',
      'Tippe auf *Hinzufügen*.',
      'Fertig! Starte den Zähler ab jetzt über das neue Symbol.',
    ],
    tip: 'Kein Eintrag *Zum Home-Bildschirm*? Dann öffne diese Seite in Safari – dort klappt es immer.',
    copy: true,
  },
  'ios-other': {
    title: 'Öffne den Zähler in Safari',
    steps: [
      'Tippe unten auf *Adresse kopieren*.',
      'Öffne *Safari*, tippe lange in die Adressleiste und wähle *Einsetzen und öffnen*.',
      'Safari zeigt dir dann Schritt für Schritt, wie du den Zähler auf den Home-Bildschirm legst.',
    ],
    tip: 'Warum Safari? Nur dort klappt das zuverlässig. Manche Apps bieten im Menü {punkte} auch direkt *In Safari öffnen* an.',
    copy: true,
  },
  'android-prompt': {
    title: 'Mit einem Tipp installieren',
    steps: [
      'Tippe unten auf *Jetzt installieren*.',
      'Bestätige mit *Installieren*.',
      'Fertig! Starte den Zähler ab jetzt über das neue Symbol.',
    ],
  },
  'android-chrome': {
    title: 'So geht’s in Chrome',
    steps: [
      'Tippe oben rechts auf {dreipunkte}.',
      'Tippe auf *App installieren* oder *Zum Startbildschirm hinzufügen*.',
      'Bestätige mit *Installieren*.',
      'Fertig! Starte den Zähler ab jetzt über das neue Symbol.',
    ],
  },
  'android-samsung': {
    title: 'So geht’s in Samsung Internet',
    steps: [
      'Tippe unten rechts auf {menue}.',
      'Tippe auf *Seite hinzufügen zu* und dann auf *Startbildschirm*.',
      'Bestätige mit *Hinzufügen*.',
      'Fertig! Starte den Zähler ab jetzt über das neue Symbol.',
    ],
    tip: 'Zeigt die Adressleiste ein Installieren-Symbol? Dann geht es auch mit einem Tipp darauf.',
  },
  'android-firefox': {
    title: 'So geht’s in Firefox',
    steps: [
      'Tippe auf {dreipunkte} – je nach Einstellung oben oder unten rechts.',
      'Tippe auf *Installieren* oder *Zum Startbildschirm hinzufügen*.',
      'Bestätige mit *Hinzufügen*.',
      'Fertig! Starte den Zähler ab jetzt über das neue Symbol.',
    ],
  },
  'android-other': {
    title: 'So geht’s in deinem Browser',
    steps: [
      'Öffne das Menü deines Browsers – meist {dreipunkte}, {menue} oder {punkte}.',
      'Tippe auf *App installieren*, *Installieren* oder *Zum Startbildschirm hinzufügen*.',
      'Bestätige und starte den Zähler ab jetzt über das neue Symbol.',
    ],
    tip: 'Nichts davon zu finden? Öffne diese Seite in Chrome – dort klappt es sicher.',
    copy: true,
  },
  'android-inapp': {
    title: 'Öffne den Zähler in deinem Browser',
    steps: [
      'Tippe oben rechts auf {dreipunkte} und wähle *Im Browser öffnen* oder *In Chrome öffnen*.',
      'Klappt das nicht: Tippe unten auf *Adresse kopieren* und füge sie in Chrome ein.',
      'Dort zeigt dir der Zähler, wie du ihn installierst.',
    ],
    tip: 'Diese Ansicht gehört zu einer anderen App (z. B. Instagram) und kann nichts installieren.',
    copy: true,
  },
};

// Welche Anleitung passt? Nur Handys – Tablets und Computer bekommen keine (null).
// Browser verraten sich nur über ihre Kennung (User-Agent); unbekannte landen bei „other“.
function detectGuide(ua) {
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|Line\/|GSA\/|Pinterest|TikTok|musical_ly|; wv\)/.test(ua);
  if (/iPhone|iPod/.test(ua)) {
    if (/CriOS/.test(ua) && !inApp) return 'ios-chrome';
    if (/Safari\//.test(ua) && !inApp && !/FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Ddg\/|YaBrowser/.test(ua)) return 'ios-safari';
    return 'ios-other';
  }
  if (/Android/.test(ua) && /Mobile/.test(ua)) {
    if (inApp) return 'android-inapp';
    if (/SamsungBrowser/.test(ua)) return 'android-samsung';
    if (/Firefox\//.test(ua)) return 'android-firefox';
    if (/Chrome\//.test(ua) && !/EdgA|OPR\/|YaBrowser|Vivaldi|DuckDuckGo/.test(ua)) return 'android-chrome';
    return 'android-other';
  }
  return null;
}

const installSheet = $('install');
const installOpen = $('install-open');
const installSteps = $('install-steps');
const installTip = $('install-tip');
const installNote = $('install-note');
const installNow = $('install-now');
const installCopy = $('install-copy');
const iconSet = $('icon-set');
const appUrl = location.origin + location.pathname;
const manualGuide = detectGuide(navigator.userAgent);
let guide = manualGuide;
let installEvent = null; // Android: vom Browser angebotene Ein-Tipp-Installation

// Baut Text mit *fett* und {symbol} sicher zusammen – nur Textknoten, kein HTML
function richText(el, text) {
  el.replaceChildren();
  for (const part of text.split(/(\{\w+\}|\*[^*]+\*)/)) {
    if (part.startsWith('{')) {
      const icon = iconSet.querySelector(`[data-icon="${part.slice(1, -1)}"]`);
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.append(icon.cloneNode(true));
      el.append(chip);
    } else if (part.startsWith('*')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(1, -1);
      el.append(strong);
    } else if (part) {
      el.append(part);
    }
  }
}

function renderGuide() {
  const g = GUIDES[guide];
  const p = PLATFORMS[guide.split('-')[0]];
  $('install-lead').textContent = p.lead;
  $('install-browser').textContent = g.title;
  installSteps.replaceChildren(...g.steps.map((step) => {
    const li = document.createElement('li');
    richText(li, step);
    return li;
  }));
  richText(installTip, g.tip || '');
  installTip.hidden = !g.tip;
  installNote.textContent = p.note;
  installNote.hidden = !p.note;
  $('install-copy-row').hidden = !g.copy;
  installCopy.textContent = 'Adresse kopieren';
  installNow.hidden = guide !== 'android-prompt';
}

function openInstall() {
  renderGuide();
  if (!installSheet.open) installSheet.showModal();
}

function readHint() {
  try { return localStorage.getItem(HINT_KEY); } catch { return 'gezeigt'; } // im Zweifel nicht nerven
}
function writeHint(value) {
  try { localStorage.setItem(HINT_KEY, value); } catch { /* dann erscheint der Hinweis evtl. erneut */ }
}

const runsAsApp = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
if (runsAsApp) {
  writeHint('installiert'); // Android: Browser und App teilen den Speicher → Browser fragt nicht mehr
} else if (guide && typeof installSheet.showModal === 'function') {
  installOpen.hidden = readHint() === 'installiert';
  $('install-url').textContent = location.host + location.pathname;

  installOpen.addEventListener('click', openInstall);
  $('install-close').addEventListener('click', () => installSheet.close());

  installCopy.addEventListener('click', () => {
    const done = (text) => { installCopy.textContent = text; };
    try {
      navigator.clipboard.writeText(appUrl).then(() => done('Kopiert ✓'), () => done('Bitte von Hand kopieren'));
    } catch {
      done('Bitte von Hand kopieren');
    }
  });

  // Android-Browser bieten die Installation oft direkt an → eigener Knopf statt Anleitung.
  // Das Angebot kommt nur, wenn die App (noch) nicht installiert ist.
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!guide.startsWith('android')) return;
    event.preventDefault();
    installEvent = event;
    guide = 'android-prompt';
    installOpen.hidden = false;
    if (installSheet.open) renderGuide();
  });
  installNow.addEventListener('click', async () => {
    const event = installEvent;
    installEvent = null; // das Angebot gilt nur einmal
    guide = manualGuide;
    try {
      event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') { installSheet.close(); return; }
    } catch { /* dann eben die Anleitung */ }
    renderGuide(); // abgelehnt → Schritt-für-Schritt-Anleitung zeigen
  });
  window.addEventListener('appinstalled', () => {
    writeHint('installiert');
    installSheet.close();
    installOpen.hidden = true;
    $('installed-msg').hidden = false;
  });

  // Erster Besuch: Anleitung einmalig von selbst zeigen
  if (readHint() === null) {
    writeHint('gezeigt');
    openInstall();
  }
}

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
