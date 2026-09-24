/* THE LAST LAMP AT VENNARD HOUSE: Localization Engine. */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'lastlamp.lang';
  const DEFAULT_LANG = 'en';
  const SUPPORTED_LANGS = ['en', 'vi'];

  const translations = {
    en: {},
    vi: {}
  };

  const listeners = [];

  function getStoredLang() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_LANGS.includes(stored)) {
        return stored;
      }
    } catch (e) {}
    return DEFAULT_LANG;
  }

  let currentLang = getStoredLang();

  function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return currentLang;
    currentLang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {}
    notifyListeners();
    return currentLang;
  }

  function getLanguage() {
    return currentLang;
  }

  function toggleLanguage() {
    return setLanguage(currentLang === 'en' ? 'vi' : 'en');
  }

  function registerTranslations(lang, dict) {
    if (!translations[lang]) translations[lang] = {};
    Object.assign(translations[lang], dict);
  }

  function getNestedValue(obj, path) {
    if (!obj) return undefined;
    const parts = path.split('.');
    let curr = obj;
    for (let i = 0; i < parts.length; i++) {
      if (curr == null) return undefined;
      curr = curr[parts[i]];
    }
    return curr;
  }

  function t(key, params) {
    let value = getNestedValue(translations[currentLang], key);
    if (value === undefined && currentLang !== 'en') {
      value = getNestedValue(translations.en, key);
    }
    if (value === undefined) {
      return key;
    }
    if (typeof value === 'string' && params) {
      Object.keys(params).forEach(k => {
        value = value.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return value;
  }

  function onChange(fn) {
    if (typeof fn === 'function') {
      listeners.push(fn);
    }
  }

  function notifyListeners() {
    listeners.forEach(fn => {
      try {
        fn(currentLang);
      } catch (e) {
        console.error('i18n listener error:', e);
      }
    });
  }

  const i18n = {
    getLanguage,
    setLanguage,
    toggleLanguage,
    registerTranslations,
    t,
    onChange,
    translations,
    SUPPORTED_LANGS
  };

  global.i18n = i18n;
})(typeof window !== 'undefined' ? window : globalThis);
