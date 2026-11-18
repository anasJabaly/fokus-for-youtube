/* ============================================================
   Fokus für YouTube — gemeinsame Basis
   Standard-Einstellungen, Begriffs-Abgleich und das Overlay.
   Wird von content.js, google.js und popup.js benutzt, damit es
   nur EINE Quelle für die Standardwerte gibt.
   ============================================================ */

(() => {
  'use strict';
  if (globalThis.YTFOKUS) return;

  // ---- Standard-Einstellungen ----
  // Schreibweise der Begriffe:
  //   wort   -> bis 4 Zeichen: nur am Wortanfang ("lied" trifft "Lieder", nicht "applied")
  //             ab 5 Zeichen: überall ("musik" trifft auch "Hintergrundmusik")
  //   =wort  -> nur als ganzes Wort ("=rap" trifft "Rap", nicht "Graph" oder "rapid")
  const DEFAULTS = {
    enabled: true,
    blockShorts: true,
    hideHomeFeed: false,
    strictMode: true,          // true = kein "trotzdem ansehen"
    waitSeconds: 15,           // Wartezeit im Achtsamkeits-Modus
    feedFilter: 'whitelist',   // 'off' | 'blocklist' | 'whitelist'
    blockedChannels: [],       // per ⊘-Button blockierte Kanäle
    hideYtExtras: true,        // YouTube-Music/Premium/Kids-Links ausblenden
    muteAds: true,             // Werbung stummschalten & abdunkeln
    blockYtMusic: true,        // music.youtube.com komplett sperren
    filterGoogle: true,        // blockierte Begriffe auch in der Google-Suche
    lockSettings: false,       // Einstellungen erst nach Wartezeit änderbar
    lockSeconds: 60,
    allowKeywords: [
      // Deen
      'quran', 'koran', 'surah', 'sura', 'tafsir', 'hadith', 'islam',
      '=dua', 'gebet', 'ramadan', 'seerah', 'arabisch',
      // Studium & Produktivität
      'study', 'lernen', '=uni', 'universität', 'hochschule', 'vorlesung',
      'klausur', 'prüfung', 'tutorial', 'kurs', 'erklärt', 'mathe', 'physik',
      'informatik', 'programmieren', 'coding', 'java', 'python', 'javascript',
      'linux', 'security', 'netzwerk', 'doku', 'dokumentation',
      'focus', 'produktiv', 'pomodoro'
    ],
    keywords: [
      // Deutsch
      'musik', 'lied', 'songtext', 'konzert', 'musikvideo',
      // Englisch
      'music', 'song', 'lyrics', 'lyric', 'official video',
      'official audio', 'music video', '=mv', 'album', '=single',
      'remix', '=cover', 'karaoke', 'playlist musik',
      // Genres
      '=rap', 'rapper', 'hip hop', 'hiphop', 'pop hits', '=techno', '=edm',
      'deutschrap', '=charts', 'lofi', 'lo-fi', 'beats to', 'mix -', 'mix –', 'nasheed',
      // Arabisch (Musik / Lieder)
      'اغاني', 'أغاني', 'اغنية', 'أغنية', 'موسيقى'
    ]
  };

  // ---- Begriffs-Abgleich ----
  const norm = s => (s || '').toString().toLowerCase().normalize('NFKC');
  const WORD_CHAR = /[\p{L}\p{N}]/u;
  const LATIN_ONLY = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u;

  /** Macht aus einer Begriffsliste vorbereitete Regeln. */
  function compile(list) {
    const rules = [];
    (Array.isArray(list) ? list : []).forEach(raw => {
      let k = norm(raw).trim();
      if (!k) return;
      let mode = null;
      if (k.startsWith('=')) { mode = 'word'; k = k.slice(1).trim(); }
      if (!k) return;
      // Kurze lateinische Begriffe nur am Wortanfang, sonst überall.
      // Arabisch u.ä. immer überall, weil dort Vorsilben direkt am Wort hängen.
      if (!mode) mode = (k.length <= 4 && LATIN_ONLY.test(k)) ? 'start' : 'sub';
      rules.push({ k, mode });
    });
    return rules;
  }

  function ruleHits(text, rule) {
    let i = text.indexOf(rule.k);
    if (rule.mode === 'sub') return i !== -1;
    while (i !== -1) {
      const before = i > 0 ? text[i - 1] : '';
      const after = text[i + rule.k.length] || '';
      const startOk = !before || !WORD_CHAR.test(before);
      const endOk = rule.mode === 'start' || !after || !WORD_CHAR.test(after);
      if (startOk && endOk) return true;
      i = text.indexOf(rule.k, i + 1);
    }
    return false;
  }

  /** true, wenn der Text mindestens eine Regel trifft. */
  function matches(text, rules) {
    const t = norm(text);
    if (!t) return false;
    return rules.some(r => ruleHits(t, r));
  }

  // ---- Einstellungen laden ----
  function loadConfig() {
    return new Promise(resolve => {
      chrome.storage.sync.get(DEFAULTS, items => {
        resolve({ ...DEFAULTS, ...(items || {}) });
      });
    });
  }

  // ---- Overlay: Moment der Achtsamkeit ----
  // Feste Texte stehen als HTML hier; alles Variable (Grund, Suchbegriff)
  // wird ausschließlich per textContent gesetzt.
  const CARD_HTML = `
    <div class="ytfokus-card">
      <div class="ytfokus-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <circle cx="24" cy="24" r="13"/>
          <line x1="24" y1="15" x2="24" y2="33"/>
        </svg>
      </div>
      <h1>Einen Moment.</h1>
      <p class="ytfokus-reason"></p>
      <p class="ytfokus-text">
        Du hast dir vorgenommen, deine Zeit bewusster zu nutzen.
        Dieser Inhalt gehört nicht dazu — und das hier ist deine Erinnerung daran.
      </p>
      <p class="ytfokus-quote">„Nutze fünf, bevor fünf kommen: deine Jugend vor dem Alter, deine Gesundheit vor der Krankheit, deinen Reichtum vor der Armut, deine freie Zeit vor der Beschäftigung und dein Leben vor dem Tod."</p>
      <div class="ytfokus-actions"></div>
    </div>`;

  const overlay = {
    el: null,
    tick: null,

    get shown() { return !!this.el; },

    /**
     * opts: reason, backLabel, onBack, allowWait, waitSeconds, onProceed
     */
    show(opts) {
      this.hide();
      const wrap = document.createElement('div');
      wrap.id = 'ytfokus-overlay';
      wrap.innerHTML = CARD_HTML;
      wrap.querySelector('.ytfokus-reason').textContent = opts.reason || '';

      const actions = wrap.querySelector('.ytfokus-actions');
      const back = document.createElement('button');
      back.className = 'ytfokus-btn ytfokus-primary';
      back.textContent = opts.backLabel || 'Zurück';
      back.addEventListener('click', () => opts.onBack && opts.onBack());
      actions.appendChild(back);

      if (opts.allowWait) {
        const seconds = Math.max(1, parseInt(opts.waitSeconds, 10) || 15);
        const wait = document.createElement('button');
        wait.className = 'ytfokus-btn ytfokus-ghost';
        wait.textContent = `Trotzdem ansehen (${seconds}s warten)`;
        wait.addEventListener('click', () => {
          if (this.tick) return;
          let left = seconds;
          wait.disabled = true;
          wait.textContent = `Noch ${left} Sekunden …`;
          this.tick = setInterval(() => {
            left -= 1;
            wait.textContent = `Noch ${left} Sekunden …`;
            if (left <= 0) {
              clearInterval(this.tick);
              this.tick = null;
              if (opts.onProceed) opts.onProceed();
            }
          }, 1000);
        });
        actions.appendChild(wait);
      }

      document.documentElement.appendChild(wrap);
      document.documentElement.classList.add('ytfokus-lock');
      this.el = wrap;
    },

    hide() {
      if (this.tick) { clearInterval(this.tick); this.tick = null; }
      if (this.el) { this.el.remove(); this.el = null; }
      const stale = document.getElementById('ytfokus-overlay');
      if (stale) stale.remove();
      document.documentElement.classList.remove('ytfokus-lock');
    }
  };

  globalThis.YTFOKUS = { DEFAULTS, norm, compile, matches, loadConfig, overlay };
})();
