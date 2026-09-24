/* Generic story/content loader.
 * Writers edit JSON under content/; the game engine consumes the loaded data.
 */
(function () {
  'use strict';

  const ROOT = 'content';
  const MANIFEST = ROOT + '/stories/index.json';
  const requested = new URLSearchParams(location.search).get('story');
  const saved = (() => { try { return localStorage.getItem('lastlamp.story'); } catch (_) { return null; } })();

  function hydrate(value) {
    if (Array.isArray(value)) return value.map(hydrate);
    if (value && typeof value === 'object') {
      if (Object.keys(value).length === 1 && typeof value.$fn === 'string') {
        try { return Function('return (' + value.$fn + ')')(); }
        catch (e) { console.error('Invalid story rule:', value.$fn, e); return () => false; }
      }
      const out = {};
      Object.keys(value).forEach(k => out[k] = hydrate(value[k]));
      return out;
    }
    return value;
  }

  async function getJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load ' + url + ' (' + res.status + ')');
    return res.json();
  }

  function exposeHelpers() {
    // JSON rules are intentionally simple: has("C01"), flag("foo"), asked("Pell", "topic").
    window.has = id => !!(window.G && window.G.clues && window.G.clues[id]);
    window.flag = key => !!(window.G && window.G.flags && window.G.flags[key]);
    window.asked = (who, id) => !!(window.G && window.G.asked && window.G.asked[who + '.' + id]);
    window.groundsCount = () => ['C16', 'C24', 'C25', 'C33', 'C36', 'C37'].filter(window.has).length;
  }

  function installStory(data) {
    const story = hydrate(data.story);
    story.endings = hydrate(data.endings);
    window.STORY = story;
    window.CHARS = hydrate(data.characters.characters || {});
    window.DISPLAY = hydrate(data.characters.display || {});
    window.PORTRAITS = hydrate(data.characters.portraits || {});
    window.EXTRA_REACT = hydrate(data.characters.extraReact || {});
    window.LOCS = hydrate(data.locations.locations || {});
    window.UNLOCKS = hydrate(data.locations.unlocks || {});
    window.LOCKED_TEXT = hydrate(data.locations.lockedText || {});
    window.CLUES = hydrate(data.clues.clues || {});
    window.TIMELINE = hydrate(data.clues.timeline || []);
    window.OFFICIAL = hydrate(data.clues.official || {});
    window.TEXTS = {};
  }

  function installLocale(lang, data) {
    if (window.i18n) window.i18n.registerTranslations(lang, data);
  }

  function makeStoryPicker(stories, active) {
    if (stories.length < 2) return;
    const titleInner = document.querySelector('.title-inner');
    if (!titleInner || document.querySelector('#storyPicker')) return;
    const wrap = document.createElement('label');
    wrap.id = 'storyPickerWrap';
    wrap.className = 'story-picker';
    wrap.innerHTML = '<span>' + (window.i18n ? window.i18n.t('ui.title.story_selector') : 'Story') + '</span>';
    const select = document.createElement('select');
    select.id = 'storyPicker';
    stories.forEach(s => {
      const option = document.createElement('option'); option.value = s.id; option.textContent = s.title;
      option.selected = s.id === active; select.appendChild(option);
    });
    select.addEventListener('change', () => {
      try { localStorage.setItem('lastlamp.story', select.value); } catch (_) {}
      const url = new URL(location.href); url.searchParams.set('story', select.value); location.href = url.toString();
    });
    wrap.appendChild(select); titleInner.insertBefore(wrap, titleInner.querySelector('.title-buttons'));
  }

  async function boot() {
    exposeHelpers();
    const manifest = await getJSON(MANIFEST);
    const stories = manifest.stories || [];
    if (!stories.length) throw new Error('No stories are registered in content/stories/index.json.');
    const active = (requested && stories.find(s => s.id === requested) ? requested :
      (saved && stories.find(s => s.id === saved) ? saved :
      (stories.find(s => s.default) || stories[0]).id));
    const base = ROOT + '/stories/' + encodeURIComponent(active);
    const [story, characters, locations, clues, endings, enCommon, viCommon, enStory, viStory] = await Promise.all([
      getJSON(base + '/story.json'), getJSON(base + '/characters.json'), getJSON(base + '/locations.json'),
      getJSON(base + '/clues.json'), getJSON(base + '/endings.json'),
      getJSON(ROOT + '/locales/en/common.json'), getJSON(ROOT + '/locales/vi/common.json'),
      getJSON(ROOT + '/locales/en/' + encodeURIComponent(active) + '.json'),
      getJSON(ROOT + '/locales/vi/' + encodeURIComponent(active) + '.json')
    ]);
    window.ACTIVE_STORY_ID = active;
    installStory({story, characters, locations, clues, endings});
    installLocale('en', enCommon, enStory); installLocale('vi', viCommon, viStory);
    makeStoryPicker(stories, active);
    const script = document.createElement('script');
    script.src = 'game.js';
    script.onerror = () => { document.body.innerHTML = '<pre style="padding:2rem">Could not load game.js</pre>'; };
    document.body.appendChild(script);
  }

  boot().catch(err => {
    console.error(err);
    document.body.innerHTML = '<main style="padding:2rem;font-family:system-ui"><h1>Story could not be loaded</h1><p>' + err.message + '</p><p>Run the game through a web server (for example GitHub Pages or a local static server); browsers may block JSON loading from file://.</p></main>';
  });
})();
