#!/usr/bin/env node
/*
 * Localization audit for The Last Lamp at Vennard House.
 * Run: node tools/validate-localization.js
 *
 * Reports:
 *  - missing Vietnamese keys
 *  - Vietnamese values identical to English (possible untranslated copy)
 *  - extra Vietnamese keys
 *
 * IDs, image names, flags, and other structural values are ignored.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ctx = { window: {}, console };
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
ctx.i18n = { registerTranslations: (lang, dict) => { ctx["__" + lang] = dict; } };
vm.createContext(ctx);

function merge(a, b) {
  const out = Array.isArray(a) ? a.slice() : Object.assign({}, a || {});
  Object.keys(b || {}).forEach(k => {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) out[k] = merge(out[k], b[k]);
    else out[k] = b[k];
  });
  return out;
}

const en = merge(JSON.parse(fs.readFileSync(path.join(ROOT, "content/locales/en/common.json"), "utf8")), JSON.parse(fs.readFileSync(path.join(ROOT, "content/locales/en/last-lamp.json"), "utf8")));
const vi = merge(JSON.parse(fs.readFileSync(path.join(ROOT, "content/locales/vi/common.json"), "utf8")), JSON.parse(fs.readFileSync(path.join(ROOT, "content/locales/vi/last-lamp.json"), "utf8")));

function flatten(value, prefix = "", out = {}) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([k, v]) =>
      flatten(v, prefix ? `${prefix}.${k}` : k, out)
    );
  } else {
    out[prefix] = value;
  }
  return out;
}

const technicalLeaf = /(^|\.)(id|req|suspect|img|portrait|type|go|flag|vis|kind|tl|key)$/i;
const technicalValue = /^(C\d+|T\d+|r-|x-|b-|e-|p-|[A-Za-z]+Room|[A-Za-z]+)$/;
const intentionalEnglish = new Set(["🌐 EN / VI", "ILSA MARROW", "HOB LARKIN", "NELL SPARROW", "NED BRACKEN", "Tobias Pell", "Odalys Vennard", "Ilsa Marrow", "Miss Thorne", "FENWICK & SONS", "<b>FENWICK & SONS</b>", "Tinkers' Row", "Bastian Corvane", "Dr. Ferris Quillon"]);

const ef = flatten(en), vf = flatten(vi);
const missing = Object.keys(ef).filter(k => !(k in vf));
const extra = Object.keys(vf).filter(k => !(k in ef));
const untranslated = Object.keys(ef).filter(k => {
  if (!(k in vf) || technicalLeaf.test(k)) return false;
  const a = ef[k], b = vf[k];
  if (typeof a !== "string" || typeof b !== "string" || a !== b) return false;
  return /[A-Za-z]/.test(a) && !technicalValue.test(a) && !intentionalEnglish.has(a);
});



// Referenced ui.actions keys must exist in both merged locale dictionaries.
{
  const gameSource = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  const actionKeys = [...new Set([...gameSource.matchAll(/t\(['\"](ui\.actions\.[A-Za-z0-9_]+)['\"]/g)].map(m => m[1]))];
  const missingActionKeys = actionKeys.filter(k => !(k in ef) || !(k in vf));
  console.log(`ui.actions references: ${actionKeys.length} checked, missing: ${missingActionKeys.length}`);
  if (missingActionKeys.length) {
    console.log('MISSING ui.actions:');
    missingActionKeys.forEach(k => console.log(`- ${k}`));
  }
}

console.log(`English keys: ${Object.keys(ef).length}`);
console.log(`Vietnamese keys: ${Object.keys(vf).length}`);
console.log(`Missing Vietnamese keys: ${missing.length}`);
console.log(`Possible untranslated Vietnamese strings: ${untranslated.length}`);
console.log(`Extra Vietnamese keys: ${extra.length}`);

if (missing.length) {
  console.log("\nMISSING:");
  missing.forEach(k => console.log(`- ${k}`));
}
if (untranslated.length) {
  console.log("\nPOSSIBLE UNTRANSLATED:");
  untranslated.forEach(k => console.log(`- ${k}: ${JSON.stringify(ef[k])}`));
}
if (extra.length) {
  console.log("\nEXTRA:");
  extra.forEach(k => console.log(`- ${k}`));
}

// Runtime overlay sanity check: story-specific locale data must be loaded and
// must cover player-facing base fields that are localized in the current story.
function validateRuntimeOverlay(root) {
  const storyRoot = path.join(root, 'content', 'stories', 'last-lamp');
  const viPath = path.join(root, 'content', 'locales', 'vi', 'last-lamp.json');
  const enPath = path.join(root, 'content', 'locales', 'en', 'last-lamp.json');
  const chars = readJson(path.join(storyRoot, 'characters.json')).characters || {};
  const locs = readJson(path.join(storyRoot, 'locations.json')).locations || {};
  const clues = readJson(path.join(storyRoot, 'clues.json')).clues || {};
  const story = readJson(path.join(storyRoot, 'story.json')) || {};
  const vi = readJson(viPath), en = readJson(enPath);
  const errors = [];

  if (!vi.characters || !vi.characters.Ottley || !vi.characters.Ottley.topics) {
    errors.push('Vietnamese story locale is missing characters.Ottley.topics.');
  }
  const baseOttley = (chars.Ottley && chars.Ottley.topics) || [];
  const viOttley = (vi.characters && vi.characters.Ottley && vi.characters.Ottley.topics) || [];
  for (const topic of baseOttley) {
    const translated = viOttley.find(x => x.id === topic.id);
    if (!translated || typeof translated.label !== 'string') {
      errors.push(`Vietnamese Ottley topic is incomplete: ${topic.id}`);
    }
    if (topic.beats && !translated.beats) {
      errors.push(`Vietnamese Ottley topic beats are missing: ${topic.id}`);
    }
  }

  const checkParallel = (section, baseObj, viObj, fields) => {
    Object.keys(baseObj || {}).forEach(id => {
      const b = baseObj[id], v = (viObj || {})[id];
      fields.forEach(field => {
        if (b && b[field] !== undefined && (!v || v[field] === undefined)) {
          errors.push(`Vietnamese ${section}.${id}.${field} is missing.`);
        }
      });
    });
  };
  checkParallel('characters', chars, vi.characters, ['name','role','rel','studyIntro','hostile']);
  checkParallel('locations', locs, vi.locations, ['name','short','recap']);
  checkParallel('clues', clues, vi.clues, ['title','summary','invTitle']);
  checkParallel('story', {story}, {story: vi.story}, ['title','subtitle','prologue','hints','prematureAccuse','proof']);

  if (!vi.texts || !vi.texts.topic || !vi.texts.intro || !vi.texts.clue) {
    errors.push('Vietnamese story locale is missing one or more player-facing text sections (texts.intro/topic/clue).');
  }

  // Canonical gameplay facts must never drift between languages.
  const enTimeline = en.timeline || [], viTimeline = vi.timeline || [];
  if (enTimeline.length !== viTimeline.length) errors.push('Vietnamese timeline entry count differs from English.');
  enTimeline.forEach((e, i) => {
    const v = viTimeline[i];
    if (!v || v.id !== e.id || v.m !== e.m) errors.push(`Vietnamese timeline metadata differs at ${e.id}.`);
  });
  if (JSON.stringify((en.official || {}).challengedBy || []) !== JSON.stringify((vi.official || {}).challengedBy || [])) {
    errors.push('Vietnamese official account challengedBy differs from English.');
  }
  ['Odalys','Corvane','Quillon','Cordelia','Ilsa'].forEach(id => {
    if ((chars[id] || {}).name && (vi.characters[id] || {}).name === (chars[id] || {}).name) return;
    if (!(vi.characters || {})[id]) errors.push(`Vietnamese character ${id} is missing.`);
  });
  return errors;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const runtimeErrors = validateRuntimeOverlay(root);
  if (runtimeErrors.length) {
    console.error('\nRuntime overlay errors:');
    runtimeErrors.forEach(e => console.error('- ' + e));
  } else {
    console.log('\nRuntime overlay check: PASS');
  }
  process.exitCode = (missing.length || runtimeErrors.length) ? 1 : 0;
}
