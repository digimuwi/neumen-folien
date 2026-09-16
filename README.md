# Adiastematische Neumen in MEI

Fünf Browser-Folien zum Verovio-Fork für St. Galler Neumen, zum eChant-Editor, zur Erkennung St. Galler Neumen in eChant und zur Rolle von Claude Code bei der Entwicklung. Team: Morent, Böttiger, Pfeffer (Universität Tübingen).

## Präsentieren

`index.html` in Chrome, Safari oder Firefox öffnen. Alles liegt lokal, die Folien funktionieren also auch offline.

| Taste | Funktion |
|---|---|
| → / Leertaste | nächste Folie oder nächster Schritt (Folien 2 und 4 haben je einen zusätzlichen Schritt) |
| S | Sprechernotizen |
| F | Vollbild |
| Esc | Übersicht |

## Aufbau

- `index.html`, `deck.css`: die Folien ([reveal.js](https://revealjs.com) 6, MIT).
- `assets/`: nur, was die Folien zeigen.
- `lib/`: reveal.js, EB Garamond und Inter (beide SIL OFL, über Fontsource).
- `research/`: Belege zu den Folien und nicht verwendete Abbildungen. `python3 research/claude/deck_chart.py` erzeugt das Diagramm auf Folie 5 aus `research/claude/stats.json` neu. Die Skripte in `research/claude/scripts/` legen bei erneutem Aufruf Prompt-Texte in ihrem Verzeichnis ab. `research/` sollte deshalb privat bleiben.

## Nachweise

- Einsiedeln, Stiftsbibliothek, Codex 121(1151), S. 35, sowie St. Gallen, Stiftsbibliothek, Cod. Sang. 338, S. 75, und Cod. Sang. 390, S. 115, alle über [e-codices](https://www.e-codices.ch), CC BY-NC 4.0.
- Darstellung mit einem Fork von [Verovio](https://www.verovio.org) (RISM Digital) und dessen Neumenmodul von DDMAL, Kodierung nach dem MEI-Modul für Neumen.
- Neumennamen nach Eugène Cardine, *Semiologia gregoriana*, Rom 1968.
- Der eChant-Editor beruht auf dem neumes-editor, überwiegend von Jonas Böttiger entwickelt.
- Texterkennung mit [Kraken](https://kraken.re) und dem TRIDIS-Modell (Torres Aguilar 2024).
- Das Logo der Eberhard Karls Universität Tübingen steht für die Zugehörigkeit des Teams.
