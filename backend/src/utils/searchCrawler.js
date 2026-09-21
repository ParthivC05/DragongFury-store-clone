'use strict';

/** User-agents that must receive real HTML (SPA shells look like Soft 404s to Google). */
const SEARCH_CRAWLER_UA =
  /googlebot|google-inspectiontool|google-inspection-tool|storebot-google|adsbot-google|bingbot|bingpreview|slurp|duckduckbot|baiduspider|yandex(bot|images)|facebookexternalhit|twitterbot|linkedinbot|applebot|semrushbot|ahrefsbot/i;

function isSearchCrawler(userAgent) {
  return SEARCH_CRAWLER_UA.test(String(userAgent || ''));
}

module.exports = {
  SEARCH_CRAWLER_UA,
  isSearchCrawler
};
