'use strict';

const COMMUNITY_URLS = new Set(['https://t.me/coolcoffeeai', 'https://t.me/chachachalkf']);

function allowedExternalUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (['https://github.com', 'https://coldcoffeeai.com', 'https://www.coldcoffeeai.com'].includes(url.origin)) return true;
    return !url.search && !url.hash && COMMUNITY_URLS.has(url.href.replace(/\/$/, ''));
  } catch { return false; }
}

module.exports = { allowedExternalUrl };
