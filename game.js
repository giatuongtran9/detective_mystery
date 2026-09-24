/* THE LAST LAMP AT VENNARD HOUSE: game engine.
   Content lives in /data and /locales. This file holds the logic only. */
(function () {
  'use strict';

  const KEY = 'lastlamp.save.v1', AUTO = 'lastlamp.auto.v1', SETTINGS = 'lastlamp.settings.v1', ENDS = 'lastlamp.endings.v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const E = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // Localized data accessors
  const t = (key, params) => typeof i18n !== 'undefined' ? i18n.t(key, params) : key;
  const getLocaleData = () => {
    if (typeof i18n === 'undefined') return {};
    const lang = i18n.getLanguage();
    return (i18n.translations && i18n.translations[lang]) || (i18n.translations && i18n.translations.en) || {};
  };

  const RAW_STORY = window.STORY || {};
  const RAW_LOCS = window.LOCS || {};
  const RAW_CHARS = window.CHARS || {};
  const RAW_CLUES = window.CLUES || {};
  const RAW_TIMELINE = window.TIMELINE || [];
  const RAW_TEXTS = window.TEXTS || {};
  const RAW_DISPLAY = window.DISPLAY || {};
  const RAW_PORTRAITS = window.PORTRAITS || {};
  const RAW_LOCKED = window.LOCKED_TEXT || {};
  const RAW_OFFICIAL = window.OFFICIAL || {};

  const getClue = id => {
    const base = RAW_CLUES[id] || {};
    const loc = (getLocaleData().clues || {})[id] || {};
    return Object.assign({}, base, loc);
  };

  const getLoc = id => {
    const base = RAW_LOCS[id] || {};
    const loc = (getLocaleData().locations || {})[id] || {};
    const objList = (base.objects || []).map(o => {
      const oLoc = (loc.objects || []).find(x => x.id === o.id) || {};
      return Object.assign({}, o, oLoc);
    });
    return Object.assign({}, base, loc, { objects: objList });
  };

  const getChar = id => {
    const base = RAW_CHARS[id] || {};
    const loc = (getLocaleData().characters || {})[id] || {};
    const factsList = (base.facts || []).map((f, idx) => {
      const fLoc = (loc.facts || [])[idx] || {};
      return Object.assign({}, f, fLoc);
    });
    const topicsList = (base.topics || []).map(tp => {
      const tpLoc = (loc.topics || []).find(x => x.id === tp.id) || {};
      return Object.assign({}, tp, tpLoc);
    });
    return Object.assign({}, base, loc, { facts: factsList, topics: topicsList });
  };

  const getTexts = () => {
    return getLocaleData().texts || RAW_TEXTS;
  };

  const getStory = () => {
    const base = RAW_STORY;
    const loc = getLocaleData().story || {};
    return Object.assign({}, base, loc);
  };

  const getTimeline = () => {
    const base = RAW_TIMELINE;
    const locTL = getLocaleData().timeline || [];
    return base.map(item => {
      const locItem = locTL.find(x => x.id === item.id) || {};
      return Object.assign({}, item, locItem);
    });
  };

  const getDisplay = () => {
    return getLocaleData().display || RAW_DISPLAY;
  };

  const getLockedText = () => {
    return getLocaleData().locked_text || RAW_LOCKED;
  };

  const getOfficial = () => {
    const base = RAW_OFFICIAL;
    const loc = getLocaleData().official || {};
    return Object.assign({}, base, loc);
  };

  let run = null;            // the scene currently being played
  let typing = null;         // the typewriter currently running
  let settings = Object.assign({ type: true, sound: false }, JSON.parse(store.get(SETTINGS) || '{}'));
  window.G = null;
  let activePanelName = null;

  const log = $('#log'), actions = $('#actions'), drawer = $('#drawer'), drawerBody = $('#drawerBody');

  /* ============================== STATE ============================== */
  window.has = id => !!(G && G.clues[id]);
  window.flag = k => !!(G && G.flags[k]);
  const clueCount = () => Object.keys(G.clues).length;
  const SUSPECTS = ['Pell', 'Odalys', 'Corvane', 'Quillon', 'Cordelia', 'Ilsa'];

  function newState() {
    const s = { v: 1, loc: 'study', mode: 'hub', turn: 0, clues: {}, sus: {}, examined: {}, talked: {}, asked: {}, flags: {}, defensive: {},
      broken: {}, tl: {}, hyps: [], decisions: [], unlocked: {}, seenLoc: {}, items: {}, hints: 0, ending: null };
    SUSPECTS.forEach(n => s.sus[n] = (getChar(n).startSus != null ? getChar(n).startSus : 5));
    return s;
  }
  function addSus(name, n) { if (G.sus[name] == null) return; G.sus[name] = Math.max(0, Math.min(100, G.sus[name] + n)); }

  function applyFx(fx) {
    if (typeof fx === 'function') fx = fx();
    if (!fx) return;
    if (fx.flag) Object.assign(G.flags, fx.flag);
    if (fx.sus) Object.keys(fx.sus).forEach(k => addSus(k, fx.sus[k]));
    if (fx.item) G.items[fx.item] = true;
  }

  function refreshUnlocks(silent) {
    const fresh = [];
    Object.keys(UNLOCKS).forEach(id => {
      if (UNLOCKS[id]() && !G.unlocked[id]) { G.unlocked[id] = true; fresh.push(id); }
    });
    return silent ? [] : fresh;
  }

  function updateEvidence() { $('#badge-evidence').textContent = clueCount(); }
  function updateTimeline() { /* entries derived when panel opens */ }
  function updateGameState() { G.turn++; updateEvidence(); autosave(); }

  function discoverClue(id) {
    if (G.clues[id]) return false;
    G.clues[id] = ++G.turn;
    const c = getClue(id);
    if (c.sus) Object.keys(c.sus).forEach(k => addSus(k, c.sus[k]));
    (c.tl || []).forEach(t => G.tl[t] = true);
    updateEvidence(); updateTimeline();
    return true;
  }

  /* ============================== STAGE ============================== */
  let bgFlip = false, currentBg = null;
  function setStage(img, name) {
    $('#locname').textContent = name || '';
    if (img === currentBg) return;
    currentBg = img;
    const next = bgFlip ? $('#bgA') : $('#bgB'), prev = bgFlip ? $('#bgB') : $('#bgA');
    bgFlip = !bgFlip;
    const test = new Image();
    test.onload = () => { next.classList.remove('stage-fallback'); next.textContent = ''; next.style.backgroundImage = 'url(content/images/' + img + '.webp)'; next.classList.add('on'); prev.classList.remove('on'); };
    test.onerror = () => { next.style.backgroundImage = ''; next.classList.add('stage-fallback', 'on'); next.textContent = name || ''; prev.classList.remove('on'); };
    test.src = 'content/images/' + img + '.webp';
  }

  /* ============================== TEXT OUTPUT ============================== */
  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function clearLog() { log.innerHTML = ''; }
  function stopTyping() { if (typing) { typing.finish(); } }

  function typeInto(elm, done) {
    if (!settings.type) { done(); return; }
    const nodes = []; const w = document.createTreeWalker(elm, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { nodes.push({ n, t: n.nodeValue }); n.nodeValue = ''; }
    const total = nodes.reduce((a, x) => a + x.t.length, 0);
    if (!total) { done(); return; }
    const per = Math.max(1, Math.ceil(total / 110));
    let ni = 0, ci = 0, over = false;
    const timer = setInterval(() => {
      for (let k = 0; k < per; k++) {
        if (ni >= nodes.length) { finish(); return; }
        ci++; nodes[ni].n.nodeValue = nodes[ni].t.slice(0, ci);
        if (ci >= nodes[ni].t.length) { ni++; ci = 0; }
      }
      scrollLog();
    }, 16);
    function finish() {
      if (over) return; over = true; clearInterval(timer);
      nodes.forEach(x => x.n.nodeValue = x.t); typing = null; scrollLog(); done();
    }
    typing = { finish };
  }

  function avatar(who) {
    const a = E('div', 'av'); const f = (run && run.opts && run.opts.portrait && run.opts.portrait[who]) || RAW_PORTRAITS[who];
    const disp = getDisplay();
    a.textContent = (disp[who] || who).replace(/^(MR\.|DR\.|MISS|SERGEANT|CHIEF|LADY|OLD|MRS\.|NURSE|ÔNG|BÁC SĨ|CÔ|THƯỢNG SĨ|CẢNH SÁT TRƯỞNG|PHU NHÂN|DUNSTAN|BÀ|Y TÁ)\s+/, '').charAt(0);
    if (f) { const i = new Image(); i.alt = ''; i.onerror = () => i.remove(); i.src = 'content/images/' + f + '.webp'; a.appendChild(i); }
    return a;
  }

  function showNarration(text, done, instant) {
    const p = E('p', 'narr', text); log.appendChild(p); scrollLog();
    if (instant) done && done(); else typeInto(p, done || (() => {}));
  }
  function showDialogue(who, text, isYou, done, instant) {
    const wrap = E('div', 'say' + (isYou ? ' you' : ''));
    const key = isYou ? 'You' : who;
    wrap.appendChild(avatar(key));
    const disp = getDisplay();
    const nameStr = isYou ? t('ui.labels.you') : (disp[key] || String(key).toUpperCase());
    const body = E('div', 'body'); body.appendChild(E('div', 'name', nameStr));
    const tEl = E('div', 'txt', text); body.appendChild(tEl); wrap.appendChild(body); log.appendChild(wrap); scrollLog();
    if (instant) done && done(); else typeInto(tEl, done || (() => {}));
  }
  function showDoc(lines) {
    const d = E('div', 'doc'); lines.forEach(l => d.appendChild(E('p', '', l))); log.appendChild(d); scrollLog();
  }
  function showClueBanner(id) {
    const c = getClue(id); const b = E('div', 'clue-banner',
      '<div class="cb-label">◆ ' + t('ui.actions.clue_discovered_label', 'CLUE DISCOVERED') + '</div><div class="cb-title">' + c.title + '</div><div class="cb-sum">' + c.summary + '</div>');
    if (c.img) { const i = new Image(); i.className = 'clue-img'; i.alt = ''; i.onerror = () => i.remove(); i.src = 'content/images/' + c.img + '.webp'; b.appendChild(i); }
    log.appendChild(b); scrollLog();
  }
  function showNotice(tStr) { log.appendChild(E('div', 'notice', tStr)); scrollLog(); }

  function setActions(list, title) {
    actions.innerHTML = '';
    if (title) actions.appendChild(E('div', 'act-title', title));
    list.forEach(a => {
      if (a.heading) { actions.appendChild(E('div', 'act-heading', a.heading)); return; }
      const b = E('button', 'choice ' + (a.cls || '') , a.text + (a.note ? '<span class="note">' + a.note + '</span>' : ''));
      if (a.disabled) b.disabled = true;
      b.addEventListener('click', () => { if (!b.disabled) a.fn(); });
      actions.appendChild(b);
    });
    actions.scrollTop = 0;
  }
  function showChoices(list, title) { setActions(list, title || t('ui.actions.what_will_you_do')); }
  function showContinue() {
    actions.innerHTML = '';
    const b = E('button', 'continue', t('ui.actions.continue')); b.addEventListener('click', advance); actions.appendChild(b);
    try { b.focus({ preventScroll: true }); } catch (e) {}
  }

  /* ============================== SCENE PLAYER ============================== */
  function play(beats, done, opts) {
    stopTyping();
    run = { beats: (beats || []).slice(), i: 0, done: done || showHub, opts: opts || {} };
    actions.innerHTML = '';
    if (run.opts.instant) { playInstant(); return; }
    advance();
  }

  function playInstant() {
    const r = run; const done = r.done;
    r.beats.forEach(b => {
      if (b.n != null) showNarration(b.n, null, true);
      else if (b.y != null) showDialogue('You', b.y, true, null, true);
      else if (b.s) showDialogue(b.s, b.t, false, null, true);
      else if (b.doc) showDoc(b.doc);
      else if (b.clue) showNotice(t('ui.evidence.already_in_evidence', { title: getClue(b.clue).title }));
    });
    run = null;
    setActions([{ text: t('ui.actions.back'), fn: done }]);
  }

  function advance() {
    if (typing) { typing.finish(); return; }
    if (!run) return;
    if (run.i >= run.beats.length) { const d = run.done; run = null; actions.innerHTML = ''; d && d(); return; }
    const b = run.beats[run.i++];
    const next = () => { if (run) showContinue(); };
    if (b.n != null) showNarration(b.n, next);
    else if (b.y != null) showDialogue('You', b.y, true, next);
    else if (b.s) showDialogue(b.s, b.t, false, next);
    else if (b.doc) { showDoc(b.doc); next(); }
    else if (b.clue) { discoverBeat(b.clue); next(); }
    else if (b.do) { b.do(); advance(); }
    else if (b.choice) {
      const r = run, d = r.done; run = null;
      showChoices(b.choice.map(o => ({ text: o.text, fn: () => { applyFx(o.fx); play(o.beats || [], d, r.opts); } })), b.prompt);
    } else advance();
  }

  function notifyUnlocks() {
    refreshUnlocks(false).forEach(l => { if (!getLoc(l).hidden) log.appendChild(E('div', 'notice', t('ui.toasts.new_location_map', { short: getLoc(l).short }))); });
  }

  function discoverBeat(id) {
    const isNew = discoverClue(id);
    if (isNew) { showClueBanner(id); refreshUnlocks(false).forEach(l => showNotice(t('ui.toasts.new_location_map', { short: getLoc(l).short }))); autosave(); }
    else showNotice(t('ui.evidence.already_in_evidence', { title: getClue(id).title }));
  }

  /* ============================== LOCATIONS ============================== */
  function changeLocation(id) {
    if (run) return;
    G.loc = id;
    if (id === 'watch') G.flags.labVisited = true;
    const L = getLoc(id); setStage(L.img, L.short);
    const first = !G.seenLoc[id]; G.seenLoc[id] = true;
    const locBeats = getTexts().loc ? getTexts().loc[id] : null;
    if (first && locBeats) { clearLog(); play(locBeats, showHub); } else showHub();
  }

  function showHub() {
    stopTyping(); run = null; G.mode = 'hub';
    const L = getLoc(G.loc); setStage(L.img, L.short); clearLog();
    log.appendChild(E('div', 'locname-head', L.name));
    log.appendChild(E('p', 'narr', L.recap));
    notifyUnlocks();
    const list = [{ heading: t('ui.actions.investigate_heading') }];
    L.objects.filter(o => !o.vis || o.vis()).forEach(o => {
      const done = G.examined[G.loc + '.' + o.id];
      list.push({ text: (done ? '✓ ' : '') + o.label, cls: done ? 'done' : '', fn: () => investigateObject(o) });
    });
    if (L.people.length) {
      list.push({ heading: t('ui.actions.speak_to_heading') });
      L.people.forEach(p => list.push({ text: t('ui.actions.speak_to_person', { name: getChar(p).name }), fn: () => interviewSuspect(p) }));
    }
    list.push({ heading: t('ui.actions.move_on_heading') }, { text: t('ui.actions.go_somewhere_else'), fn: () => openPanel('map') });
    showChoices(list, t('ui.actions.what_will_you_do'));
    autosave();
  }

  function investigateObject(o) {
    if (run) return;
    if (o.go) { changeLocation(o.go); return; }
    if (o.type === 'safe') { safeUI(); return; }
    const key = G.loc + '.' + o.id;
    if (o.emptied && o.emptied() && !has(o.clue)) { clearLog(); play(o.emptyBeats, showHub); return; }
    if (o.req && !o.req()) { clearLog(); play(o.lockedBeats || [{ n: t('ui.actions.cannot_do_yet', 'You cannot do that yet.') }], showHub); return; }
    let beats;
    if (o.beatsFn) beats = o.beatsFn(); else if (o.beats) beats = o.beats;
    else {
      beats = []; if (o.intro) beats.push({ n: o.intro });
      const clueBeats = (getTexts().clue || {})[o.clue] || [];
      beats = beats.concat(clueBeats); beats.push({ clue: o.clue });
    }
    const before = !!G.examined[key];
    G.examined[key] = true;
    clearLog();
    log.appendChild(E('div', 'locname-head', getLoc(G.loc).short));
    play(beats, showHub, { instant: before });
  }

  function safeUI() {
    clearLog();
    log.appendChild(E('div', 'locname-head', getLoc(G.loc).short));
    if (flag('safeOpen')) { play([{ n: t('ui.safe.open_desc', 'The safe stands open. The ledger page, the drawings and the contract are yours to take.') }], showHub); return; }
    log.appendChild(E('p', 'narr', t('ui.safe.prompt')));
    actions.innerHTML = '';
    actions.appendChild(E('div', 'act-title', t('ui.safe.title')));
    const wrap = E('div', 'safe-ui');
    const inp = E('input'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 4; inp.placeholder = '····'; inp.autocomplete = 'off';
    const go = E('button', 'btn amber', t('ui.safe.btn_turn'));
    const back = E('button', 'btn', t('ui.safe.btn_away'));
    const msg = E('div', 'warn', '');
    const tryIt = () => {
      if (inp.value.trim() === '1166') {
        G.flags.safeOpen = true; G.decisions.push('Opened the Master\'s safe.');
        clearLog(); play([
          { n: t('ui.safe.opened_beat1', 'The wheels click one by one. The bolts draw back with a soft sound, as if the safe has been waiting.') },
          { n: t('ui.safe.opened_beat2', 'Inside: a ledger page, a roll of drawings, a contract bound in blue ribbon.') }
        ], showHub);
      } else { msg.textContent = t('ui.safe.wrong_msg'); wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); }
    };
    go.addEventListener('click', tryIt); inp.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
    back.addEventListener('click', showHub);
    wrap.append(inp, go, back); actions.append(wrap, msg);
    try { inp.focus({ preventScroll: true }); } catch (e) {}
  }

  /* ============================== SUSPECTS ============================== */
  function interviewSuspect(who) {
    if (run) return;
    G.mode = 'talk:' + who; const C = getChar(who);
    clearLog(); log.appendChild(E('div', 'locname-head', t('ui.actions.in_conversation', { name: C.name })));
    const menu = () => talkMenu(who);
    if (!G.talked[who]) {
      G.talked[who] = true;
      let intro = ((getTexts().intro || {})[who] || []).slice();
      if (who === 'Pell' && G.loc === 'study' && C.studyIntro) intro = C.studyIntro.concat(intro.slice(2));
      if (who === 'Ilsa' && C.hostile) intro = intro.concat(C.hostile);
      if (who === 'Ottley') intro = [{ n: t('ui.actions.ottley_waiting_intro') }];
      play(intro, menu);
    } else if (who === 'Ottley') { play([{ n: t('ui.actions.ottley_looks_up') }], menu); }
    else menu();
  }

  function talkMenu(who) {
    stopTyping(); run = null; G.mode = 'talk:' + who; const C = getChar(who);
    const list = [];
    if (G.defensive[who]) {
      log.appendChild(E('p', 'narr', t('ui.actions.defensive_text', { name: C.name })));
    } else if (who === 'Ilsa' && !flag('ilsaTalks')) {
      log.appendChild(E('p', 'narr', t('ui.actions.ilsa_silent_text', 'Ilsa keeps her back to you and her hands on the bench. She will not be led.')));
    }
    notifyUnlocks(); scrollLog();
    if (!G.defensive[who]) {
      list.push({ heading: t('ui.actions.ask_heading') });
      C.topics.forEach(tItem => {
        if (tItem.hideIf && tItem.hideIf()) return;
        if (tItem.when && !tItem.when()) return;
        const src = ((getTexts().topic || {})[who] || {})[tItem.id];
        const label = tItem.label || (src && src.label) || tItem.id;
        const dis = tItem.disabled ? tItem.disabled() : null;
        const was = G.asked[who + '.' + tItem.id];
        list.push({ text: (was ? '✓ ' : '') + label, cls: was ? 'done' : '', fn: () => askTopic(who, tItem), disabled: !!dis, note: dis || '' });
      });
    }
    if (!C.npc) {
      list.push({ heading: t('ui.actions.press_heading') });
      list.push({ text: t('ui.actions.present_evidence_option'), fn: () => presentMenu(who) });
      list.push({ text: t('ui.actions.accuse_suspect_option', { name: C.name }), cls: 'danger', fn: () => earlyAccuse(who) });
    }
    list.push({ heading: t('ui.actions.leave_heading') }, { text: t('ui.actions.end_conversation'), fn: showHub });
    showChoices(list, t('ui.actions.what_will_you_say', { name: C.name }));
    autosave();
  }

  function askTopic(who, tItem) {
    const src = ((getTexts().topic || {})[who] || {})[tItem.id];
    let beats;
    if (tItem.hint) { G.hints = Math.min(G.hints + 1, 3); beats = [{ y: t('ui.actions.ask_ottley_hint_y') }, { s: 'Ottley', t: getStory().hints[G.hints - 1] }]; }
    else if (tItem.clue) beats = ((getTexts().clue || {})[tItem.clue] || []).concat([{ clue: tItem.clue }]);
    else if (tItem.beatsFn) beats = tItem.beatsFn();
    else beats = tItem.beats || (src ? src.beats : []);
    G.asked[who + '.' + tItem.id] = true;
    applyFx(tItem.fxFn ? tItem.fxFn : tItem.fx);
    if (tItem.id === 'consent' || tItem.id === 'room') G.decisions.push(tItem.label);
    play(beats, () => talkMenu(who));
  }

  function presentMenu(who) {
    const ids = Object.keys(G.clues).sort((a, b) => G.clues[b] - G.clues[a]);
    const list = [{ heading: t('ui.actions.choose_what_to_show') }];
    if (!ids.length) list.push({ text: t('ui.actions.nothing_to_show'), fn: () => talkMenu(who), disabled: true });
    ids.forEach(id => list.push({ text: '◆ ' + getClue(id).title, fn: () => presentEvidence(who, id) }));
    list.push({ heading: '' }, { text: t('ui.actions.never_mind'), fn: () => talkMenu(who) });
    showChoices(list, t('ui.actions.present_evidence_to', { name: getChar(who).name }));
  }

  function presentEvidence(who, id) {
    const R = (RAW_CHARS[who].reactions || {})[id];
    let key = 'r-none';
    if (R) key = typeof R.key === 'function' ? R.key() : R.key;
    const reactMap = getTexts().react || {};
    const beats = reactMap[key] || (window.EXTRA_REACT && window.EXTRA_REACT[key]) || reactMap['r-none'] || [];
    const real = R && key !== 'r-none' && key !== 'ilsa-partial';
    G.broken[who + '.' + id] = true;
    if (R) applyFx(R.fx);
    if (real && G.defensive[who]) delete G.defensive[who];
    if (real) G.decisions.push('Confronted ' + getChar(who).name + ' with: ' + getClue(id).title);
    const pre = [{ n: t('ui.actions.present_evidence_narration', { title: getClue(id).title, name: getChar(who).name }) }];
    const after = R && R.choice ? () => reactionChoice(who, R) : () => talkMenu(who);
    play(pre.concat(beats), after);
  }

  function reactionChoice(who, R) {
    showChoices(R.choice.map(o => ({ text: o.text, fn: () => {
      applyFx(o.fx); if (o.decision) G.decisions.push(o.decision);
      const reactMap = getTexts().react || {};
      play(reactMap[o.key] || [], () => talkMenu(who));
    } })), t('ui.actions.handle_reaction_prompt', 'How do you handle it?'));
  }

  function earlyAccuse(who) {
    if (run) return;
    if (clueCount() >= 14) { openAccusation(who); return; }
    G.defensive[who] = true;
    G.decisions.push('Accused ' + getChar(who).name + ' too early.');
    const beats = (getStory().prematureAccuse || []).concat([{ s: who, t: t('ui.actions.early_accuse_refusal', '"I see. Then I have nothing more to say to you, Inspector. You may address yourself to my lawyer."') }]);
    if (!(has('C21') && has('C22')) && !flag('roomEmptied')) {
      G.flags.roomEmptied = true;
      beats.push({ n: t('ui.actions.grate_roars', 'Somewhere below stairs a grate roars up, as if a bundle of papers had just been thrown on it.') });
    }
    play(beats, () => talkMenu(who));
  }

  /* ============================== ACCUSATION & ENDINGS ============================== */
  function evaluateEnding(suspect, ev) {
    if (suspect !== 'Pell') return { kind: 'wrong', suspect };
    const P = getStory().proof || RAW_STORY.proof;
    const opp = ev.some(e => P.opportunity.includes(e)), means = ev.some(e => P.means.includes(e)), mot = ev.some(e => P.motive.includes(e));
    const n = [opp, means, mot].filter(Boolean).length;
    if (n === 3) return { kind: 'true', opp, means, mot };
    if (n >= 1) return { kind: 'partial', opp, means, mot };
    return { kind: 'missed', opp, means, mot };
  }

  function canExposeFire() { return (RAW_STORY.coverUp || []).every(has) && (has('C22') || has('C33')); }

  function endGame(kind, beats, opts) {
    G.ending = kind; G.mode = 'end';
    const E_ = (getStory().endings || {})[kind] || RAW_STORY.endings[kind]; setStage(E_.img, E_.title);
    const seen = JSON.parse(store.get(ENDS) || '[]'); if (seen.indexOf(kind) < 0) { seen.push(kind); store.set(ENDS, JSON.stringify(seen)); }
    play(beats, () => {
      const card = E('div', 'end-card', '<h2>' + E_.title + '</h2>'); log.appendChild(card); scrollLog();
      autosave();
      showChoices([
        { text: t('ui.endings.btn_new_investigation'), fn: startNewGame },
        { text: t('ui.endings.btn_review_case'), fn: () => openPanel('evidence') }
      ], t('ui.endings.case_closed'));
    }, opts);
  }

  function runEnding(res) {
    closePanel(); stopTyping(); run = null; clearLog();
    if (res.kind === 'wrong') {
      const nm = getChar(res.suspect).name;
      endGame('wrong', [
        { n: t('ui.endings.wrong_narr1', { name: nm }) },
        { n: t('ui.endings.wrong_narr2') },
        { n: (getStory().wrong || {})[res.suspect] || '' } ]);
    } else if (res.kind === 'missed') {
      const open = res.accident
        ? [{ n: t('ui.endings.missed_accident_narr') }]
        : [{ n: t('ui.endings.missed_narr1') },
           { n: t('ui.endings.missed_narr2') }];
      endGame('missed', open.concat((getStory().endings || {}).missed.beats || []));
    } else if (res.kind === 'partial') {
      const notes = [];
      if (!res.opp) notes.push(t('ui.endings.partial_note_opp'));
      if (!res.means) notes.push(t('ui.endings.partial_note_means'));
      if (!res.mot) notes.push(t('ui.endings.partial_note_mot'));
      const endTexts = getTexts().end || {};
      endGame('partial', (endTexts['Confront-Silver'] || []).concat(endTexts['Silver'] || []).concat(notes.map(tStr => ({ n: '<i>' + tStr + '</i>' }))));
    } else {
      const conf = (getTexts().end || {})['Confront-Gold'] || [];
      G.ending = 'confession'; G.mode = 'end'; setStage('x-gold', t('ui.endings.confession_title', 'Confession'));
      play(conf, () => {
        if (canExposeFire()) {
          showChoices([
            { text: t('ui.endings.opt_back_stair'), fn: () => endGame('true', (getStory().endings || {}).true.beats || []) },
            { text: t('ui.endings.opt_cinder_row'), fn: () => endGame('hidden', (getTexts().end || {})['Gold'] || []) }
          ], t('ui.endings.hidden_prompt'));
        } else endGame('true', (getStory().endings || {}).true.beats || []);
      }, { portrait: { Pell: 'p-pell-confession' } });
    }
  }

  function openAccusation(pre) {
    if (run) return;
    activePanelName = 'accusation';
    let chosen = pre || null; const picked = {};
    const body = E('div');
    body.appendChild(E('p', 'warn', t('ui.accusation.warn')));
    body.appendChild(E('div', 'lbl', t('ui.accusation.who')));
    const grid = E('div', 'suspect-pick');
    SUSPECTS.forEach(n => {
      const lab = E('label', chosen === n ? 'sel' : '');
      const pic = E('div', 'pic', getChar(n).name.charAt(0)); const i = new Image(); i.alt = ''; i.onerror = () => i.remove(); i.src = 'content/images/' + getChar(n).portrait + '.webp'; pic.appendChild(i);
      lab.append(pic, document.createTextNode(getChar(n).name));
      lab.addEventListener('click', () => { chosen = n; $$('label', grid).forEach(l => l.classList.remove('sel')); lab.classList.add('sel'); });
      grid.appendChild(lab);
    });
    body.appendChild(grid);
    body.appendChild(E('div', 'lbl', t('ui.accusation.evidence_lbl')));
    const ids = Object.keys(G.clues).sort((a, b) => G.clues[a] - G.clues[b]);
    const boxes = E('div');
    ids.forEach(id => {
      const row = E('label', 'chk'); const cb = E('input'); cb.type = 'checkbox'; cb.value = id;
      cb.addEventListener('change', () => {
        picked[id] = cb.checked;
        if (Object.keys(picked).filter(k => picked[k]).length > 5) { cb.checked = false; picked[id] = false; toast(t('ui.accusation.toast_five_max')); }
      });
      row.append(cb, E('span', '', '<b>' + getClue(id).title + '</b>: ' + getClue(id).summary)); boxes.appendChild(row);
    });
    if (!ids.length) boxes.appendChild(E('div', 'empty', t('ui.accusation.no_evidence')));
    body.appendChild(boxes);
    const msg = E('div', 'warn', '');
    const go = E('button', 'btn danger', t('ui.accusation.btn_submit'));
    go.addEventListener('click', () => {
      const ev = Object.keys(picked).filter(k => picked[k]);
      if (!chosen) { msg.textContent = t('ui.accusation.err_choose_suspect'); return; }
      if (!ev.length) { msg.textContent = t('ui.accusation.err_no_evidence'); return; }
      G.decisions.push('Accused ' + getChar(chosen).name + '.');
      runEnding(evaluateEnding(chosen, ev));
    });
    body.append(msg, go);
    openDrawer(t('ui.drawer.accusation_title'), body);
  }

  /* ============================== PANELS ============================== */
  function openDrawer(title, node) {
    $('#drawerTitle').textContent = title; drawerBody.innerHTML = ''; drawerBody.appendChild(node);
    drawer.hidden = false; drawerBody.scrollTop = 0;
  }
  function closePanel() { drawer.hidden = true; activePanelName = null; }
  function toast(tStr) { const el = $('#toast'); el.textContent = tStr; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2200); }

  function openPanel(name) {
    if (!G) return;
    activePanelName = name;
    const map = { map: panelMap, evidence: panelEvidence, suspects: panelSuspects, timeline: panelTimeline, deductions: panelDeductions, inventory: panelInventory, save: panelSave };
    if (map[name]) map[name]();
  }

  function panelMap() {
    activePanelName = 'map';
    const b = E('div');
    Object.keys(RAW_LOCS).filter(id => !getLoc(id).hidden).forEach(id => {
      const ok = UNLOCKS[id]();
      const L = getLoc(id);
      const btn = E('button', 'item', '<span class="t">' + (G.loc === id ? '◆ ' : '') + L.short + (G.seenLoc[id] ? ' ✓' : '') + '</span><span class="s">' + (ok ? L.name : (getLockedText()[id] || t('ui.map.not_yet', 'Not yet.'))) + '</span>');
      if (!ok) btn.disabled = true;
      btn.addEventListener('click', () => { if (run) { toast(t('ui.toasts.finish_scene_first')); return; } closePanel(); changeLocation(id); });
      b.appendChild(btn);
    });
    b.appendChild(E('p', 'warn', t('ui.map.warn_new_places', 'New places open as your investigation gives you a reason to go.')));
    openDrawer(t('ui.drawer.map_title'), b);
  }

  function clueDetail(id, back) {
    const c = getClue(id); const b = E('div');
    const bk = E('button', 'backlink', t('ui.actions.back')); bk.addEventListener('click', back); b.appendChild(bk);
    b.appendChild(E('h3', '', '<span style="color:var(--amber2);font-weight:normal">' + (c.invTitle || c.title) + '</span>'));
    if (c.img) { const i = new Image(); i.className = 'clue-img'; i.alt = ''; i.onerror = () => i.remove(); i.src = 'content/images/' + c.img + '.webp'; b.appendChild(i); }
    const wrap = E('div'); wrap.style.marginTop = '.6rem';
    const clueBeats = (getTexts().clue || {})[id] || [];
    clueBeats.forEach(bt => {
      if (bt.n != null) wrap.appendChild(E('p', 'narr', bt.n));
      else if (bt.y != null) wrap.appendChild(E('p', 'narr', '<b>' + t('ui.labels.you') + ':</b> ' + bt.y));
      else if (bt.s) wrap.appendChild(E('p', 'narr', '<b>' + (getDisplay()[bt.s] || bt.s) + ':</b> ' + bt.t));
      else if (bt.doc) { const d = E('div', 'doc'); bt.doc.forEach(l => d.appendChild(E('p', '', l))); wrap.appendChild(d); }
    });
    b.appendChild(wrap);
    return b;
  }

  function panelEvidence() {
    activePanelName = 'evidence';
    const render = () => {
      const b = E('div'); const ids = Object.keys(G.clues).sort((a, c) => G.clues[a] - G.clues[c]);
      if (!ids.length) b.appendChild(E('div', 'empty', t('ui.evidence.empty')));
      ids.forEach(id => {
        const c = getClue(id);
        const it = E('button', 'item', '<span class="t">◆ ' + c.title + '</span><span class="s">' + c.summary + '</span>');
        it.addEventListener('click', () => openDrawer(t('ui.drawer.evidence_title', { count: ids.length }), clueDetail(id, render)));
        b.appendChild(it);
      });
      openDrawer(t('ui.drawer.evidence_title', { count: ids.length }), b);
    };
    render();
  }

  function susLabel(n) {
    if (n < 20) return t('ui.suspicion.unlikely');
    if (n < 40) return t('ui.suspicion.doubtful');
    if (n < 60) return t('ui.suspicion.suspicious');
    if (n < 80) return t('ui.suspicion.likely');
    return t('ui.suspicion.prime_suspect');
  }

  function panelSuspects() {
    activePanelName = 'suspects';
    const b = E('div');
    SUSPECTS.forEach(n => {
      const C = getChar(n); const card = E('div', 'card');
      const pic = E('div', 'pic', C.name.charAt(0)); const i = new Image(); i.alt = ''; i.onerror = () => i.remove(); i.src = 'content/images/' + C.portrait + '.webp'; pic.appendChild(i);
      const info = E('div', 'info', '<div class="nm">' + C.name + (G.talked[n] ? ' ✓' : '') + '</div><div class="rl">' + C.role + '. ' + C.rel + '</div>' +
        '<div class="meter"><i style="width:' + G.sus[n] + '%"></i></div><div class="mlabel">' + t('ui.suspicion.your_suspicion', { label: susLabel(G.sus[n]) }) + '</div>');
      const ul = E('ul', 'facts');
      C.facts.filter(f => f.c && f.c()).forEach(f => ul.appendChild(E('li', '', f.t)));
      info.appendChild(ul); card.append(pic, info); b.appendChild(card);
    });
    openDrawer(t('ui.drawer.suspects_title'), b);
  }

  function panelTimeline() {
    activePanelName = 'timeline';
    const b = E('div'); const chal = (getOfficial().challengedBy || []).some(has);
    const off = getOfficial();
    b.appendChild(E('div', 'official', '<div class="lab">' + t('ui.timeline.official_account_title') + '</div><div>' + off.text + '</div>' + (chal ? '<div class="chal">' + off.challenged + '</div>' : '')));
    const ev = getTimeline().filter(tItem => G.tl[tItem.id]).sort((a, c) => a.m - c.m);
    if (!ev.length) b.appendChild(E('div', 'empty', t('ui.timeline.empty')));
    ev.forEach(tItem => b.appendChild(E('div', 'tl-row', '<div class="tm">' + tItem.t + '</div><div>' + tItem.text + '</div>')));
    openDrawer(t('ui.drawer.timeline_title'), b);
  }

  function panelInventory() {
    activePanelName = 'inventory';
    let tab = 'all';
    const render = () => {
      const b = E('div'); const tabs = E('div', 'tabs');
      [['all', t('ui.inventory_tabs.all')], ['doc', t('ui.inventory_tabs.doc')], ['obj', t('ui.inventory_tabs.obj')], ['key', t('ui.inventory_tabs.key')], ['note', t('ui.inventory_tabs.note')]].forEach(([k, l]) => {
        const tBtn = E('button', tab === k ? 'on' : '', l); tBtn.addEventListener('click', () => { tab = k; render(); }); tabs.appendChild(tBtn);
      });
      b.appendChild(tabs);
      const items = [];
      if (G.items.chain) items.push({ id: 'chain', kind: 'key', title: t('ui.inventory_tabs.chain_title'), sum: t('ui.inventory_tabs.chain_sum') });
      Object.keys(G.clues).sort((a, c) => G.clues[a] - G.clues[c]).forEach(id => { const c = getClue(id); if (c.inv) items.push({ id, kind: c.kind, title: c.invTitle || c.title, sum: c.summary }); });
      const shown = items.filter(x => tab === 'all' || x.kind === tab);
      if (!shown.length) b.appendChild(E('div', 'empty', t('ui.inventory_tabs.empty')));
      shown.forEach(x => {
        const it = E('button', 'item', '<span class="t">' + x.title + '</span><span class="s">' + x.sum + '</span>');
        it.addEventListener('click', () => {
          if (x.id === 'chain') { const d = E('div'); const bk = E('button', 'backlink', t('ui.actions.back')); bk.addEventListener('click', render); d.append(bk, E('p', 'narr', t('ui.inventory_tabs.chain_desc'))); openDrawer(t('ui.drawer.inventory_title'), d); }
          else openDrawer(t('ui.drawer.inventory_title'), clueDetail(x.id, render));
        });
        b.appendChild(it);
      });
      openDrawer(t('ui.drawer.inventory_title'), b);
    };
    render();
  }

  function panelDeductions() {
    activePanelName = 'deductions';
    const render = () => {
      const b = E('div');
      b.appendChild(E('p', 'warn', t('ui.deductions.warn_hypothesis')));
      let sSel = SUSPECTS[0], mSel = '', oSel = ''; const eSel = {};
      const sSelect = E('select'); SUSPECTS.forEach(n => sSelect.appendChild(new Option(getChar(n).name, n)));
      const mSelect = E('select'), oSelect = E('select');
      const fill = () => {
        sSel = sSelect.value; mSelect.innerHTML = ''; oSelect.innerHTML = '';
        mSelect.appendChild(new Option(t('ui.deductions.motive_placeholder'), '')); oSelect.appendChild(new Option(t('ui.deductions.opportunity_placeholder'), ''));
        (getStory().motives || []).filter(m => m.suspect === sSel && m.req.some(has)).forEach(m => mSelect.appendChild(new Option(m.text, m.id)));
        (getStory().opportunities || []).filter(o => o.suspect === sSel && o.req.some(has)).forEach(o => oSelect.appendChild(new Option(o.text, o.id)));
      };
      sSelect.addEventListener('change', fill); fill();
      b.append(E('div', 'lbl', t('ui.deductions.lbl_suspect')), sSelect, E('div', 'lbl', t('ui.deductions.lbl_motive')), mSelect, E('div', 'lbl', t('ui.deductions.lbl_opportunity')), oSelect, E('div', 'lbl', t('ui.deductions.lbl_evidence')));
      const boxes = E('div');
      Object.keys(G.clues).sort((a, c) => G.clues[a] - G.clues[c]).forEach(id => {
        const row = E('label', 'chk'); const cb = E('input'); cb.type = 'checkbox';
        cb.addEventListener('change', () => { eSel[id] = cb.checked; if (Object.keys(eSel).filter(k => eSel[k]).length > 3) { cb.checked = false; eSel[id] = false; toast(t('ui.toasts.three_ev_max')); } });
        row.append(cb, E('span', '', getClue(id).title)); boxes.appendChild(row);
      });
      if (!clueCount()) boxes.appendChild(E('div', 'empty', t('ui.evidence.empty')));
      b.appendChild(boxes);
      const rec = E('button', 'btn', t('ui.deductions.btn_record_hypothesis'));
      rec.addEventListener('click', () => {
        const ev = Object.keys(eSel).filter(k => eSel[k]);
        if (!mSel && !mSelect.value && !oSelect.value && !ev.length) { toast(t('ui.toasts.add_something')); return; }
        G.hyps.push({ s: sSelect.value, m: mSelect.value, o: oSelect.value, e: ev }); autosave(); render();
      });
      b.appendChild(rec);
      b.appendChild(E('div', 'lbl', t('ui.deductions.lbl_your_hypotheses')));
      if (!G.hyps.length) b.appendChild(E('div', 'empty', t('ui.deductions.empty_hypotheses')));
      G.hyps.forEach((h, i) => {
        const m = (getStory().motives || []).find(x => x.id === h.m), o = (getStory().opportunities || []).find(x => x.id === h.o);
        const d = E('div', 'hyp', '<b>' + getChar(h.s).name + '</b> <span class="arrow">→</span> ' + (m ? m.text : '<i>' + t('ui.deductions.no_motive') + '</i>') + ' <span class="arrow">→</span> ' + (o ? o.text : '<i>' + t('ui.deductions.no_opportunity') + '</i>') + ' <span class="arrow">→</span> ' + (h.e.length ? h.e.map(x => getClue(x).title).join('; ') : '<i>' + t('ui.deductions.no_evidence') + '</i>'));
        const rm = E('button', 'backlink', t('ui.deductions.remove')); rm.addEventListener('click', () => { G.hyps.splice(i, 1); render(); }); d.appendChild(document.createElement('br')); d.appendChild(rm); b.appendChild(d);
      });
      b.appendChild(E('div', 'lbl', t('ui.deductions.lbl_ottley')));
      const hintBox = E('div', 'warn', G.hints ? 'Ottley: ' + getStory().hints[G.hints - 1] : '');
      const hb = E('button', 'btn', t('ui.deductions.btn_ask_ottley')); hb.addEventListener('click', () => { G.hints = Math.min(G.hints + 1, 3); hintBox.textContent = 'Ottley: ' + getStory().hints[G.hints - 1]; });
      b.append(hb, hintBox);
      b.appendChild(E('div', 'lbl', t('ui.deductions.lbl_when_ready')));
      const acc = E('button', 'btn danger', t('ui.actions.make_your_accusation_btn')); acc.addEventListener('click', () => { if (run) { toast(t('ui.toasts.finish_scene_first')); return; } openAccusation(); });
      const close = E('button', 'btn', t('ui.deductions.btn_close_accident'));
      close.addEventListener('click', () => {
        if (run) { toast(t('ui.toasts.finish_scene_first')); return; }
        if (confirm(t('ui.deductions.confirm_close_accident'))) { G.decisions.push('Closed the case as an accident.'); runEnding({ kind: 'missed', accident: true }); }
      });
      b.append(acc, close);
      openDrawer(t('ui.drawer.deductions_title'), b);
    };
    render();
  }

  function panelSave() {
    activePanelName = 'save';
    const b = E('div');
    const saved = store.get(KEY); let meta = saved ? JSON.parse(saved) : null;
    b.appendChild(E('p', 'warn', meta ? t('ui.save.info_saved', { clues: Object.keys(meta.G.clues).length, date: new Date(meta.at).toLocaleString() }) : t('ui.save.info_none')));
    const sBtn = E('button', 'btn amber', t('ui.save.btn_save')); sBtn.addEventListener('click', () => { saveGame(); panelSave(); });
    const lBtn = E('button', 'btn', t('ui.save.btn_load')); lBtn.addEventListener('click', () => { if (loadGame()) closePanel(); else toast(t('ui.toasts.no_save_found')); });
    const nBtn = E('button', 'btn danger', t('ui.save.btn_new')); nBtn.addEventListener('click', () => { if (confirm(t('ui.save.confirm_new'))) { closePanel(); startNewGame(); } });
    b.append(sBtn, lBtn, nBtn);
    b.appendChild(E('div', 'lbl', t('ui.save.lbl_settings')));
    const t1 = E('label', 'chk'); const c1 = E('input'); c1.type = 'checkbox'; c1.checked = settings.type;
    c1.addEventListener('change', () => { settings.type = c1.checked; store.set(SETTINGS, JSON.stringify(settings)); });
    t1.append(c1, E('span', '', t('ui.save.typewriter_label')));
    const t2 = E('label', 'chk'); const c2 = E('input'); c2.type = 'checkbox'; c2.checked = settings.sound;
    c2.addEventListener('change', () => setSound(c2.checked));
    t2.append(c2, E('span', '', t('ui.save.sound_label')));
    b.append(t1, t2);
    if (G.decisions.length) { b.appendChild(E('div', 'lbl', t('ui.save.lbl_important_decisions'))); const ul = E('ul', 'facts'); G.decisions.forEach(d => ul.appendChild(E('li', '', d))); b.appendChild(ul); }
    openDrawer(t('ui.drawer.save_title'), b);
  }

  /* ============================== SAVE / LOAD ============================== */
  function saveGame() { if (!G) return; store.set(KEY, JSON.stringify({ G, at: Date.now() })); toast(t('ui.toasts.game_saved')); }
  function autosave() { if (G) store.set(AUTO, JSON.stringify({ G, at: Date.now() })); }
  function loadGame(fromAuto) {
    const raw = store.get(fromAuto ? AUTO : KEY); if (!raw) return false;
    try { G = JSON.parse(raw).G; } catch (e) { return false; }
    stopTyping(); run = null; $('#title').hidden = true; updateEvidence(); refreshUnlocks(true); resume(); return true;
  }
  function resume() {
    const L = getLoc(G.loc); setStage(L.img, L.short);
    if (G.mode === 'end' && G.ending) {
      const E_ = (getStory().endings || {})[G.ending] || RAW_STORY.endings.true; setStage(E_.img, E_.title); clearLog();
      log.appendChild(E('div', 'end-card', '<h2>' + E_.title + '</h2><p class="narr">' + t('ui.endings.case_closed') + '</p>'));
      showChoices([
        { text: t('ui.endings.btn_new_investigation'), fn: startNewGame },
        { text: t('ui.endings.btn_review_case'), fn: () => openPanel('evidence') }
      ], t('ui.endings.case_closed'));
    } else if (G.mode && G.mode.indexOf('talk:') === 0) { clearLog(); talkMenu(G.mode.slice(5)); }
    else showHub();
  }

  function startNewGame() {
    stopTyping(); run = null; G = newState(); closePanel(); $('#title').hidden = true;
    G.seenLoc.study = true; refreshUnlocks(true); updateEvidence(); clearLog(); currentBg = null;
    setStage('x-title', 'Marrowgate Square');
    const prologueBeats = (getStory().prologue || []).concat((getTexts().loc || {}).study || []);
    prologueBeats.splice((getStory().prologue || []).length, 0, { do: () => setStage('b-study', getLoc('study').short) });
    play(prologueBeats, showHub);
  }

  /* ============================== SOUND & RAIN ============================== */
  let actx = null, rainGain = null;
  function setSound(on) {
    settings.sound = on; store.set(SETTINGS, JSON.stringify(settings));
    $('#soundBtn').textContent = on ? t('ui.sound.sound_on') : t('ui.sound.sound_off');
    try {
      if (on) {
        if (!actx) {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          const len = actx.sampleRate * 3, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0); let last = 0;
          for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3.2; }
          const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
          const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
          rainGain = actx.createGain(); rainGain.gain.value = 0.0;
          src.connect(lp); lp.connect(rainGain); rainGain.connect(actx.destination); src.start();
        }
        actx.resume(); rainGain.gain.linearRampToValueAtTime(0.16, actx.currentTime + 1.2);
      } else if (actx) { rainGain.gain.linearRampToValueAtTime(0.0, actx.currentTime + 0.6); }
    } catch (e) { /* audio unavailable */ }
  }

  function startRain() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#rain'); let ctx; try { ctx = cv.getContext('2d'); } catch (e) { return; } if (!ctx) return;
    let w = 0, h = 0, drops = [];
    const size = () => { const r = cv.getBoundingClientRect(); w = cv.width = r.width; h = cv.height = r.height; drops = Array.from({ length: Math.round(w / 9) }, () => ({ x: Math.random() * w, y: Math.random() * h, l: 8 + Math.random() * 14, s: 9 + Math.random() * 8 })); };
    size(); window.addEventListener('resize', size);
    (function frame() {
      ctx.clearRect(0, 0, w, h); ctx.strokeStyle = 'rgba(170,200,205,.35)'; ctx.lineWidth = 1; ctx.beginPath();
      drops.forEach(d => { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + d.l); d.y += d.s; d.x -= 0.6; if (d.y > h) { d.y = -20; d.x = Math.random() * (w + 40); } });
      ctx.stroke(); requestAnimationFrame(frame);
    })();
  }

  function updateAllUI() {
    // Update topbar nav button text
    if ($('#nav-investigate')) $('#nav-investigate').textContent = t('ui.topbar.investigate');
    if ($('#nav-map')) $('#nav-map').textContent = t('ui.topbar.map');
    if ($('#nav-evidence')) {
      const badge = $('#badge-evidence');
      $('#nav-evidence').childNodes[0].nodeValue = t('ui.topbar.evidence') + ' ';
    }
    if ($('#nav-suspects')) $('#nav-suspects').textContent = t('ui.topbar.suspects');
    if ($('#nav-timeline')) $('#nav-timeline').textContent = t('ui.topbar.timeline');
    if ($('#nav-deductions')) $('#nav-deductions').textContent = t('ui.topbar.deductions');
    if ($('#nav-inventory')) $('#nav-inventory').textContent = t('ui.topbar.inventory');
    if ($('#nav-save')) $('#nav-save').textContent = t('ui.topbar.save');
    if ($('#langBtn')) $('#langBtn').textContent = t('ui.topbar.lang');
    if ($('#titleLangBtn')) $('#titleLangBtn').textContent = t('ui.topbar.lang');

    // Title screen
    if ($('#titleEyebrow')) $('#titleEyebrow').textContent = t('ui.title.eyebrow');
    if ($('#titleHeading')) $('#titleHeading').innerHTML = t('ui.title.title');
    if ($('#titleBlurb')) $('#titleBlurb').textContent = getStory().title_blurb;
    if ($('#btnNew')) $('#btnNew').textContent = t('ui.title.new_game');
    if ($('#btnContinue')) $('#btnContinue').textContent = t('ui.title.continue');
    if ($('#btnLoad')) $('#btnLoad').textContent = t('ui.title.load_saved');
    const seen = JSON.parse(store.get(ENDS) || '[]');
    if ($('#endingsFound')) $('#endingsFound').textContent = t('ui.title.endings_found', { count: seen.length });

    // Sound button
    if ($('#soundBtn')) $('#soundBtn').textContent = settings.sound ? t('ui.sound.sound_on') : t('ui.sound.sound_off');

    // Stage location name
    if (G && G.loc && $('#locname')) {
      $('#locname').textContent = getLoc(G.loc).short || '';
    }

    // Refresh active panel/drawer if open
    if (!drawer.hidden && activePanelName) {
      openPanel(activePanelName);
    }

    // Refresh active game hub/view if in game
    if (G && $('#title').hidden) {
      if (G.mode && G.mode.indexOf('talk:') === 0) {
        talkMenu(G.mode.slice(5));
      } else if (G.mode === 'hub') {
        showHub();
      }
    }
  }

  /* ============================== WIRING ============================== */
  $$('#topbar [data-panel]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.panel)));
  $('#topbar [data-act="investigate"]').addEventListener('click', () => { if (!G || run) return; closePanel(); showHub(); });
  if ($('#langBtn')) $('#langBtn').addEventListener('click', () => i18n.toggleLanguage());
  if ($('#titleLangBtn')) $('#titleLangBtn').addEventListener('click', () => i18n.toggleLanguage());
  if (typeof i18n !== 'undefined') {
    i18n.onChange(() => updateAllUI());
  }

  $('#drawerClose').addEventListener('click', closePanel);
  drawer.addEventListener('click', e => { if (e.target === drawer) closePanel(); });
  $('#soundBtn').addEventListener('click', () => setSound(!settings.sound));
  log.addEventListener('click', () => { if (typing) typing.finish(); else if (run && $('.continue', actions)) advance(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePanel(); return; }
    if ((e.key === ' ' || e.key === 'Enter') && drawer.hidden && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) {
      if (typing) { typing.finish(); e.preventDefault(); }
      else if (run && $('.continue', actions)) { e.preventDefault(); advance(); }
    }
  });

  $('#titleBlurb').textContent = getStory().title_blurb;
  setStage('x-title', '');
  $('#title').style.backgroundImage = 'url(content/images/x-title.webp)';
  $('#btnNew').addEventListener('click', startNewGame);
  if (store.get(AUTO)) { $('#btnContinue').hidden = false; $('#btnContinue').addEventListener('click', () => loadGame(true)); }
  if (store.get(KEY)) { $('#btnLoad').hidden = false; $('#btnLoad').addEventListener('click', () => loadGame(false)); }
  const seen = JSON.parse(store.get(ENDS) || '[]');
  $('#endingsFound').textContent = t('ui.title.endings_found', { count: seen.length });
  $('#soundBtn').textContent = settings.sound ? t('ui.sound.sound_on') : t('ui.sound.sound_off');
  startRain();

  updateAllUI();

  /* Public functions named in the design brief, for extension and debugging. */
  Object.assign(window, { showNarration, showDialogue, showChoices, investigateObject, discoverClue, interviewSuspect, updateTimeline,
    updateEvidence, updateGameState, saveGame, loadGame, changeLocation, evaluateEnding, startNewGame, openPanel, updateAllUI });
})();
