/* ============================================================
   Fokus für YouTube — Content Script
   Blockiert Musik-/Unterhaltungsinhalte + Shorts
   und zeigt einen "Moment der Achtsamkeit".
   ============================================================ */

(() => {
  'use strict';

  // ---- Standard-Einstellungen ----
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
    allowKeywords: [
      // Deen
      'quran', 'koran', 'surah', 'sura', 'tafsir', 'hadith', 'islam',
      'dua', 'gebet', 'ramadan', 'seerah', 'arabisch',
      // Studium & Produktivität
      'study', 'lernen', 'uni', 'vorlesung', 'klausur', 'prüfung',
      'tutorial', 'kurs', 'erklärt', 'mathe', 'physik', 'informatik',
      'programmieren', 'coding', 'java', 'python', 'javascript',
      'linux', 'security', 'netzwerk', 'doku', 'dokumentation',
      'focus', 'produktiv', 'pomodoro'
    ],
    keywords: [
      // Deutsch
      'musik', 'lied', 'songtext', 'konzert', 'musikvideo',
      // Englisch
      'music', 'song', 'songs', 'lyrics', 'lyric', 'official video',
      'official audio', 'music video', 'mv', 'album', 'single',
      'remix', 'cover', 'karaoke', 'playlist musik',
      // Genres
      'rap', 'hip hop', 'hiphop', 'pop hits', 'techno', 'edm',
      'deutschrap', 'charts', 'lofi', 'lo-fi', 'beats to', 'mix -', 'mix –', 'nasheed',
      // Arabisch (Musik / Lieder)
      'اغاني', 'أغاني', 'اغنية', 'أغنية', 'موسيقى'
    ]
  };

  let cfg = { ...DEFAULTS };
  let overlayShown = false;

  // ---- Einstellungen laden (und bei Änderung aktualisieren) ----
  const storage = (typeof browser !== 'undefined' ? browser : chrome).storage;

  function loadConfig() {
    return new Promise(resolve => {
      storage.sync.get(DEFAULTS, items => {
        cfg = { ...DEFAULTS, ...items };
        resolve(cfg);
      });
    });
  }

  storage.onChanged.addListener(() => loadConfig().then(runChecks));

  // ---- Hilfsfunktionen ----
  const norm = s => (s || '').toLowerCase();

  function matchesKeywords(text) {
    const t = norm(text);
    return cfg.keywords.some(k => k && t.includes(norm(k)));
  }

  function getSearchQuery() {
    const p = new URLSearchParams(location.search);
    return p.get('search_query') || '';
  }

  function getVideoGenre() {
    // YouTube setzt <meta itemprop="genre" content="Music"> auf Watch-Seiten
    const meta = document.querySelector('meta[itemprop="genre"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function getVideoTitle() {
    const meta = document.querySelector('meta[name="title"]');
    if (meta && meta.content) return meta.content;
    const h1 = document.querySelector('h1.ytd-watch-metadata, h1.title');
    return h1 ? h1.textContent : document.title;
  }

  // ---- Overlay: Moment der Achtsamkeit ----
  function showOverlay(reason) {
    if (overlayShown) return;
    overlayShown = true;

    // Video sofort stoppen
    stopPlayback();
    const stopInterval = setInterval(stopPlayback, 500);

    const wrap = document.createElement('div');
    wrap.id = 'ytfokus-overlay';
    wrap.innerHTML = `
      <div class="ytfokus-card">
        <div class="ytfokus-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <circle cx="24" cy="24" r="13"/>
            <line x1="24" y1="15" x2="24" y2="33"/>
          </svg>
        </div>
        <h1>Einen Moment.</h1>
        <p class="ytfokus-reason">${reason}</p>
        <p class="ytfokus-text">
          Du hast dir vorgenommen, deine Zeit bewusster zu nutzen.
          Dieser Inhalt gehört nicht dazu — und das hier ist deine Erinnerung daran.
        </p>
        <p class="ytfokus-quote">„Nutze fünf, bevor fünf kommen: deine Jugend vor dem Alter, deine Gesundheit vor der Krankheit, deinen Reichtum vor der Armut, deine freie Zeit vor der Beschäftigung und dein Leben vor dem Tod."</p>
        <div class="ytfokus-actions">
          <button id="ytfokus-back" class="ytfokus-btn ytfokus-primary">Zurück zur Startseite</button>
          ${cfg.strictMode ? '' : `<button id="ytfokus-wait" class="ytfokus-btn ytfokus-ghost">Trotzdem ansehen (${cfg.waitSeconds}s warten)</button>`}
        </div>
      </div>`;

    document.documentElement.appendChild(wrap);
    document.documentElement.classList.add('ytfokus-lock');

    document.getElementById('ytfokus-back').addEventListener('click', () => {
      clearInterval(stopInterval);
      location.href = 'https://www.youtube.com/';
    });

    const waitBtn = document.getElementById('ytfokus-wait');
    if (waitBtn) {
      waitBtn.addEventListener('click', () => {
        let left = cfg.waitSeconds;
        waitBtn.disabled = true;
        const tick = setInterval(() => {
          left -= 1;
          waitBtn.textContent = `Noch ${left} Sekunden …`;
          if (left <= 0) {
            clearInterval(tick);
            clearInterval(stopInterval);
            removeOverlay();
          }
        }, 1000);
      });
    }
  }

  function removeOverlay() {
    const el = document.getElementById('ytfokus-overlay');
    if (el) el.remove();
    document.documentElement.classList.remove('ytfokus-lock');
    overlayShown = false;
  }

  function stopPlayback() {
    document.querySelectorAll('video').forEach(v => {
      try { v.pause(); v.muted = true; } catch (e) { /* ignore */ }
    });
  }

  // ---- Prüf-Logik ----
  function runChecks() {
    if (!cfg.enabled) { removeOverlay(); return; }

    const path = location.pathname;

    // 1) Shorts komplett blockieren
    if (cfg.blockShorts && path.startsWith('/shorts')) {
      showOverlay('Shorts sind blockiert — endloses Scrollen frisst am meisten Zeit.');
      return;
    }

    // 2) Suche nach blockierten Begriffen
    if (path === '/results') {
      const q = getSearchQuery();
      if (q && matchesKeywords(q)) {
        showOverlay(`Deine Suche „${q}" enthält blockierte Inhalte.`);
        return;
      }
    }

    // 3) Watch-Seiten: Genre "Music" oder Titel-Keywords
    if (path === '/watch') {
      const check = () => {
        const genre = getVideoGenre();
        const title = getVideoTitle();
        if (norm(genre) === 'music' || norm(genre) === 'musik') {
          showOverlay('Dieses Video ist in der Kategorie Musik eingeordnet.');
          return true;
        }
        if (matchesKeywords(title)) {
          showOverlay('Der Titel dieses Videos enthält blockierte Begriffe.');
          return true;
        }
        return false;
      };
      // Metadaten laden verzögert — mehrfach prüfen
      if (!check()) {
        let tries = 0;
        const iv = setInterval(() => {
          tries += 1;
          if (check() || tries > 10) clearInterval(iv);
        }, 500);
      }
      return;
    }

    // 4) Optional: Startseiten-Feed ausblenden (weniger Sog-Wirkung)
    if (cfg.hideHomeFeed && (path === '/' || path === '')) {
      document.documentElement.classList.add('ytfokus-nofeed');
    } else {
      document.documentElement.classList.remove('ytfokus-nofeed');
    }

    // Auf erlaubten Seiten: Overlay entfernen (z.B. nach Navigation)
    removeOverlay();

    // Empfehlungs-Feed filtern
    filterFeed();
    startFeedObserver();
  }

  // ============================================================
  // FEED-FILTER: Empfehlungen auf Start-/Watch-/Abo-Seiten filtern
  // 'whitelist' = nur erlaubte Themen bleiben sichtbar
  // 'blocklist' = nur blockierte Begriffe werden entfernt
  // ============================================================
  const TILE_SELECTOR = [
    'ytd-rich-item-renderer',        // Startseite
    'ytd-video-renderer',            // Suchergebnisse / Listen
    'ytd-compact-video-renderer',    // Sidebar neben Videos
    'ytd-grid-video-renderer',       // Kanalseiten / Raster
    'ytd-reel-item-renderer',        // Shorts-Kacheln im Feed
    'yt-lockup-view-model'           // NEUES YouTube-Markup (Mixe, Empfehlungen 2025+)
  ].join(',');

  function tileText(tile) {
    const title = tile.querySelector('#video-title, a#video-title-link, h3, [class*="lockup-metadata"] a, a[title]');
    const channel = tile.querySelector('ytd-channel-name, #channel-name, .ytd-channel-name, [class*="byline"]');
    let text = `${title ? (title.textContent || title.getAttribute('title') || '') : ''} ${channel ? channel.textContent : ''}`.trim();
    // Fallback für unbekannte/neue Markups: gesamten Kacheltext nehmen
    if (!text) text = (tile.textContent || '').trim().slice(0, 400);
    return text;
  }

  function tileChannel(tile) {
    // Klassisches Markup
    let el = tile.querySelector('ytd-channel-name #text, ytd-channel-name a, #channel-name #text, #channel-name');
    if (el && el.textContent.trim()) return el.textContent.trim();
    // Neues Markup: Kanal-Link beginnt mit /@handle
    el = tile.querySelector('a[href^="/@"]');
    if (el) {
      const txt = el.textContent.trim();
      if (txt) return txt;
      const m = (el.getAttribute('href') || '').match(/^\/@([^/?]+)/);
      if (m) return m[1];
    }
    // Fallback: Metadaten-Zeile des neuen Markups
    el = tile.querySelector('[class*="content-metadata"] a, [class*="byline"] a');
    return el ? el.textContent.trim() : '';
  }

  function tileIsShort(tile) {
    return !!tile.querySelector('a[href^="/shorts"], a[href*="/shorts/"]');
  }

  function matchesAllow(text) {
    const t = norm(text);
    return cfg.allowKeywords.some(k => k && t.includes(norm(k)));
  }

  function matchesBlockedChannel(channelName) {
    const c = norm(channelName);
    if (!c) return false;
    return (cfg.blockedChannels || []).some(b => b && c.includes(norm(b)));
  }

  function blockChannel(name) {
    if (!name) return;
    const list = cfg.blockedChannels || [];
    if (!list.some(b => norm(b) === norm(name))) {
      list.push(name);
      cfg.blockedChannels = list;
      storage.sync.set({ blockedChannels: list });
    }
    filterFeed();
  }

  function allowChannel(name) {
    if (!name) return;
    const list = cfg.allowKeywords || [];
    if (!list.some(b => norm(b) === norm(name))) {
      list.push(name);
      cfg.allowKeywords = list;
      storage.sync.set({ allowKeywords: list });
    }
    filterFeed();
  }

  function injectBlockButton(tile) {
    if (tile.dataset.ytfokusBtn) return;
    tile.dataset.ytfokusBtn = '1';
    const ch = tileChannel(tile);
    if (!ch) return;

    const block = document.createElement('button');
    block.className = 'ytfokus-block-btn';
    block.title = `Kanal „${ch}" blockieren — nie mehr vorschlagen`;
    block.textContent = '⊘';
    block.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      blockChannel(ch);
    }, true);

    const allow = document.createElement('button');
    allow.className = 'ytfokus-allow-btn';
    allow.title = `Kanal „${ch}" erlauben — mehr davon zeigen`;
    allow.textContent = '✓';
    allow.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      allowChannel(ch);
      allow.classList.add('ytfokus-done');
      setTimeout(() => allow.classList.remove('ytfokus-done'), 1200);
    }, true);

    tile.appendChild(block);
    tile.appendChild(allow);
  }

  // ---- Werbung stummschalten & abdunkeln (kein Ad-Blocking!) ----
  let adMutedByUs = false;
  function adWatch() {
    if (!cfg.muteAds) return;
    const player = document.querySelector('#movie_player');
    const video = player ? player.querySelector('video') : null;
    if (!player || !video) return;
    const adShowing = player.classList.contains('ad-showing');
    document.documentElement.classList.toggle('ytfokus-admute', adShowing);
    if (adShowing && !video.muted) { video.muted = true; adMutedByUs = true; }
    if (!adShowing && adMutedByUs) { video.muted = false; adMutedByUs = false; }
  }

  function filterFeed() {
    if (!cfg.enabled) return;

    // Shorts-Regale & -Kacheln komplett entfernen
    document.documentElement.classList.toggle('ytfokus-noshorts', !!cfg.blockShorts);
    document.documentElement.classList.toggle('ytfokus-hideextras', !!cfg.hideYtExtras);

    if (cfg.feedFilter === 'off' && !cfg.blockShorts && !(cfg.blockedChannels || []).length) return;

    let hidden = 0, seen = 0;
    document.querySelectorAll(TILE_SELECTOR).forEach(tile => {
      try {
      // Verschachtelte Treffer überspringen (neues Markup steckt oft in altem Container)
      if (tile.parentElement && tile.parentElement.closest(TILE_SELECTOR)) return;

      const text = tileText(tile);
      if (!text.trim()) return; // noch nicht geladen
      seen++;

      let hide = false;

      // 1) Shorts-Kacheln (auch in Suchergebnissen als normale Kacheln getarnt)
      if (cfg.blockShorts && tileIsShort(tile)) hide = true;

      // 2) Blockierte Kanäle — gewinnen immer
      if (!hide && matchesBlockedChannel(tileChannel(tile))) hide = true;

      // 3) Keyword-Filter
      if (!hide && cfg.feedFilter === 'whitelist') {
        hide = !matchesAllow(text) || matchesKeywords(text);
      } else if (!hide && cfg.feedFilter === 'blocklist') {
        hide = matchesKeywords(text);
      }

      tile.classList.toggle('ytfokus-hidden', hide);
      if (hide) hidden++;
      if (!hide) injectBlockButton(tile);
      } catch (err) { /* einzelne Kachel ignorieren */ }
    });
    if (seen > 0) console.log(`[Fokus] ${seen} Kacheln geprüft, ${hidden} ausgeblendet (Modus: ${cfg.feedFilter})`);
  }

  // Beobachtet nachgeladene Inhalte (YouTube lädt beim Scrollen nach)
  let feedObserver = null;
  let filterTimer = null;
  function startFeedObserver() {
    if (feedObserver) return;
    feedObserver = new MutationObserver(() => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(filterFeed, 250); // debounce
    });
    feedObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---- YouTube ist eine SPA: auf Navigation reagieren ----
  window.addEventListener('yt-navigate-finish', runChecks);
  window.addEventListener('popstate', runChecks);
  document.addEventListener('DOMContentLoaded', runChecks);

  loadConfig().then(() => {
    console.log('[Fokus] Version 1.7 gestartet · aktiviert:', cfg.enabled, '· Feed-Filter:', cfg.feedFilter);
    runChecks();
    // Fallback: regelmäßig filtern, falls YouTube-Events nicht feuern
    setInterval(() => { if (cfg.enabled) { filterFeed(); adWatch(); } }, 1500);
  });
})();
