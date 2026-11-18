/* ============================================================
   Fokus für YouTube — Content Script (YouTube)
   Blockiert Musik-/Unterhaltungsinhalte + Shorts
   und zeigt einen "Moment der Achtsamkeit".
   ============================================================ */

(() => {
  'use strict';

  const F = globalThis.YTFOKUS;
  if (!F) return;

  const IS_MUSIC_HOST = location.hostname === 'music.youtube.com';
  const MUSIC_GENRES = new Set(['music', 'musik', 'musique', 'música', 'musica', 'موسيقى']);
  const ROOT_CLASSES = ['ytfokus-nofeed', 'ytfokus-noshorts', 'ytfokus-hideextras', 'ytfokus-admute'];

  let cfg = { ...F.DEFAULTS };
  let rules = { block: [], allow: [] };

  function applyConfig(next) {
    cfg = next;
    rules = { block: F.compile(cfg.keywords), allow: F.compile(cfg.allowKeywords) };
  }

  chrome.storage.onChanged.addListener(() => F.loadConfig().then(c => {
    applyConfig(c);
    unblock();        // mit den neuen Einstellungen neu bewerten
    runChecks();
  }));

  // ---- Hilfsfunktionen ----
  const norm = F.norm;

  function getSearchQuery() {
    return new URLSearchParams(location.search).get('search_query') || '';
  }

  function currentVideoId() {
    return new URLSearchParams(location.search).get('v') || '';
  }

  /** Eindeutiger Schlüssel der aktuellen Seite (für Overlay und Freigabe). */
  function pageKey() {
    if (IS_MUSIC_HOST) return 'music';
    const path = location.pathname;
    if (path === '/watch') return 'watch:' + currentVideoId();
    if (path === '/results') return 'results:' + getSearchQuery();
    return path;
  }

  // ---- Video-Infos: bevorzugt aus dem Player (bridge.js), sonst aus dem HTML ----
  let bridgeInfo = null;
  document.addEventListener('ytfokus-info', e => {
    try {
      const info = JSON.parse(e.detail);
      if (info && typeof info.videoId === 'string') bridgeInfo = info;
    } catch (err) { /* ignorieren */ }
  });

  function askBridge() {
    document.dispatchEvent(new CustomEvent('ytfokus-ask'));
  }

  function metaGenre(videoId) {
    const meta = document.querySelector('meta[itemprop="genre"]');
    if (!meta) return '';
    // Nach einem Klick von Video zu Video kann die Angabe noch vom alten Video stammen.
    const scope = meta.parentElement || document;
    const idMeta = scope.querySelector('meta[itemprop="identifier"], meta[itemprop="videoId"]');
    if (idMeta && idMeta.content && idMeta.content !== videoId) return '';
    return meta.getAttribute('content') || '';
  }

  function domTitle() {
    const h1 = document.querySelector('h1.ytd-watch-metadata, ytd-watch-metadata h1, h1.title');
    if (h1 && h1.textContent.trim()) return h1.textContent;
    return document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube\s*$/, '');
  }

  // ---- Sperren / Freigeben ----
  let stopTimer = null;
  let watchTimer = null;
  let overlayKey = null;      // Seite, für die das Overlay gerade gilt
  let bypassKey = null;       // Seite, die nach der Wartezeit freigegeben wurde
  const mutedByOverlay = new Set();

  function stopPlayback() {
    document.querySelectorAll('video').forEach(v => {
      try {
        v.pause();
        if (!v.muted) { v.muted = true; mutedByOverlay.add(v); }
      } catch (e) { /* ignorieren */ }
    });
  }

  function block(reason) {
    const key = pageKey();
    if (bypassKey === key) return;
    if (F.overlay.shown && overlayKey === key) return;
    unblock();
    overlayKey = key;
    stopPlayback();
    stopTimer = setInterval(stopPlayback, 500);
    F.overlay.show({
      reason,
      backLabel: 'Zurück zur Startseite',
      onBack: () => { location.href = 'https://www.youtube.com/'; },
      allowWait: !cfg.strictMode,
      waitSeconds: cfg.waitSeconds,
      onProceed: () => {
        bypassKey = key;
        unblock();
        const v = document.querySelector('#movie_player video');
        if (v) { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignorieren */ } }
      }
    });
  }

  function unblock() {
    if (stopTimer) { clearInterval(stopTimer); stopTimer = null; }
    F.overlay.hide();
    overlayKey = null;
    // Nur den Ton zurückgeben, den wir selbst abgeschaltet haben
    mutedByOverlay.forEach(v => { try { v.muted = false; } catch (e) { /* ignorieren */ } });
    mutedByOverlay.clear();
  }

  // ---- Prüf-Logik ----
  /** Gründe, die sofort aus der Adresse erkennbar sind. */
  function urlVerdict() {
    if (IS_MUSIC_HOST) {
      return cfg.blockYtMusic ? 'YouTube Music ist blockiert.' : null;
    }
    const path = location.pathname;
    if (cfg.blockShorts && path.startsWith('/shorts')) {
      return 'Shorts sind blockiert — endloses Scrollen frisst am meisten Zeit.';
    }
    if (path === '/results') {
      const q = getSearchQuery();
      if (q && F.matches(q, rules.block)) return `Deine Suche „${q}" enthält blockierte Inhalte.`;
    }
    return null;
  }

  /** Grund für die aktuelle Watch-Seite oder null. trustDom=false: nur Player-Daten. */
  function watchVerdict(trustDom) {
    const id = currentVideoId();
    const info = bridgeInfo && bridgeInfo.videoId === id ? bridgeInfo : null;
    if (!info && !trustDom) return null;
    const genre = info ? info.category : metaGenre(id);
    const title = info ? info.title : domTitle();
    if (MUSIC_GENRES.has(norm(genre).trim())) return 'Dieses Video ist in der Kategorie Musik eingeordnet.';
    if (title && F.matches(title, rules.block)) return 'Der Titel dieses Videos enthält blockierte Begriffe.';
    return null;
  }

  let firstCheck = true;
  function checkWatch() {
    askBridge();
    // Direkt nach einem Klick von Video zu Video zeigt das HTML oft noch das alte Video.
    // Deshalb dem HTML nur beim ersten Seitenaufruf sofort trauen.
    const now = watchVerdict(firstCheck);
    if (now) { block(now); return; }
    let tries = 0;
    watchTimer = setInterval(() => {
      tries += 1;
      askBridge();
      const reason = watchVerdict(true);
      if (reason) block(reason);
      if (reason || tries >= 12) { clearInterval(watchTimer); watchTimer = null; }
    }, 500);
  }

  function runChecks() {
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
    const root = document.documentElement;

    if (!cfg.enabled) {
      unblock();
      ROOT_CLASSES.forEach(c => root.classList.remove(c));
      document.querySelectorAll('.ytfokus-hidden').forEach(el => el.classList.remove('ytfokus-hidden'));
      return;
    }

    const path = location.pathname;
    const key = pageKey();
    if (bypassKey && bypassKey !== key) bypassKey = null;

    root.classList.toggle('ytfokus-nofeed',
      !!cfg.hideHomeFeed && !IS_MUSIC_HOST && (path === '/' || path === ''));

    const reason = urlVerdict();
    if (reason) {
      block(reason);
    } else if (!IS_MUSIC_HOST && path === '/watch') {
      // Overlay einer anderen Seite entfernen, dann dieses Video prüfen
      if (F.overlay.shown && overlayKey !== key) unblock();
      checkWatch();
    } else {
      unblock();
    }
    firstCheck = false;

    if (!IS_MUSIC_HOST) {
      filterFeed();
      startFeedObserver();
    }
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

  function matchesBlockedChannel(channelName) {
    const c = norm(channelName);
    if (!c) return false;
    return (cfg.blockedChannels || []).some(b => b && c.includes(norm(b)));
  }

  function addToList(key, name) {
    if (!name) return;
    const list = Array.isArray(cfg[key]) ? cfg[key].slice() : [];
    if (list.some(b => norm(b) === norm(name))) return;
    list.push(name);
    cfg[key] = list;
    applyConfig(cfg);
    chrome.storage.sync.set({ [key]: list }, () => {
      if (chrome.runtime.lastError) console.warn('[Fokus] Speichern fehlgeschlagen:', chrome.runtime.lastError.message);
    });
    filterFeed();
  }

  function injectButtons(tile) {
    if (tile.dataset.ytfokusBtn) return;
    if (!tileChannel(tile)) return;           // Kanal noch nicht geladen: später erneut versuchen
    tile.dataset.ytfokusBtn = '1';

    // YouTube verwendet Kacheln für andere Videos wieder.
    // Deshalb den Kanal immer erst beim Klick bzw. Überfahren auslesen.
    const make = (cls, symbol, label, onClick) => {
      const btn = document.createElement('button');
      btn.className = cls;
      btn.textContent = symbol;
      btn.addEventListener('mouseenter', () => { btn.title = label(tileChannel(tile)); });
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        onClick(tileChannel(tile), btn);
      }, true);
      return btn;
    };

    tile.appendChild(make('ytfokus-block-btn', '⊘',
      ch => `Kanal „${ch}" blockieren — nie mehr vorschlagen`,
      ch => addToList('blockedChannels', ch)));

    tile.appendChild(make('ytfokus-allow-btn', '✓',
      ch => `Kanal „${ch}" erlauben — mehr davon zeigen`,
      (ch, btn) => {
        addToList('allowKeywords', ch);
        btn.classList.add('ytfokus-done');
        setTimeout(() => btn.classList.remove('ytfokus-done'), 1200);
      }));
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
    if (!cfg.enabled || IS_MUSIC_HOST) return;

    // Shorts-Regale & -Kacheln komplett entfernen
    document.documentElement.classList.toggle('ytfokus-noshorts', !!cfg.blockShorts);
    document.documentElement.classList.toggle('ytfokus-hideextras', !!cfg.hideYtExtras);

    const filtering = cfg.feedFilter !== 'off' || cfg.blockShorts || (cfg.blockedChannels || []).length > 0;

    document.querySelectorAll(TILE_SELECTOR).forEach(tile => {
      try {
        // Verschachtelte Treffer überspringen (neues Markup steckt oft in altem Container)
        if (tile.parentElement && tile.parentElement.closest(TILE_SELECTOR)) return;

        if (!filtering) { tile.classList.remove('ytfokus-hidden'); return; }

        const text = tileText(tile);
        if (!text.trim()) return; // noch nicht geladen

        let hide = false;

        // 1) Shorts-Kacheln (auch in Suchergebnissen als normale Kacheln getarnt)
        if (cfg.blockShorts && tileIsShort(tile)) hide = true;

        // 2) Blockierte Kanäle — gewinnen immer
        if (!hide && matchesBlockedChannel(tileChannel(tile))) hide = true;

        // 3) Keyword-Filter
        if (!hide && cfg.feedFilter === 'whitelist') {
          hide = !F.matches(text, rules.allow) || F.matches(text, rules.block);
        } else if (!hide && cfg.feedFilter === 'blocklist') {
          hide = F.matches(text, rules.block);
        }

        tile.classList.toggle('ytfokus-hidden', hide);
        if (!hide) injectButtons(tile);
      } catch (err) { /* einzelne Kachel ignorieren */ }
    });
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

  F.loadConfig().then(c => {
    applyConfig(c);
    runChecks();
    // Werbung braucht regelmäßiges Nachsehen; der Feed als Sicherheitsnetz,
    // falls YouTube-Events einmal nicht feuern
    setInterval(() => { if (cfg.enabled && !IS_MUSIC_HOST) adWatch(); }, 1000);
    setInterval(() => { if (cfg.enabled) filterFeed(); }, 3000);
  });
})();
