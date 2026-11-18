/* ============================================================
   Fokus für YouTube — Brücke zur Seite (läuft in der Seiten-Welt)
   Liest Kategorie und Titel des AKTUELLEN Videos direkt aus dem
   Player. Die <meta>-Angaben im HTML stimmen nur beim ersten
   Seitenaufruf, nicht nach einem Klick von Video zu Video.
   Es werden keine Daten gesendet, nur ein Ereignis an content.js.
   ============================================================ */

(() => {
  'use strict';

  function send() {
    try {
      const player = document.getElementById('movie_player');
      if (!player || typeof player.getPlayerResponse !== 'function') return;
      const res = player.getPlayerResponse();
      const vd = res && res.videoDetails;
      if (!vd || !vd.videoId) return;
      const mf = res.microformat && res.microformat.playerMicroformatRenderer;
      document.dispatchEvent(new CustomEvent('ytfokus-info', {
        detail: JSON.stringify({
          videoId: String(vd.videoId),
          title: String(vd.title || ''),
          category: String((mf && mf.category) || '')
        })
      }));
    } catch (e) { /* Player noch nicht bereit */ }
  }

  document.addEventListener('ytfokus-ask', send);
  window.addEventListener('yt-navigate-finish', send);
})();
