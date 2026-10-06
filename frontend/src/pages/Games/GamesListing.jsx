import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageContentReady } from '../../context/PageReadyContext';
import { GAME_CATEGORY_PAGES } from '../../config/seoPages';
import { STORE_CODE } from '../../config/site';
import { getGamePages } from '../../api/gamePages';
import { GameImage } from '../../components/Games/GameImage';
import './SeoGames.css';

const IS_DRAGONFURY = String(STORE_CODE || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '') === 'dragonfury';

const ACCENTS = [
  { border: 'rgba(0, 255, 224, 0.5)', glow: 'rgba(0, 255, 224, 0.16)' },
  { border: 'rgba(255, 215, 0, 0.55)', glow: 'rgba(255, 215, 0, 0.18)' },
  { border: 'rgba(155, 89, 255, 0.5)', glow: 'rgba(155, 89, 255, 0.16)' },
  { border: 'rgba(56, 189, 248, 0.5)', glow: 'rgba(56, 189, 248, 0.16)' },
  { border: 'rgba(244, 114, 182, 0.5)', glow: 'rgba(244, 114, 182, 0.16)' },
  { border: 'rgba(61, 220, 122, 0.5)', glow: 'rgba(61, 220, 122, 0.16)' },
];

export function GamesListing() {
  const [pages, setPages] = useState(GAME_CATEGORY_PAGES);
  usePageContentReady(true);

  useEffect(() => {
    if (!IS_DRAGONFURY) return undefined;
    let cancelled = false;
    getGamePages()
      .then((res) => {
        const list = Array.isArray(res?.game_pages) ? res.game_pages : [];
        if (cancelled || !list.length) return;
        setPages(list.map((page) => ({
          slug: page.slug,
          name: page.name,
          catalogName: page.catalogName || page.name,
          image: page.image || page.defaultImage,
          genre: page.genre || 'Sweepstakes',
          blurb: page.heroBlurb || page.heroLead || ''
        })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pj-seo-games">
      <nav className="pj-seo-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>Games</span>
      </nav>
      <header className="pj-seo-head pj-seo-head--center">
        <p className="pj-seo-label">Game platforms</p>
        <h1 className="pj-seo-title">Fish tables &amp; slots</h1>
        <p className="pj-seo-lead">
          Browse every game system on Dragon Fury — Juwa, Firekirin, Orionstars, Golden Dragon, Ultra
          Panda, Riversweeps, and more. Sign up and play in your browser.
        </p>
      </header>
      <ul className="pj-seo-grid">
        {pages.map((game, index) => {
          const accent = ACCENTS[index % ACCENTS.length];
          return (
            <li key={game.slug}>
              <Link
                to={`/games/${game.slug}`}
                className="pj-seo-card"
                style={{
                  '--platform-accent': accent.border,
                  '--platform-glow': accent.glow,
                }}
              >
                <div className="pj-seo-card-art">
                  <GameImage
                    game={{ name: game.catalogName, image_url: game.image }}
                    className="pj-seo-card-img"
                    width={280}
                    height={280}
                    loading="eager"
                    fetchPriority={index < 4 ? 'high' : 'auto'}
                  />
                </div>
                <div className="pj-seo-card-body">
                  <span className="pj-seo-chip">{game.genre}</span>
                  <h2>{game.name}</h2>
                  <p>{game.blurb}</p>
                  <span className="pj-seo-card-cta">View game</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
