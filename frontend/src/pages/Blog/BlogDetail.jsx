import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBlogPost } from '../../api/blog';
import { usePageContentReady } from '../../context/PageReadyContext';
import { site } from '../../config/site';
import { usePageSeo } from '../../utils/pageSeo';
import { extractBlogInnerHtml } from '../../utils/blogHtml';
import './Blog.css';

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

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

export function BlogDetail() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  usePageContentReady(!loading);

  const seoTitle = post?.metaTitle || post?.meta_title || (post?.title ? `${post.title} | ${site.platformName}` : '');
  const seoDescription = post?.metaDescription || post?.meta_description || '';
  const seoTags = post?.metaTags || post?.meta_tags || '';
  const noIndex = post?.allowIndex === false || post?.allow_index === false;
  usePageSeo({
    ready: Boolean(post) && !loading,
    title: seoTitle,
    description: seoDescription,
    keywords: seoTags,
    noIndex
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPost(null);
    getBlogPost(slug)
      .then((res) => {
        if (!cancelled) setPost(res?.blog_post ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setPost(null);
          setError(err.message || 'Blog post not found');
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
    if (!post?.content) return;
    const root = document.querySelector('.pj-blog-content');
    wrapTablesForScroll(root);
  }, [post?.content]);

  if (loading) {
    return (
      <div className="pj-blog-page pj-blog-detail">
        <p className="pj-blog-status">Loading…</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="pj-blog-page pj-blog-detail">
        <p className="pj-blog-status pj-blog-status--error">{error || 'Blog post not found'}</p>
        <Link to="/blog" className="pj-blog-back">← Back to blog</Link>
      </div>
    );
  }

  return (
    <article className="pj-blog-page pj-blog-detail">
      <Link to="/blog" className="pj-blog-back">← Back to blog</Link>
      <header className="pj-blog-detail-head">
        {post.category && (
          <span className="dash-slot-games-vendor-chip pj-blog-card-cat">{post.category}</span>
        )}
        <h1 className="pj-blog-detail-title">{post.title}</h1>
        {post.createdAt && (
          <time className="pj-blog-card-date" dateTime={post.createdAt}>
            {formatDate(post.createdAt)}
          </time>
        )}
      </header>
      {post.titleImage && (
        <div className="pj-blog-detail-hero">
          <img src={post.titleImage} alt="" />
        </div>
      )}
      <div
        className="pj-blog-content"
        dangerouslySetInnerHTML={{ __html: extractBlogInnerHtml(post.content) }}
      />
    </article>
  );
}
