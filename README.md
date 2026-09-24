# The Last Lamp at Vennard House

A browser-based detective mystery with English and Vietnamese localization.

## Writer-friendly architecture

The game engine is separated from story content. Authors can add or edit a mystery by working in `content/` rather than changing `game.js`.

```text
content/
├── stories/
│   ├── index.json
│   └── last-lamp/
│       ├── story.json
│       ├── characters.json
│       ├── locations.json
│       ├── clues.json
│       └── endings.json
├── locales/
│   ├── en/
│   │   ├── common.json
│   │   └── last-lamp.json
│   └── vi/
│       ├── common.json
│       └── last-lamp.json
└── images/
```

See `WRITER_GUIDE.md` for the step-by-step author workflow.

## Running locally

Because stories are loaded from JSON with `fetch()`, open the project through a local web server rather than double-clicking `index.html`.

For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Story selection

Stories registered in `content/stories/index.json` appear in the title screen's story selector. Each story has its own save/autosave/ending storage namespace.

## Localization

All player-facing story text belongs in the locale files. The English and Vietnamese files are validated together with:

```bash
node tools/validate-localization.js
```

The validator checks that Vietnamese contains every English localization key and reports likely copied English strings.
