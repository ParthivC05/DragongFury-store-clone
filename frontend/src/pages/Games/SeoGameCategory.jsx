import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { usePageContentReady } from '../../context/PageReadyContext';
import { useAuth } from '../../context/AuthContext';
import { getGameCategoryBySlug, getGameCategoryRedirect } from '../../config/seoPages';
import { STORE_CODE } from '../../config/site';
import { getGamePage } from '../../api/gamePages';
import { buildPlatformFaq } from '../../constants/landingFaq';
import { GameImage } from '../../components/Games/GameImage';
import { FooterPageLayout } from '../FooterPage/FooterPageLayout';
import { applyManagedSchema } from '../../utils/managedSchema';
import { applySitewideSchema } from '../../utils/schemaOrg';
import { usePageSeo } from '../../utils/pageSeo';
import '../FooterPage/FooterPage.css';
import './SeoGames.css';

const IS_DRAGONFURY = String(STORE_CODE || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '') === 'dragonfury';

function ButtonLink({ href, className, children, isAuthenticated }) {
  const next = href === '/register' && isAuthenticated ? '/#games' : href;
  if (/^https?:\/\//i.test(next)) {
    return (
      <a href={next} className={className} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <Link to={next || '/games'} className={className}>{children}</Link>;
}

function GamePageSections({ sections }) {
  const blocks = Array.isArray(sections?.blocks) ? sections.blocks : [];
  const nodes = [];
  let content = [];
  let key = 0;
  const flush = () => {
    if (!content.length) return;
    const chunk = content;
    content = [];
    nodes.push(
      <FooterPageLayout
        key={`sections-${key}`}
        sections={{ blocks: chunk }}
        showIndex={false}
      />
    );
    key += 1;
  };
  blocks.forEach((block) => {
    if (block?.type === 'faq') {
      flush();
      const items = Array.isArray(block.items) ? block.items.filter((item) => item?.question) : [];
      if (!items.length) return;
      nodes.push(
        <section key={block.id || `faq-${key}`} className="pj-seo-faq" aria-label={block.title || 'FAQ'}>
          {block.title ? <h2>{block.title}</h2> : null}
          {items.map((item) => (
            <details key={item.question} className="pj-seo-faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>
      );
      key += 1;
      return;
    }
    content.push(block);
  });
  flush();
  if (!nodes.length) return null;
  return <div className="pj-footer-layout-page pj-seo-layout">{nodes}</div>;
}

export function SeoGameCategory() {
  const { gameId } = useParams();
  const { isAuthenticated } = useAuth();
  const redirectTo = getGameCategoryRedirect(gameId);
  const staticPage = getGameCategoryBySlug(gameId);
  const [remote, setRemote] = useState(null);
  const [checked, setChecked] = useState(!IS_DRAGONFURY);

  useEffect(() => {
    if (!IS_DRAGONFURY || redirectTo) {
      setChecked(true);
      return undefined;
    }
    let cancelled = false;
    setChecked(false);
    setRemote(null);
    getGamePage(gameId)
      .then((res) => {
        if (cancelled) return;
        if (res?.hidden) setRemote({ hidden: true });
        else setRemote(res?.game_page || null);
      })
      .catch(() => {
        if (!cancelled) setRemote(null);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, redirectTo]);

  const saved = remote && !remote.hidden ? remote : null;

  useEffect(() => {
    if (!saved || saved.schema === undefined) return undefined;
    applyManagedSchema(saved.schema);
    return () => {
      applyManagedSchema(null);
      applySitewideSchema();
    };
  }, [saved]);
  const page = saved
    ? {
        name: saved.name,
        genre: saved.genre,
        description: saved.heroLead,
        blurb: saved.heroBlurb,
        image: saved.image || saved.defaultImage,
        catalogName: saved.catalogName || saved.name,
        buttons: saved.buttons,
        sections: saved.sections
      }
    : staticPage;

  usePageContentReady(Boolean(redirectTo) || (checked && Boolean(page)) || (checked && remote?.hidden));

  const blocks = Array.isArray(saved?.sections?.blocks) ? saved.sections.blocks : [];
  const hasFaqBlock = blocks.some((block) => block.type === 'faq' && Array.isArray(block.items) && block.items.length);
  const canonical = String(saved?.canonicalUrl || '').trim();
  usePageSeo({
    ready: checked && Boolean(page) && !remote?.hidden,
    title: saved?.metaTitle || staticPage?.title || (page?.name ? `${page.name} Online | Dragon Fury` : ''),
    description: saved?.metaDescription || staticPage?.description || page?.description || '',
    keywords: saved?.metaTags || '',
    noIndex: saved ? saved.allowIndex === false : false,
    canonical
  });

  if (redirectTo) return <Navigate to={redirectTo} replace />;
  if (!checked) {
    return (
      <div className="pj-seo-games">
        <p className="pj-seo-lead">Loading…</p>
      </div>
    );
  }
  if (remote?.hidden || !page) return <Navigate to="/games" replace />;

  const buttons = Array.isArray(page.buttons) && page.buttons.length
    ? page.buttons
    : [
        { label: `Play ${page.name}`, href: '/register' },
        { label: 'All games', href: '/games' }
      ];
  const faqs = hasFaqBlock ? [] : buildPlatformFaq(page.name);

  return (
    <div className="pj-seo-games">
      <nav className="pj-seo-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link to="/games">Games</Link>
        <span aria-hidden="true">/</span>
        <span>{page.name}</span>
      </nav>
      <article className="pj-seo-category">
        <div className="pj-seo-category-hero">
          <div className="pj-seo-hero-frame">
            <GameImage
              game={{ name: page.catalogName, image_url: page.image }}
              className="pj-seo-hero-img"
              width={480}
              height={480}
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <header className="pj-seo-head">
            {page.genre ? <p className="pj-seo-label">{page.genre}</p> : null}
            <h1 className="pj-seo-title">{page.name}</h1>
            {page.description ? <p className="pj-seo-lead">{page.description}</p> : null}
            {page.blurb ? <p className="pj-seo-blurb">{page.blurb}</p> : null}
            <div className="pj-seo-actions">
              {buttons.map((button) => (
                <ButtonLink
                  key={`${button.label}-${button.href}`}
                  href={button.href}
                  className={`pj-seo-btn${button === buttons[0] ? ' pj-seo-btn-primary' : ''}`}
                  isAuthenticated={isAuthenticated}
                >
                  {button.label}
                </ButtonLink>
              ))}
            </div>
          </header>
        </div>
        <GamePageSections sections={saved?.sections} />
        {faqs.length > 0 && (
          <section className="pj-seo-faq" aria-labelledby="pj-seo-cat-faq">
            <h2 id="pj-seo-cat-faq">Frequently asked questions</h2>
            {faqs.map((item) => (
              <div key={item.q} className="pj-seo-faq-item">
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </section>
        )}
      </article>
    </div>
  );
}
