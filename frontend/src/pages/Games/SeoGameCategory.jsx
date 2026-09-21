import { Link, Navigate, useParams } from 'react-router-dom';
import { usePageContentReady } from '../../context/PageReadyContext';
import { useAuth } from '../../context/AuthContext';
import { getGameCategoryBySlug, getGameCategoryRedirect } from '../../config/seoPages';
import { buildPlatformFaq } from '../../constants/landingFaq';
import { GameImage } from '../../components/Games/GameImage';
import './SeoGames.css';

export function SeoGameCategory() {
  const { gameId } = useParams();
  const { isAuthenticated } = useAuth();
  const redirectTo = getGameCategoryRedirect(gameId);
  const page = getGameCategoryBySlug(gameId);
  usePageContentReady(Boolean(page) || Boolean(redirectTo));

  if (redirectTo) return <Navigate to={redirectTo} replace />;
  if (!page) return <Navigate to="/games" replace />;

  const faqs = buildPlatformFaq(page.name);
  const playHref = isAuthenticated ? '/#games' : '/register';

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
            <p className="pj-seo-label">{page.genre}</p>
            <h1 className="pj-seo-title">{page.name}</h1>
            <p className="pj-seo-lead">{page.description}</p>
            <p className="pj-seo-blurb">{page.blurb}</p>
            <div className="pj-seo-actions">
              <Link to={playHref} className="pj-seo-btn pj-seo-btn-primary">
                Play {page.name}
              </Link>
              <Link to="/games" className="pj-seo-btn">
                All games
              </Link>
            </div>
          </header>
        </div>
        <section className="pj-seo-faq" aria-labelledby="pj-seo-cat-faq">
          <h2 id="pj-seo-cat-faq">Frequently asked questions</h2>
          {faqs.map((item) => (
            <div key={item.q} className="pj-seo-faq-item">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </section>
      </article>
    </div>
  );
}
