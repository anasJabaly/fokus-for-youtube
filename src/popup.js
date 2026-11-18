/* Fokus für YouTube — Einstellungen */
(() => {
  'use strict';

  const DEFAULTS = globalThis.YTFOKUS.DEFAULTS;   // dieselben Standardwerte wie im Content Script
  const $ = id => document.getElementById(id);

  const CHECKBOXES = ['enabled', 'blockShorts', 'hideHomeFeed', 'strictMode', 'hideYtExtras',
    'muteAds', 'blockYtMusic', 'filterGoogle', 'lockSettings'];
  const LISTS = ['keywords', 'allowKeywords', 'blockedChannels'];

  const toLines = list => (Array.isArray(list) ? list : []).join('\n');
  const fromLines = text => {
    const seen = new Set();
    return text.split('\n').map(s => s.trim()).filter(s => {
      const key = s.toLowerCase();
      if (!s || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  function fill(cfg) {
    CHECKBOXES.forEach(id => { $(id).checked = !!cfg[id]; });
    LISTS.forEach(id => { $(id).value = toLines(cfg[id]); });
    $('feedFilter').value = cfg.feedFilter;
    $('waitSeconds').value = cfg.waitSeconds;
    $('lockSeconds').value = String(cfg.lockSeconds);
    if (!$('lockSeconds').value) $('lockSeconds').value = String(DEFAULTS.lockSeconds);
  }

  function status(text, isError) {
    const el = $('saved');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
    if (!isError) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 1800);
  }

  // ---- Sperre: Einstellungen erst nach Wartezeit änderbar ----
  const controls = () => document.querySelectorAll('.section input, .section textarea, .section select, .section button');

  function setLocked(locked) {
    controls().forEach(el => { el.disabled = locked; });
    $('lockbar').hidden = !locked;
  }

  function armLock(seconds) {
    const btn = $('unlock');
    btn.disabled = false;
    btn.textContent = `Entsperren (${seconds} s warten)`;
    btn.onclick = () => {
      let left = seconds;
      btn.disabled = true;
      btn.textContent = `Noch ${left} Sekunden …`;
      const tick = setInterval(() => {
        left -= 1;
        btn.textContent = `Noch ${left} Sekunden …`;
        if (left <= 0) {
          clearInterval(tick);
          setLocked(false);
        }
      }, 1000);
    };
    setLocked(true);
  }

  // ---- Laden ----
  chrome.storage.sync.get(DEFAULTS, items => {
    const cfg = { ...DEFAULTS, ...(items || {}) };
    fill(cfg);
    if (cfg.lockSettings) armLock(Math.max(5, parseInt(cfg.lockSeconds, 10) || DEFAULTS.lockSeconds));
  });

  // ---- Speichern ----
  $('save').addEventListener('click', () => {
    const data = {};
    CHECKBOXES.forEach(id => { data[id] = $(id).checked; });
    LISTS.forEach(id => { data[id] = fromLines($(id).value); });
    data.feedFilter = $('feedFilter').value;
    data.waitSeconds = Math.min(600, Math.max(5, parseInt($('waitSeconds').value, 10) || DEFAULTS.waitSeconds));
    data.lockSeconds = parseInt($('lockSeconds').value, 10) || DEFAULTS.lockSeconds;

    chrome.storage.sync.set(data, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        const tooBig = /QUOTA|quota/.test(err.message || '');
        status(tooBig
          ? 'Nicht gespeichert: Eine Liste ist zu lang (max. ca. 8 KB pro Liste).'
          : 'Nicht gespeichert: ' + (err.message || 'unbekannter Fehler'), true);
        return;
      }
      $('waitSeconds').value = data.waitSeconds;
      status('✓ Gespeichert');
    });
  });

  // ---- Standardlisten zurückholen (füllt nur die Felder, gespeichert wird erst mit „Speichern") ----
  $('reset').addEventListener('click', () => {
    $('keywords').value = toLines(DEFAULTS.keywords);
    $('allowKeywords').value = toLines(DEFAULTS.allowKeywords);
    status('Standardlisten eingesetzt. Jetzt „Speichern" drücken.');
  });
})();
