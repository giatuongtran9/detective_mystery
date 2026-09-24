# Story Author Guide

This project is designed so story authors can add or edit mysteries without changing the game engine.

## Where to edit

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
       ├── common.json
       └── last-lamp.json
└── images/
```

### Edit an existing story

For ordinary story writing, edit the matching JSON file:

- `story.json` — opening, motives, opportunities, hints, deduction rules, title/description.
- `characters.json` — characters, facts, conversation topics, evidence reactions.
- `locations.json` — locations and things the player can investigate.
- `clues.json` — evidence, timeline and official report.
- `endings.json` — ending structure and ending images.
- `content/locales/en/common.json` — shared English UI text.
- `content/locales/vi/common.json` — shared Vietnamese UI text.
- `content/locales/en/<story-id>.json` — English player-facing story text.
- `content/locales/vi/<story-id>.json` — Vietnamese player-facing story text.
- `content/images/` — backgrounds, portraits and evidence images.

**Keep IDs unchanged when editing an existing story.** IDs are how the game connects scenes, clues, characters and conditions.

## Add a new story

1. Copy `content/stories/last-lamp` to a new folder, for example:

```text
content/stories/blackwood-manor/
```

2. Edit the five JSON files in the new folder.
3. Copy the two locale files:

```text
content/locales/en/blackwood-manor.json
content/locales/vi/blackwood-manor.json
```

4. Add the story to `content/stories/index.json`:

```json
{
  "id": "blackwood-manor",
  "title": "The Mystery of Blackwood Manor",
  "description": "A new detective mystery.",
  "default": false
}
```

5. Put the new story's images in `content/images/`.

The title screen automatically shows a story selector when more than one story is registered.

## Conditions

Existing conditions are stored as JSON function descriptors so the current game keeps its exact behavior. Writers normally should **not edit these** unless they understand the condition syntax.

Common examples:

```text
has("C16")
flag("consent")
asked("Pell", "you_know_lamps")
has("C03") && has("C04")
has("C05") || has("C10")
```

For a completely new story, you can initially keep the existing condition patterns and change the story text/content. More advanced branching can be added later without changing the overall folder structure.

## Localization rule

Anything the player reads belongs in the locale file. Do not put new English or Vietnamese dialogue directly into `game.js`.

If English is added, add the corresponding Vietnamese value before publishing.

## Testing

Run a local web server rather than opening `index.html` directly because the game loads JSON files with `fetch()`.

Then run:

```bash
node tools/validate-localization.js
```

The validator should report:

```text
Missing Vietnamese keys: 0
Possible untranslated Vietnamese strings: 0
```
