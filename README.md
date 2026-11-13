# Zähler

Minimalistische Zähler-App fürs iPhone. Sie läuft nach dem ersten Laden komplett offline, und es verlassen keine Daten das Gerät.

| Datei | Zweck |
|---|---|
| `index.html` | Seite, Sicherheitsregeln (CSP), iOS-Einstellungen |
| `styles.css` | Aussehen, Hell/Dunkel |
| `app.js` | Zählen, Schrittgröße, Reset/Rückgängig, Speichern |
| `sw.js` | Offline-Speicher und Updates (**hier steht die `VERSION`**) |
| `manifest.webmanifest` | Name, Icons, Vollbild-Modus |
| `icons/` | App-Icons (selbst erzeugt) |
| `tools/make_icons.py` | Erzeugt die Icons neu (`python3 tools/make_icons.py`), wird online nicht gebraucht |

## Lokal ausprobieren (Mac)

```bash
cd "Pfad/zum/Ordner"
python3 -m http.server 8000 --bind 127.0.0.1
```

Danach im Browser `http://127.0.0.1:8000/` öffnen. Beenden mit `Ctrl + C`.

## 1. Repository anlegen und Dateien hochladen

1. Auf [github.com](https://github.com) anmelden, oben rechts **+** → **New repository**.
2. Name, z. B. `zaehler`. Sichtbarkeit **Public**, denn GitHub Pages ist für private Repositories nur mit Bezahl-Abo verfügbar. Der Code enthält keine persönlichen Daten.
3. **Create repository** klicken.
4. Auf der neuen Seite den Link **uploading an existing file** anklicken.
5. Im Finder den Projektordner öffnen und **alle Dateien und den Ordner `icons`** in das Upload-Feld ziehen. Den Ordner selbst nicht mitziehen, sonst liegt `index.html` nicht ganz oben.
6. Kontrollieren, dass die Liste `index.html`, `sw.js`, … und `icons/icon-180.png` usw. zeigt.
7. Unten **Commit changes** klicken.

## 2. GitHub Pages aktivieren

1. Im Repository oben **Settings** → links **Pages**.
2. Unter **Build and deployment** → **Source**: „Deploy from a branch“.
3. **Branch**: `main`, Ordner `/ (root)` → **Save**.
4. 1–2 Minuten warten und die Seite neu laden. Oben erscheint die Adresse, z. B. `https://DEINNAME.github.io/zaehler/`.
5. Falls angeboten, **Enforce HTTPS** anhaken. Bei `github.io` ist das meist schon fest aktiviert.

## 3. Zwei-Faktor-Authentifizierung (2FA) aktivieren

Wer deinen GitHub-Account kontrolliert, kann den Code der App ändern. Dein iPhone würde diese Version beim nächsten Online-Start laden. Deshalb:

1. GitHub → Profilbild oben rechts → **Settings** → **Password and authentication**.
2. **Enable two-factor authentication** und dem Assistenten folgen. Die Codes kommen z. B. aus der iPhone-App „Passwörter“ (Bestätigungscodes) oder einer Authenticator-App.
3. Die **Recovery Codes** herunterladen und sicher aufbewahren, z. B. ausgedruckt.
4. Optional zusätzlich einen **Passkey** einrichten (gleiche Seite).

## 4. Auf dem iPhone installieren

1. In **Safari** die Adresse aus Schritt 2 öffnen.
2. **Teilen**-Symbol (Quadrat mit Pfeil) → **Zum Home-Bildschirm**.
3. Wenn der Schalter **Als Web-App öffnen** erscheint, eingeschaltet lassen. Dann **Hinzufügen**.
4. **Die App einmal vom Home-Bildschirm aus öffnen, solange du online bist.** iOS gibt Home-Bildschirm-Apps einen eigenen Speicher, getrennt von Safari. Erst dieser Start macht die App offline-fähig. Ein Zählerstand aus dem Safari-Tab erscheint deshalb nicht in der App.

## 5. Offline-Funktion prüfen

1. App vom Home-Bildschirm öffnen (online), ein paar Sekunden warten, etwas zählen.
2. App ganz schließen: vom unteren Rand nach oben wischen und halten, dann die App nach oben wegwischen.
3. **Flugmodus** an (WLAN ggf. auch aus).
4. App öffnen. Sie startet normal, der Zählerstand ist noch da, Zählen, Reset und Rückgängig funktionieren.

## 6. Updates einspielen

1. Dateien ändern.
2. In `sw.js` die Zeile `const VERSION = 1;` um eins erhöhen (`2`, beim nächsten Mal `3`, …). **Ohne diesen Schritt bemerkt das iPhone das Update nicht.**
3. Auf GitHub: **Add file** → **Upload files**, geänderte Dateien hineinziehen (gleiche Namen ersetzen die alten) → **Commit changes**. Kleine Änderungen gehen auch direkt im Browser: Datei anklicken → Stift-Symbol.
4. 1–2 Minuten warten. Unter dem Reiter **Actions** zeigt ein grüner Haken, dass die neue Version online ist.
5. App auf dem iPhone online öffnen (oder kurz zu einer anderen App wechseln und zurück). Oben erscheint **„Update verfügbar – neu laden“**. Tippen, fertig. Wenn du nicht tippst, kommt die neue Version beim nächsten vollständigen Neustart der App.

## 7. Optional: Fehlersuche mit dem Safari Web-Inspektor (Mac)

1. iPhone: **Einstellungen → Apps → Safari → Erweitert → Web-Inspektor** einschalten.
2. Mac: **Safari → Einstellungen → Erweitert →** „Funktionen für Webentwickler anzeigen“ anhaken.
3. iPhone per Kabel verbinden, „Diesem Computer vertrauen“ bestätigen. Die App (oder Safari mit der Seite) öffnen.
4. Mac-Safari → Menü **Entwickler** → dein iPhone → „Zähler“. In der **Konsole** sollten keine roten Fehler stehen.

## Verhalten im Detail

- Wertebereich 0 bis 999.999.999. Ein Schritt über die Grenze hinaus wird auf die Grenze begrenzt (z. B. 3 − 5 = 0).
- Reset setzt sofort auf 0. 10 Sekunden lang kann man rückgängig machen, auch nach Schließen oder Neuladen der App. Wird in dieser Zeit + oder − gedrückt, stellt „Rückgängig“ trotzdem den Wert **vor** dem Reset wieder her.
- Gespeichert wird in `localStorage` unter dem Schlüssel `zaehler-app` im Format `{ v: 1, count, step, undo }`.

## Hinweis „Als App nutzen“

- Erscheint nur auf **Handys im Browser**, nicht in der installierten App, nicht auf Tablets oder Computern.
- Beim **ersten Besuch** öffnet sich die Anleitung einmal von selbst. Danach ist sie über den Knopf **„Als App nutzen“** oben links erreichbar.
- Die Anleitung passt sich an Handy und Browser an:

  | Gerät | Browser | Anleitung |
  |---|---|---|
  | iPhone | Safari | Teilen → Zum Home-Bildschirm |
  | iPhone | Chrome | Teilen in der Adressleiste, sonst Safari |
  | iPhone | Firefox, Edge, Apps wie Instagram usw. | In Safari öffnen (mit „Adresse kopieren“) |
  | Android | Browser bietet Installation an | Knopf **„Jetzt installieren“** (ein Tipp) |
  | Android | Chrome, Samsung Internet, Firefox | eigene Schritt-Anleitung |
  | Android | andere Browser | allgemeine Anleitung |
  | Android | Apps wie Instagram, WhatsApp | Im Browser öffnen |

- Die Texte stehen in `app.js` unter `GUIDES`. `*fett*` markiert Knopf-Namen, `{teilen}`, `{punkte}`, `{dreipunkte}`, `{menue}` und `{plus}` fügen Symbole ein.
- Gemerkt wird nur, ob der Hinweis schon gezeigt wurde (`localStorage`-Schlüssel `zaehler-hinweis`).
