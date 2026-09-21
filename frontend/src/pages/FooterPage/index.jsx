import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getFooterPage } from '../../api/footer';
import { usePageContentReady } from '../../context/PageReadyContext';
import { site } from '../../config/site';
import { usePageSeo } from '../../utils/pageSeo';
import { FooterPageLayout, hasFooterLayout } from './FooterPageLayout';
import '../Blog/Blog.css';
import './FooterPage.css';

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

function FooterPageSkeleton() {
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

function FooterPageEmpty({ title, message }) {
  const brand = site.platformName || 'Home';
  return (
    <div className="pj-footer-empty" role="status">
      <div className="pj-footer-empty__card">
        <div className="pj-footer-empty__logo">
          <img src={site.logoUrl} alt={brand} decoding="async" />
        </div>
        <h1 className="pj-footer-empty__title">{title}</h1>
        <p className="pj-footer-empty__copy">{message}</p>
        <Link to="/" className="pj-footer-empty__cta">
          Back to home
        </Link>
      </div>
    </div>
  );
}

function friendlyFooterError(err) {
  const status = err?.status || err?.statusCode;
  if (status === 404 || /not found/i.test(String(err?.message || ''))) {
    return {
      title: 'Page not found',
      message: 'Sorry — this link doesn’t exist or was removed. You can continue from the home page.'
    };
  }
  return {
    title: 'Page unavailable',
    message: 'Something went wrong while opening this page. Please try again shortly, or go back home.'
  };
}

export function FooterPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emptyState, setEmptyState] = useState(null);

  usePageContentReady(!loading);

  const seoTitle = page?.metaTitle || page?.meta_title || (page?.title ? `${page.title} | ${site.platformName}` : '');
  const seoDescription = page?.metaDescription || page?.meta_description || '';
  const seoTags = page?.metaTags || page?.meta_tags || '';
  const noIndex = page?.allowIndex === false || page?.allow_index === false;
  usePageSeo({
    ready: Boolean(page) && !loading && !page.redirectPath,
    title: seoTitle,
    description: seoDescription,
    keywords: seoTags,
    noIndex
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEmptyState(null);
    setPage(null);
    getFooterPage(slug)
      .then((res) => {
        if (!cancelled) setPage(res?.footer_page ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setPage(null);
          setEmptyState(friendlyFooterError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!page?.content || page.redirectPath || hasFooterLayout(page.sections)) return;
    const root = document.querySelector('.pj-footer-page-content');
    wrapTablesForScroll(root);
  }, [page?.content, page?.redirectPath, page?.sections]);

  useEffect(() => {
    const dest = page?.redirectPath;
    if (!dest || !/^https?:\/\//i.test(dest)) return;
    window.location.replace(dest);
  }, [page?.redirectPath]);

  if (loading) {
    return <FooterPageSkeleton />;
  }

  if (emptyState || !page) {
    return (
      <FooterPageEmpty
        title={emptyState?.title || 'Page not found'}
        message={
          emptyState?.message
          || 'Sorry — this link doesn’t exist or was removed. You can continue from the home page.'
        }
      />
    );
  }

  if (page.redirectPath) {
    if (/^https?:\/\//i.test(page.redirectPath)) {
      return <FooterPageSkeleton />;
    }
    return <Navigate to={page.redirectPath} replace />;
  }

  const useLayout = hasFooterLayout(page.sections);

  return (
    <div className={`pj-blog-page pj-blog-detail${useLayout ? ' pj-footer-layout-page' : ''}`}>
      <article className="pj-blog-article">
        {useLayout ? (
          <FooterPageLayout sections={page.sections} fallbackTitle={page.title} />
        ) : (
          <>
            <h1 className="pj-blog-title">{page.title}</h1>
            <div
              className="pj-blog-content pj-footer-page-content"
              dangerouslySetInnerHTML={{ __html: page.content || '' }}
            />
          </>
        )}
      </article>
    </div>
  );
}
