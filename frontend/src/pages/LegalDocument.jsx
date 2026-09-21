import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLegalPage } from '../api/legal';
import { site } from '../config/site';
import { usePageContentReady } from '../context/PageReadyContext';
import { usePageSeo } from '../utils/pageSeo';
import './Blog/Blog.css';
import './FooterPage/FooterPage.css';

function siteOrigin() {
  const fromSite = String(site.canonicalUrl || '').trim().replace(/\/+$/, '');
  if (fromSite) return fromSite;
  const fromEnv = typeof import.meta !== 'undefined'
    ? String(import.meta.env?.VITE_SITE_ORIGIN || import.meta.env?.VITE_SITE_URL || '').trim().replace(/\/+$/, '')
    : '';
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

const LEGAL_PAGE_META = {
  privacy: {
    pageKey: 'privacy',
    path: '/privacy',
    title: 'Privacy Policy',
    backTo: '/register',
    backLabel: 'Back to Sign Up'
  },
  terms: {
    pageKey: 'terms',
    path: '/terms',
    title: 'Terms and Conditions',
    backTo: '/register',
    backLabel: 'Back to Sign Up'
  },
  'responsible-gaming': {
    pageKey: 'responsible-gaming',
    path: '/responsible-gaming',
    title: 'Responsible Gaming',
    backTo: '/',
    backLabel: 'Back to Home'
  }
};

function wrapTablesForScroll(root) {
  if (!root) return;
  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList?.contains('pj-blog-table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'pj-blog-table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
}

function LegalPageSkeleton() {
  return (
    <div className="pj-blog-page pj-blog-detail pj-footer-page-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <div className="pj-footer-skel-title" />
      <div className="pj-footer-skel-line pj-footer-skel-line--lg" />
      <div className="pj-footer-skel-line pj-footer-skel-line--lg" />
      <div className="pj-footer-skel-line pj-footer-skel-line--md" />
      <div className="pj-footer-skel-gap" />
      <div className="pj-footer-skel-line pj-footer-skel-line--lg" />
      <div className="pj-footer-skel-line pj-footer-skel-line--md" />
      <div className="pj-footer-skel-line pj-footer-skel-line--sm" />
    </div>
  );
}

function fallbackCopy(pageKey) {
  const support = site.supportEmail;
  if (pageKey === 'privacy') {
    return `Privacy policy content will be added here. For support, contact ${support}.`;
  }
  if (pageKey === 'terms') {
    return `Terms and conditions content will be added here. For support, contact ${support}.`;
  }
  return `${site.platformName} is committed to responsible play. You must be 18+ to participate. Set personal limits, take breaks, and never play with money you cannot afford to lose. If you need help, contact support at ${support} or visit ncpgambling.org.`;
}

function htmlHasContent(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Boolean(text);
}

export function LegalDocument({ pageKey }) {
  const meta = LEGAL_PAGE_META[pageKey] || LEGAL_PAGE_META.privacy;
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);

  usePageContentReady(!loading);

  const html = htmlHasContent(page?.content) ? String(page.content) : '';
  const title = page?.title || meta.title;
  const seoTitle = page?.metaTitle || page?.meta_title || (title ? `${title} | ${site.platformName}` : '');
  const seoDescription = page?.metaDescription || page?.meta_description || '';
  const seoTags = page?.metaTags || page?.meta_tags || '';
  const noIndex = page?.allowIndex === false || page?.allow_index === false;
  const origin = siteOrigin();
  const pageUrl = origin ? `${origin}${meta.path}` : meta.path;

  usePageSeo({
    ready: !loading,
    title: seoTitle,
    description: seoDescription,
    keywords: seoTags,
    noIndex,
    url: pageUrl
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLegalPage(pageKey)
      .then((res) => {
        if (!cancelled) setPage(res?.legal_page ?? null);
      })
      .catch(() => {
        if (!cancelled) setPage(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageKey]);

  useEffect(() => {
    if (!html) return;
    wrapTablesForScroll(document.querySelector('.pj-legal-page-content'));
  }, [html]);

  if (loading) {
    return <LegalPageSkeleton />;
  }

  return (
    <div className="pj-blog-page pj-blog-detail">
      <article className="pj-blog-article">
        <h1 className="pj-blog-title">{title}</h1>
        {html ? (
          <div
            className="pj-blog-content pj-footer-page-content pj-legal-page-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="pj-blog-content">{fallbackCopy(pageKey)}</p>
        )}
        <p className="mt-6 text-gray-400 text-sm">{site.copyright}</p>
        <p className="mt-4">
          <Link to={meta.backTo}>{meta.backLabel}</Link>
        </p>
      </article>
    </div>
  );
}

export function Privacy() {
  return <LegalDocument pageKey="privacy" />;
}

export function Terms() {
  return <LegalDocument pageKey="terms" />;
}

export function ResponsibleGaming() {
  return <LegalDocument pageKey="responsible-gaming" />;
}
