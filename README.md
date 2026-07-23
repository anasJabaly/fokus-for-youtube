# Fokus für YouTube 🍃

Eine Browser-Erweiterung, die Musik- und Unterhaltungsinhalte auf YouTube blockiert
und dir stattdessen einen **Moment der Achtsamkeit** schenkt.

## Was sie macht

- **Blockiert Suchen** nach Musik/Unterhaltung (Begriffe frei anpassbar, DE/EN/AR vorbelegt)
- **Blockiert Musik-Videos** — erkennt die YouTube-Kategorie „Musik" automatisch + Titel-Keywords
- **Blockiert Shorts** komplett (abschaltbar)
- **Optional:** Startseiten-Feed ausblenden — YouTube nur noch für gezielte Suche & Abos
- **Strikter Modus** (Standard): kein Durchkommen. Alternativ: „Trotzdem ansehen" erst nach 15 s Wartezeit (bewusste Reibung statt Verbot)

## Installation (Chrome / Edge / Brave / Opera)

1. Diesen Ordner an einen festen Ort legen (nicht löschen!)
2. Browser öffnen → Adresszeile: `chrome://extensions` (Edge: `edge://extensions`)
3. Oben rechts **„Entwicklermodus"** aktivieren
4. **„Entpackte Erweiterung laden"** klicken → diesen Ordner auswählen
5. Fertig — YouTube öffnen und testen (z.B. nach „musik" suchen)

## Einstellungen

Klick auf das Erweiterungs-Symbol in der Browserleiste:
- Schalter für Shorts / Feed / Strikter Modus
- Blockliste bearbeiten (ein Begriff pro Zeile)

## Anpassen

- Wartezeit ändern: `waitSeconds` in `content.js` (Standard 15)
- Spruch/Erinnerung ändern: im `showOverlay()`-HTML in `content.js`

## Technik

Manifest V3 · Content Script · chrome.storage.sync · reagiert auf YouTubes
SPA-Navigation (`yt-navigate-finish`) · erkennt Musik über `<meta itemprop="genre">`
