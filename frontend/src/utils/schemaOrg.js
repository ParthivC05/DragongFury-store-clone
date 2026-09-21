import { site } from '../config/site';
import { LANDING_FAQ, SEO_FAQ, buildPlatformFaq } from '../constants/landingFaq';
import {
  GAME_CATEGORY_ITEMLIST_SLUGS,
  getGameCategoryBySlug,
  isGameCategorySlug,
} from '../config/seoPages';

const SCRIPT_PREFIX = 'pj-schema-';

export const SITE_ORIGIN =
  (typeof window !== 'undefined' && window.location?.origin) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SITE_ORIGIN) ||
  '';

function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return SITE_ORIGIN;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_ORIGIN}${path}`;
}

function setJsonLd(id, data) {
  const scriptId = `${SCRIPT_PREFIX}${id}`;
  let el = document.getElementById(scriptId);
  if (!data) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = scriptId;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function clearJsonLd(id) {
  document.getElementById(`${SCRIPT_PREFIX}${id}`)?.remove();
}

function sameAsLinks() {
  return Object.values(site.socialLinks || {}).filter(Boolean);
}

export function buildOrganizationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.platformName,
    url: SITE_ORIGIN,
    logo: absoluteUrl('/logo.png'),
    description:
      'Dragon Fury is an online sweepstakes lobby with fish games, slots, and exclusive platforms.',
    email: site.supportEmail,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: site.supportEmail,
      url: `${SITE_ORIGIN}/contact`,
    },
  };
  const sameAs = sameAsLinks();
  if (sameAs.length) schema.sameAs = sameAs;
  return schema;
}

/** WebSite schema. SearchAction omitted — no public /search route exists. */
export function buildWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.platformName,
    url: SITE_ORIGIN,
    description: site.seoDescription,
    publisher: {
      '@type': 'Organization',
      name: site.platformName,
      logo: absoluteUrl(site.logoUrl || '/logo.png'),
    },
  };
}

export function buildFaqPageSchema(faqItems) {
  const items = Array.isArray(faqItems) ? faqItems : [];
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

export function buildSoftwareApplicationSchema(gameName, options = {}) {
  const name = String(gameName || '').trim();
  if (!name) return null;
  const url = options.url ? absoluteUrl(options.url) : undefined;
  const schema = {
    '@type': 'SoftwareApplication',
    name,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web, iOS, Android',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
  if (!options.nested) {
    schema['@context'] = 'https://schema.org';
  }
  if (url) schema.url = url;
  if (options.image) schema.image = absoluteUrl(options.image);
  return schema;
}

export function buildVideoGameSchema(page, options = {}) {
  if (!page?.name) return null;
  const schema = {
    '@type': 'VideoGame',
    name: page.name,
    url: absoluteUrl(options.url || `/games/${page.slug}`),
    genre: page.genre || 'Sweepstakes',
    publisher: { '@type': 'Organization', name: site.platformName },
  };
  if (!options.nested) schema['@context'] = 'https://schema.org';
  if (page.image) schema.image = absoluteUrl(page.image);
  if (page.description) schema.description = page.description;
  return schema;
}

export function buildGameCategoryItemListSchema() {
  const pages = GAME_CATEGORY_ITEMLIST_SLUGS.map((slug) => getGameCategoryBySlug(slug)).filter(
    Boolean
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${site.platformName} Game Categories`,
    itemListElement: pages.map((page, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: buildVideoGameSchema(page, { nested: true }),
    })),
  };
}

export function buildBreadcrumbSchema(items) {
  const list = Array.isArray(items) ? items.filter((i) => i?.name && i?.item) : [];
  if (!list.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.item),
    })),
  };
}

export function buildFeaturedGamesItemListSchema() {
  return buildGameCategoryItemListSchema();
}

/** Sitewide Organization + WebSite (always present). */
export function applySitewideSchema() {
  setJsonLd('organization', buildOrganizationSchema());
  setJsonLd('website', buildWebSiteSchema());
}

/**
 * Route-aware schema. Clears page-specific nodes when leaving those routes.
 * @param {string} pathname
 * @param {{ gameName?: string, gameId?: string, gameImage?: string }=} pageMeta
 */
export function applyRouteSchema(pathname, pageMeta = {}) {
  const path = pathname || '/';

  if (path === '/') {
    setJsonLd('faq', buildFaqPageSchema(LANDING_FAQ));
    setJsonLd(
      'webpage',
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: site.seoTitle || site.platformName,
        description: site.seoDescription,
        url: `${SITE_ORIGIN}/`,
        isPartOf: { '@type': 'WebSite', url: SITE_ORIGIN, name: site.platformName },
      }
    );
    clearJsonLd('games-list');
    clearJsonLd('game-app');
    clearJsonLd('game-faq');
    clearJsonLd('breadcrumb');
    return;
  }

  if (path === '/faq') {
    setJsonLd('faq', buildFaqPageSchema(SEO_FAQ));
    clearJsonLd('games-list');
    clearJsonLd('webpage');
    clearJsonLd('game-app');
    clearJsonLd('game-faq');
    clearJsonLd('breadcrumb');
    return;
  }

  if (path === '/games') {
    setJsonLd('games-list', buildGameCategoryItemListSchema());
    setJsonLd(
      'breadcrumb',
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Games', item: '/games' },
      ])
    );
    clearJsonLd('faq');
    clearJsonLd('webpage');
    clearJsonLd('game-app');
    clearJsonLd('game-faq');
    return;
  }

  const categorySlug = path.startsWith('/games/') ? path.slice('/games/'.length).split('/')[0] : '';
  const category = isGameCategorySlug(categorySlug) ? getGameCategoryBySlug(categorySlug) : null;
  if (category) {
    const gameUrl = `/games/${category.slug}`;
    setJsonLd('game-app', buildVideoGameSchema(category));
    setJsonLd('game-faq', buildFaqPageSchema(buildPlatformFaq(category.name)));
    setJsonLd(
      'breadcrumb',
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Games', item: '/games' },
        { name: category.name, item: gameUrl },
      ])
    );
    clearJsonLd('faq');
    clearJsonLd('games-list');
    clearJsonLd('webpage');
    return;
  }

  clearJsonLd('faq');
  clearJsonLd('games-list');
  clearJsonLd('webpage');

  if (path.startsWith('/games/') && pageMeta.gameName) {
    const gameUrl = `/games/${pageMeta.gameId || ''}`;
    setJsonLd(
      'game-app',
      buildSoftwareApplicationSchema(pageMeta.gameName, {
        url: gameUrl,
        image: pageMeta.gameImage,
      })
    );
    setJsonLd('game-faq', buildFaqPageSchema(buildPlatformFaq(pageMeta.gameName)));
    setJsonLd(
      'breadcrumb',
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Games', item: '/games' },
        { name: pageMeta.gameName, item: gameUrl },
      ])
    );
    return;
  }

  clearJsonLd('game-app');
  clearJsonLd('game-faq');
  clearJsonLd('breadcrumb');
}

/** Clear page-specific schema nodes (keeps sitewide Organization / WebSite). */
export function clearPageSchema() {
  clearJsonLd('faq');
  clearJsonLd('games-list');
  clearJsonLd('webpage');
  clearJsonLd('game-app');
  clearJsonLd('game-faq');
  clearJsonLd('breadcrumb');
}
