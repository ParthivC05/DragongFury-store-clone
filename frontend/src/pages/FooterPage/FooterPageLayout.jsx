import { Link } from 'react-router-dom';
import { STORE_CODE } from '../../config/site';

const IS_DRAGONFURY = String(STORE_CODE || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'dragonfury';
const SECTION_THEMES = ['gold', 'teal', 'ember', 'forest'];

function hasBlockContent(block) {
  if (!block) return false;
  return Boolean(
    String(block.title || '').trim()
    || String(block.body || '').trim()
    || String(block.imageUrl || '').trim()
    || (block.showButton && block.buttonUrl)
  );
}

export function hasFooterLayout(sections) {
  if (!sections || typeof sections !== 'object') return false;
  if (hasBlockContent(sections.hero)) return true;
  return Array.isArray(sections.blocks) && sections.blocks.some(hasBlockContent);
}

function splitLinkedText(text, links) {
  const valid = (Array.isArray(links) ? links : [])
    .map((l) => ({ text: String(l?.text || ''), url: String(l?.url || '').trim() }))
    .filter((l) => l.text && l.url)
    .sort((a, b) => b.text.length - a.text.length);

  const nodes = [];
  let remaining = String(text || '');
  let key = 0;
  while (remaining.length) {
    let best = null;
    let bestAt = -1;
    for (const link of valid) {
      const at = remaining.indexOf(link.text);
      if (at === -1) continue;
      if (bestAt === -1 || at < bestAt || (at === bestAt && link.text.length > best.text.length)) {
        best = link;
        bestAt = at;
      }
    }
    if (!best || bestAt < 0) {
      nodes.push(remaining);
      break;
    }
    if (bestAt > 0) nodes.push(remaining.slice(0, bestAt));
    const href = best.url;
    const external = /^https?:\/\//i.test(href);
    nodes.push(
      external ? (
        <a key={`l-${key++}`} className="pj-fp-link" href={href} target="_blank" rel="noopener noreferrer">{best.text}</a>
      ) : (
        <Link key={`l-${key++}`} className="pj-fp-link" to={href}>{best.text}</Link>
      )
    );
    remaining = remaining.slice(bestAt + best.text.length);
  }
  return nodes;
}

function withLineBreaks(nodes) {
  const out = [];
  nodes.forEach((node, i) => {
    if (typeof node !== 'string') {
      out.push(node);
      return;
    }
    const parts = node.split('\n');
    parts.forEach((part, j) => {
      if (j > 0) out.push(<br key={`br-${i}-${j}`} />);
      if (part) out.push(part);
    });
  });
  return out;
}

function LinkedBody({ text, links }) {
  const chunks = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!chunks.length) return null;
  return chunks.map((chunk, i) => (
    <p key={`p-${i}`}>{withLineBreaks(splitLinkedText(chunk, links))}</p>
  ));
}

