import { useEffect } from 'react';
import { site } from '../config/site';

function upsertMeta(attr, key, content) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.querySelector(selector);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Apply document title + description/keywords/og tags for a CMS page.
 * Empty fields fall back to the site-wide SEO defaults.
 */
export function applyPageSeo({ title, description, keywords } = {}) {
  const nextTitle = String(title || '').trim() || site.seoTitle || site.platformName;
  const nextDescription = String(description || '').trim() || site.seoDescription || '';
  const nextKeywords = String(keywords || '').trim();

  if (nextTitle) document.title = nextTitle;

  upsertMeta('name', 'description', nextDescription);
  upsertMeta('property', 'og:title', nextTitle);
  upsertMeta('property', 'og:description', nextDescription);
  upsertMeta('name', 'twitter:title', nextTitle);
  upsertMeta('name', 'twitter:description', nextDescription);
  upsertMeta('name', 'keywords', nextKeywords);
}

/** Set or clear robots tags. Pass null/empty to remove. */
export function applyRobotsMeta(content) {
  upsertMeta('name', 'robots', content);
  upsertMeta('name', 'googlebot', content);
}

export function applyDefaultPageSeo({ title, description } = {}) {
  applyPageSeo({
    title: title || site.seoTitle || site.platformName,
    description: description || site.seoDescription,
    keywords: ''
  });
}

function bindCustomCanonical(href) {
  const next = String(href || '').trim();
  if (!next || typeof document === 'undefined') return () => {};
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  const prevHref = el.getAttribute('href');
  el.dataset.custom = '1';
  el.setAttribute('href', next);
  upsertMeta('property', 'og:url', next);
  return () => {
    if (!el.isConnected) return;
    delete el.dataset.custom;
    if (prevHref) el.setAttribute('href', prevHref);
    else el.remove();
  };
}

/** Apply CMS SEO after a footer page or blog post loads. Restores site defaults on leave. */
export function usePageSeo({ ready, title, description, keywords, noIndex, canonical } = {}) {
  useEffect(() => {
    if (!ready) return undefined;
    applyPageSeo({ title, description, keywords });
    const releaseCanonical = canonical ? bindCustomCanonical(canonical) : null;
    if (noIndex === true) {
      applyRobotsMeta('noindex, nofollow');
    } else if (noIndex === false) {
      applyRobotsMeta('index, follow');
    }
    return () => {
      releaseCanonical?.();
      applyDefaultPageSeo();
    };
  }, [ready, title, description, keywords, noIndex, canonical]);
}
