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
  // Tipp auf den abgedunkelten Hintergrund schließt ebenfalls
  installSheet.addEventListener('click', (event) => {
    if (event.target === installSheet) installSheet.close();
  });

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
