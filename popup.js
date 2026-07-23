/* Fokus für YouTube — Einstellungen */
const DEFAULTS = {
  enabled: true,
  blockShorts: true,
  hideHomeFeed: false,
  strictMode: true,
  waitSeconds: 15,
  feedFilter: 'whitelist',
  blockedChannels: [],
  hideYtExtras: true,
  muteAds: true,
  allowKeywords: [],
  keywords: []
};

const $ = id => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, cfg => {
  $('enabled').checked = cfg.enabled;
  $('blockShorts').checked = cfg.blockShorts;
  $('hideHomeFeed').checked = cfg.hideHomeFeed;
  $('strictMode').checked = cfg.strictMode;
  $('hideYtExtras').checked = cfg.hideYtExtras;
  $('muteAds').checked = cfg.muteAds;
  $('keywords').value = (cfg.keywords || []).join('\n');
  $('feedFilter').value = cfg.feedFilter;
  $('allowKeywords').value = (cfg.allowKeywords || []).join('\n');
  $('blockedChannels').value = (cfg.blockedChannels || []).join('\n');
});

$('save').addEventListener('click', () => {
  const keywords = $('keywords').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  chrome.storage.sync.set({
    enabled: $('enabled').checked,
    blockShorts: $('blockShorts').checked,
    hideHomeFeed: $('hideHomeFeed').checked,
    strictMode: $('strictMode').checked,
    hideYtExtras: $('hideYtExtras').checked,
    muteAds: $('muteAds').checked,
    feedFilter: $('feedFilter').value,
    allowKeywords: $('allowKeywords').value.split('\n').map(s => s.trim()).filter(Boolean),
    blockedChannels: $('blockedChannels').value.split('\n').map(s => s.trim()).filter(Boolean),
    keywords
  }, () => {
    $('saved').textContent = '✓ Gespeichert';
    setTimeout(() => $('saved').textContent = '', 1800);
  });
});
