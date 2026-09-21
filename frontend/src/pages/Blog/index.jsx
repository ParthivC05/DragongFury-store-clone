import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBlogList } from '../../api/blog';
import { site } from '../../config/site';
import { usePageContentReady } from '../../context/PageReadyContext';
import { excerptFromHtml, formatBlogDate } from '../../utils/blogHtml';
import './Blog.css';

function buildCategories(posts) {
  const set = new Set();
  posts.forEach((p) => {
    if (p.category && String(p.category).trim()) set.add(String(p.category).trim());
  });
  return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
}

export function Blog() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All');

  usePageContentReady(!loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getBlogList()
      .then((res) => {
        if (!cancelled) setPosts(res?.blog_posts ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setPosts([]);
          setError(err.message || 'Failed to load blog posts');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => buildCategories(posts), [posts]);
  const filtered = useMemo(() => {
    if (category === 'All') return posts;
    return posts.filter((p) => String(p.category || '').trim() === category);
  }, [posts, category]);

  const featured = filtered[0] || null;
  const rest = filtered.slice(1);
  const spotlight = rest.slice(0, 3);
  const more = rest.slice(3);
  const featuredExcerpt = excerptFromHtml(featured?.metaDescription || featured?.content, 180);

  return (
    <div className="pj-blog-page pj-journal">
      <header className="pj-journal-head">
        <p className="pj-journal-kicker">Blog</p>
        <h1 className="pj-journal-title">{site.platformName} Blog</h1>
        <p className="pj-journal-sub">
          Guides, tips, and updates from {site.platformName}.
        </p>
      </header>

      {!loading && categories.length > 1 && (
        <nav className="pj-journal-cats" aria-label="Blog categories" role="tablist">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={category === cat}
              className={`pj-journal-chip${category === cat ? ' is-active' : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </nav>
      )}

      {loading && <p className="pj-blog-status">Loading posts…</p>}
      {!loading && error && <p className="pj-blog-status pj-blog-status--error">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="pj-blog-status">No blog posts yet. Check back soon.</p>
      )}

      {!loading && !error && featured && (
        <section className="pj-journal-feature">
          <Link to={`/blog/${featured.slug}`} className="pj-journal-feature-card">
            <div className="pj-journal-feature-media">
              {featured.titleImage ? (
                <img src={featured.titleImage} alt="" />
              ) : (
                <div className="pj-journal-placeholder" aria-hidden />
              )}
            </div>
            <div className="pj-journal-feature-copy">
              <span className="pj-journal-ribbon">Featured</span>
              {featured.category && <span className="pj-journal-chip is-ghost">{featured.category}</span>}
              <h2>{featured.title}</h2>
              {featuredExcerpt && <p>{featuredExcerpt}</p>}
              <div className="pj-journal-meta">
                {featured.createdAt && <time dateTime={featured.createdAt}>{formatBlogDate(featured.createdAt)}</time>}
              </div>
            </div>
          </Link>
        </section>
      )}

      {!loading && !error && spotlight.length > 0 && (
        <section className="pj-journal-spotlight" aria-label="More posts">
          {spotlight.map((post) => (
            <Link key={post.id} to={`/blog/${post.slug}`} className="pj-journal-row">
              <div className="pj-journal-row-media">
                {post.titleImage ? (
                  <img src={post.titleImage} alt="" loading="lazy" />
                ) : (
                  <div className="pj-journal-placeholder" aria-hidden />
                )}
              </div>
              <div className="pj-journal-row-copy">
                {post.category && <span className="pj-journal-chip is-ghost">{post.category}</span>}
                <h3>{post.title}</h3>
                {excerptFromHtml(post.metaDescription || post.content, 110) && (
                  <p>{excerptFromHtml(post.metaDescription || post.content, 110)}</p>
                )}
                {post.createdAt && (
                  <time dateTime={post.createdAt}>{formatBlogDate(post.createdAt)}</time>
                )}
              </div>
            </Link>
          ))}
        </section>
      )}

      {!loading && !error && more.length > 0 && (
        <section className="pj-journal-mosaic" aria-label="Archive">
          {more.map((post) => (
            <Link key={post.id} to={`/blog/${post.slug}`} className="pj-journal-tile">
              <div className="pj-journal-tile-media">
                {post.titleImage ? (
                  <img src={post.titleImage} alt="" loading="lazy" />
                ) : (
                  <div className="pj-journal-placeholder" aria-hidden />
                )}
              </div>
              <div className="pj-journal-tile-copy">
                {post.category && <span>{post.category}</span>}
                <h3>{post.title}</h3>
                {post.createdAt && <time dateTime={post.createdAt}>{formatBlogDate(post.createdAt)}</time>}
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