function FooterCta({ show, text, url }) {
  if (!show || !url) return null;
  const label = String(text || 'DEPOSIT NOW').trim() || 'DEPOSIT NOW';
  const inner = <span className="pj-fp-cta-label">{label}</span>;
  if (/^https?:\/\//i.test(url)) {
    return (
      <a className="pj-fp-cta" href={url} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <Link className="pj-fp-cta" to={url}>
      {inner}
    </Link>
  );
}

function MediaColumn({ block, includeButton }) {
  if (!block?.imageUrl && !(includeButton && block?.showButton)) return null;
  return (
    <div className="pj-fp-media">
      {block.imageUrl ? (
        <div className="pj-fp-frame">
          <img src={block.imageUrl} alt={block.imageAlt || block.title || ''} />
        </div>
      ) : null}
      {includeButton ? <FooterCta show={block.showButton} text={block.buttonText} url={block.buttonUrl} /> : null}
    </div>
  );
}

function CopyColumn({ block, includeButton, headingClass, headingTag: Tag = 'h2', indexLabel }) {
  const hasTitle = Boolean(String(block?.title || '').trim());
  const hasBody = Boolean(String(block?.body || '').trim());
  const hasBtn = includeButton && block?.showButton && block?.buttonUrl;
  if (!hasTitle && !hasBody && !hasBtn) return null;
  return (
    <div className="pj-fp-copy">
      {hasTitle ? (
        <div className="pj-fp-heading-row">
          {indexLabel ? <span className="pj-fp-index">{indexLabel}</span> : null}
          <Tag className={headingClass}>{block.title}</Tag>
        </div>
      ) : null}
      <LinkedBody text={block.body} links={block.links} />
      {includeButton ? <FooterCta show={block.showButton} text={block.buttonText} url={block.buttonUrl} /> : null}
    </div>
  );
}

function hasMedia(block, includeButton) {
  return Boolean(block?.imageUrl) || Boolean(includeButton && block?.showButton && block?.buttonUrl);
}

function hasCopy(block, includeButton) {
  return Boolean(String(block?.title || '').trim())
    || Boolean(String(block?.body || '').trim())
    || Boolean(includeButton && block?.showButton && block?.buttonUrl);
}

function Split({ block, buttonWithMedia, headingClass, headingTag, indexLabel }) {
  const imageLeft = block.imagePosition === 'left';
  const attachButtonToMedia = Boolean(buttonWithMedia && block?.imageUrl);
  const showMedia = hasMedia(block, attachButtonToMedia);
  const showCopy = hasCopy(block, !attachButtonToMedia);
  const media = showMedia ? <MediaColumn block={block} includeButton={attachButtonToMedia} /> : null;
  const copy = showCopy ? (
    <CopyColumn
      block={block}
      includeButton={!attachButtonToMedia}
      headingClass={headingClass}
      headingTag={headingTag}
      indexLabel={indexLabel}
    />
  ) : null;
  if (!media && !copy) return null;
  if (!media) return copy;
  if (!copy) return media;
  return (
    <div className={`pj-fp-split${imageLeft ? ' is-image-left' : ' is-image-right'}`}>
      {copy}
      {media}
    </div>
  );
}

export function FooterPageLayout({ sections, fallbackTitle }) {
  const hero = sections?.hero || {};
  const blocks = Array.isArray(sections?.blocks) ? sections.blocks.filter(hasBlockContent) : [];
  const showHero = hasBlockContent(hero);
  const heroTitle = String(hero.title || '').trim() || String(fallbackTitle || '').trim();

  return (
    <div className={`pj-fp-layout${IS_DRAGONFURY ? ' pj-fp-brand' : ''}`}>
      {showHero ? (
        <section className={IS_DRAGONFURY ? 'pj-fp-hero' : 'pj-fp-hero theme-gold'}>
          <div className="pj-fp-hero-head">
            {IS_DRAGONFURY ? <p className="pj-fp-kicker">Dragon Fury</p> : null}
            {heroTitle ? <h1 className="pj-fp-hero-title">{heroTitle}</h1> : null}
          </div>
          <Split
            block={{ ...hero, title: '' }}
            buttonWithMedia
            headingClass="pj-fp-section-title"
          />
        </section>
      ) : (
        fallbackTitle ? (
          <div className="pj-fp-hero-head">
            {IS_DRAGONFURY ? <p className="pj-fp-kicker">Dragon Fury</p> : null}
            <h1 className="pj-fp-hero-title">{fallbackTitle}</h1>
          </div>
        ) : null
      )}
      {blocks.map((block, index) => {
        const theme = SECTION_THEMES[(showHero ? index + 1 : index) % SECTION_THEMES.length];
        return (
          <section
            className={IS_DRAGONFURY
              ? `pj-fp-card${index % 2 === 1 ? ' is-inset' : ''}`
              : `pj-fp-card theme-${theme}`}
            key={block.id || block.title}
          >
            <Split
              block={block}
              buttonWithMedia={false}
              headingClass="pj-fp-section-title"
              headingTag="h2"
              indexLabel={IS_DRAGONFURY ? String(index + 1).padStart(2, '0') : undefined}
            />
          </section>
        );
      })}
    </div>
  );
}
