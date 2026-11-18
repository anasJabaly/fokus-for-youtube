/* ============================================================
   Fokus für YouTube — Content Script (Google-Suche)
   Zeigt denselben "Moment der Achtsamkeit", wenn eine Google-Suche
   blockierte Begriffe enthält. Liest nur den Suchbegriff aus der
   Adresse, sonst nichts von der Seite.
   ============================================================ */

(() => {
  'use strict';

  const F = globalThis.YTFOKUS;
  if (!F) return;

  let cfg = { ...F.DEFAULTS };
  let blockRules = [];
  let shownFor = null;     // Suchbegriff, für den das Overlay gerade steht
  let bypassFor = null;    // Suchbegriff, der nach der Wartezeit freigegeben wurde

  const query = () => new URLSearchParams(location.search).get('q') || '';

  function check() {
    const q = query();
    if (bypassFor !== null && bypassFor !== q) bypassFor = null;

    const blocked = cfg.enabled && cfg.filterGoogle && q && bypassFor !== q && F.matches(q, blockRules);
    if (!blocked) {
      if (F.overlay.shown) { F.overlay.hide(); shownFor = null; }
      return;
    }
    if (F.overlay.shown && shownFor === q) return;

    shownFor = q;
    F.overlay.show({
      reason: `Deine Suche „${q}" enthält blockierte Begriffe.`,
      backLabel: 'Zurück zu Google',
      onBack: () => { location.href = location.origin + '/'; },
      allowWait: !cfg.strictMode,
      waitSeconds: cfg.waitSeconds,
      onProceed: () => { bypassFor = q; shownFor = null; F.overlay.hide(); }
    });
  }

  function reload() {
    return F.loadConfig().then(c => {
      cfg = c;
      blockRules = F.compile(cfg.keywords);
      check();
    });
  }

  chrome.storage.onChanged.addListener(reload);
  window.addEventListener('popstate', check);

  reload().then(() => {
    // Google wechselt die Suche teils ohne Neuladen: Adresse im Blick behalten
    let last = location.href;
    setInterval(() => {
      if (location.href !== last) { last = location.href; check(); }
    }, 1000);
  });
})();
