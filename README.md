# Fokus für YouTube 🍃

Eine Browser-Erweiterung, die Musik- und Unterhaltungsinhalte auf YouTube blockiert
und dir stattdessen einen **Moment der Achtsamkeit** schenkt.

## Was sie macht

- **Blockiert Suchen** nach Musik/Unterhaltung auf YouTube und in der Google-Suche (Begriffe frei anpassbar, DE/EN/AR vorbelegt)
- **Blockiert Musik-Videos** — erkennt die YouTube-Kategorie „Musik" automatisch + Titel-Keywords
- **Blockiert Shorts** komplett (abschaltbar)
- **Sperrt YouTube Music** (music.youtube.com, abschaltbar)
- **Feed-Filter:** nur erlaubte Themen zeigen oder blockierte entfernen, Kanäle per ⊘/✓ auf der Kachel
- **Optional:** Startseiten-Feed ausblenden — YouTube nur noch für gezielte Suche & Abos
- **Strikter Modus** (Standard): kein Durchkommen. Alternativ: „Trotzdem ansehen" erst nach Wartezeit (bewusste Reibung statt Verbot)
- **Einstellungen sperren:** Änderungen erst nach einer Wartezeit möglich, damit man die Sperre nicht im Affekt abschaltet

## Schreibweise der Begriffe

| Eintrag | Wirkung |
|---|---|
| `musik` (ab 5 Zeichen) | trifft überall, auch in „Hintergrundmusik" |
| `lied` (bis 4 Zeichen) | trifft nur am Wortanfang: „Lieder" ja, „applied" nein |
| `=rap` | trifft nur das ganze Wort: „Rap" ja, „Graph" und „Rapid" nein |

## Installation (Chrome / Edge / Brave / Opera)

1. Diesen Ordner an einen festen Ort legen (nicht löschen!)
2. Browser öffnen → Adresszeile: `chrome://extensions` (Edge: `edge://extensions`)
3. Oben rechts **„Entwicklermodus"** aktivieren
4. **„Entpackte Erweiterung laden"** klicken → diesen Ordner auswählen
5. Fertig — YouTube öffnen und testen (z.B. nach „musik" suchen)

## Einstellungen

Klick auf das Erweiterungs-Symbol in der Browserleiste:
- Schalter für Shorts / Feed / YouTube Music / Google-Suche / Strikter Modus
- Wartezeit und Einstellungs-Sperre
- Listen bearbeiten (ein Begriff pro Zeile), „Standardlisten wiederherstellen"

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/shared.js` | Standardwerte, Begriffs-Abgleich, Overlay (eine Quelle für alle) |
| `src/content.js` | YouTube: Sperren, Feed-Filter, Werbung stumm |
| `src/bridge.js` | liest Kategorie/Titel des aktuellen Videos aus dem Player |
| `src/google.js` | Google-Suche: blockierte Begriffe |
| `src/popup.html`, `src/popup.js` | Einstellungen |
| `src/overlay.css` | Aussehen von Overlay und Kachel-Knöpfen |

## Technik

Manifest V3 · Content Scripts · chrome.storage.sync · reagiert auf YouTubes
SPA-Navigation (`yt-navigate-finish`) · Musik-Erkennung über die Player-Daten,
ersatzweise über `<meta itemprop="genre">`
