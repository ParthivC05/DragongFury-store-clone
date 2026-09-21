import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBlogList } from '../../api/blog';
import { site } from '../../config/site';
import { usePageContentReady } from '../../context/PageReadyContext';
import './Blog.css';

function buildCategories(posts) {
  const set = new Set();
  posts.forEach((p) => {
    if (p.category && String(p.category).trim()) set.add(String(p.category).trim());
  });
  return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
}

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
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

  return (
    <div className="pj-blog-page">
      <header className="pj-blog-head">
        <p className="pj-blog-label">Blog</p>
        <h1 className="pj-blog-title">DragonFury Blog - Game Guides &amp; Tips</h1>
        <p className="pj-blog-sub">
          Explore guides, tips, and comparisons across every game system available on {site.platformName} — from fish games to classic slots.
        </p>
      </header>

      {!loading && categories.length > 1 && (
        <nav className="dash-slot-games-vendors pj-blog-cats" aria-label="Blog categories" role="tablist">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={category === cat}
              className={`dash-slot-games-vendor-chip${category === cat ? ' active' : ''}`}
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

      {!loading && !error && filtered.length > 0 && (
        <div className="pj-blog-grid">
          {filtered.map((post) => (
            <Link key={post.id} to={`/blog/${post.slug}`} className="pj-blog-card">
              <div className="pj-blog-card-media">
                {post.titleImage ? (
                  <img src={post.titleImage} alt="" loading="lazy" />
                ) : (
                  <div className="pj-blog-card-placeholder" aria-hidden />
                )}
              </div>
              <div className="pj-blog-card-body">
                {post.category && (
                  <span className="dash-slot-games-vendor-chip pj-blog-card-cat">{post.category}</span>
                )}
                <h2 className="pj-blog-card-title">{post.title}</h2>
                {post.createdAt && (
                  <time className="pj-blog-card-date" dateTime={post.createdAt}>
                    {formatDate(post.createdAt)}
                  </time>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
