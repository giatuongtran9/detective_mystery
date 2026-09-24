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
const intentionalEnglish = new Set(["🌐 EN / VI", "ILSA MARROW", "HOB LARKIN", "NELL SPARROW", "NED BRACKEN", "Tobias Pell", "Odalys Vennard", "Ilsa Marrow", "Miss Thorne", "FENWICK & SONS", "<b>FENWICK & SONS</b>"]);

const ef = flatten(en), vf = flatten(vi);
const missing = Object.keys(ef).filter(k => !(k in vf));
const extra = Object.keys(vf).filter(k => !(k in ef));
const untranslated = Object.keys(ef).filter(k => {
  if (!(k in vf) || technicalLeaf.test(k)) return false;
  const a = ef[k], b = vf[k];
  if (typeof a !== "string" || typeof b !== "string" || a !== b) return false;
  return /[A-Za-z]/.test(a) && !technicalValue.test(a) && !intentionalEnglish.has(a);
});

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

process.exitCode = missing.length ? 1 : 0;
