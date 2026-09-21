'use strict';

const blogPosts = require('./blogPosts.service');

const STATIC_SITEMAP_PATHS = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/blog', changefreq: 'weekly', priority: '0.8' },
  { path: '/link2play', changefreq: 'weekly', priority: '0.7' },
  { path: '/promotions', changefreq: 'weekly', priority: '0.7' },
  { path: '/help', changefreq: 'monthly', priority: '0.6' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
  { path: '/faq', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.4' },
  { path: '/terms', changefreq: 'yearly', priority: '0.4' },
  { path: '/responsible-gaming', changefreq: 'yearly', priority: '0.4' },
  { path: '/slots', changefreq: 'weekly', priority: '0.7' }
];

/** Public SPA paths that should return crawler HTML (not /blog — that has its own builders). */
const MARKETING_SEO_PATHS = STATIC_SITEMAP_PATHS.map((item) => item.path).filter(
  (path) => path !== '/blog'
);

const MARKETING_PAGE_COPY = {
  '/': {
    heading: (label) => label,
    title: (label) => `${label} | USA Sweepstakes Casino Games & Bonuses`,
    description: (label) =>
      `Play sweepstakes casino games online with ${label}. Explore platforms, fish games, bonuses, and secure play across the USA.`,
    paragraphs: (label) => [
      `${label} is a free-to-enter sweepstakes entertainment platform. No purchase is required to participate.`,
      'Play with Gold Coins for entertainment only, or Sweeps Coins that may be eligible for prize redemption when you meet the current rules.',
      'Availability depends on your location and age. You must be 18 or older, or the age of majority in your state, whichever is greater. Void where prohibited.'
    ]
  },
  '/about': {
    heading: (label) => `About ${label}`,
    title: (label) => `About ${label}`,
    description: (label) => `Learn how ${label} works as a USA sweepstakes casino entertainment platform.`,
    paragraphs: (label) => [
      `${label} offers online sweepstakes-style games, including slots and fish-table platforms, for eligible players in the United States.`,
      'Create a free account, explore the lobby, and read the current Terms and Responsible Gaming pages before you play or redeem prizes.'
    ]
  },
  '/help': {
    heading: () => 'Help',
    title: (label) => `Help | ${label}`,
    description: (label) => `Guides for accounts, deposits, play, and support on ${label}.`,
    paragraphs: (label) => [
      `Find answers about signing in, playing games, promotions, and contacting ${label} support.`,
      'Open Help on the website for step-by-step guides. For account-specific issues, use the Contact page.'
    ]
  },
  '/contact': {
    heading: () => 'Contact',
    title: (label) => `Contact ${label}`,
    description: (label) => `How to reach ${label} support.`,
    paragraphs: (label) => [
      `Use the Contact page on ${label} to send a message to support.`,
      'Have your account email ready. We cannot process prize or payment questions without a signed-in account where required.'
    ]
  },
  '/faq': {
    heading: () => 'FAQ',
    title: (label) => `FAQ | ${label}`,
    description: (label) => `Frequently asked questions about ${label} sweepstakes play.`,
    paragraphs: (label) => [
      `${label} is free to join. Gold Coins are for entertainment play and are not redeemable.`,
      'Sweeps Coins may be redeemable for prizes only if you meet the current eligibility, verification, and balance rules in the Terms.'
    ]
  },
  '/privacy': {
    heading: () => 'Privacy Policy',
    title: (label) => `Privacy Policy | ${label}`,
    description: (label) => `Privacy policy for ${label}.`,
    paragraphs: (label) => [
      `This page describes how ${label} handles personal information.`,
      'Read the full Privacy Policy on the website before you create an account.'
    ]
  },
  '/terms': {
    heading: () => 'Terms',
    title: (label) => `Terms | ${label}`,
    description: (label) => `Terms of use for ${label}.`,
    paragraphs: (label) => [
      `Participation in ${label} is subject to the current Terms, including age, location, and sweepstakes rules.`,
      'Void where prohibited. Review the full Terms on the website before playing or requesting a redemption.'
    ]
  },
  '/responsible-gaming': {
    heading: () => 'Responsible Gaming',
    title: (label) => `Responsible Gaming | ${label}`,
    description: (label) => `Responsible gaming information for ${label}.`,
    paragraphs: (label) => [
      `${label} is for entertainment. Play only if you are eligible and can do so responsibly.`,
      'If play stops being fun, take a break and review the Responsible Gaming tools and resources on this site.'
    ]
  },
  '/promotions': {
    heading: () => 'Promotions',
    title: (label) => `Promotions | ${label}`,
    description: (label) => `Current promotions and bonuses on ${label}.`,
    paragraphs: (label) => [
      `${label} may offer promotional Gold Coins or Sweeps Coins. Offers change and have rules.`,
      'Sign in on the website to see promotions available to your account. No purchase is required to participate in the sweepstakes.'
    ]
  },
  '/link2play': {
    heading: () => 'Play on your device',
    title: (label) => `Play on your device | ${label}`,
    description: (label) => `How to open ${label} games on a compatible device.`,
    paragraphs: (label) => [
      `Use ${label} in a supported browser, or follow the on-site Link2Play instructions for compatible devices.`,
      'Only use the official website. Do not install APKs or apps from third-party pages.'
    ]
  },
  '/slots': {
    heading: () => 'Casino games',
    title: (label) => `Casino games | ${label}`,
    description: (label) => `Sweepstakes slot and casino-style games on ${label}.`,
    paragraphs: (label) => [
      `${label} lists slot and related games in the lobby. What you see depends on your location and the current catalog.`,
      'Open the website, sign in if you have an account, and choose a game from the live lobby.'
    ]
  }
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, ' ');
}

/** Pull the inner article out of a pasted full HTML document. */
function extractArticleHtml(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let html = raw.trim();
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) html = body[1];
  html = html
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .trim();
  html = html.replace(/^\s*<main[^>]*>/i, '').replace(/<\/main>\s*$/i, '').trim();
  html = html.replace(/^\s*<article[^>]*>/i, '').replace(/<\/article>\s*$/i, '').trim();
  return html;
}

function w3cDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toISOString();
  } catch {
    return '';
  }
}

function xmlDate(value) {
  const iso = w3cDate(value);
  return iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function originPath(origin, path) {
  const base = String(origin || '').replace(/\/$/, '');
  if (!path || path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function htmlShell({ title, description, canonical, robots, extraHead = '', body, ogType = 'article' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <meta name="robots" content="${escapeAttr(robots)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">
  <meta property="og:type" content="${escapeAttr(ogType)}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${escapeAttr(canonical)}">
${extraHead}
  <style>
    body{margin:0;background:#0a0a0a;color:#f5f5f5;font-family:system-ui,sans-serif;line-height:1.6}
    .seo-wrap{max-width:760px;margin:0 auto;padding:32px 20px 64px}
    a{color:#1fd1d1}
    h1,h2,h3{line-height:1.25}
    img{max-width:100%;height:auto;border-radius:12px}
    figure{margin:1.25rem 0}
    figcaption{font-size:13px;color:#94a3b8;text-align:center;margin-top:6px}
    figure[data-align="left"]{float:left;width:42%;margin:0 1rem 1rem 0}
    figure[data-align="right"]{float:right;width:42%;margin:0 0 1rem 1rem}
    table{width:100%;border-collapse:collapse}
    td,th{border:1px solid #333;padding:8px;text-align:left}
  </style>
</head>
<body>
  <div class="seo-wrap">
${body}
  </div>
</body>
</html>`;
}

async function listIndexablePosts(storeCode) {
  const { blog_posts: posts } = await blogPosts.listPublic(storeCode, {});
  return (posts || []).filter((post) => post.allowIndex !== false);
}

function buildSitemapXml({ origin, posts }) {
  const urls = [];
  for (const item of STATIC_SITEMAP_PATHS) {
    urls.push(
      `  <url>\n    <loc>${escapeHtml(originPath(origin, item.path))}</loc>\n    <changefreq>${item.changefreq}</changefreq>\n    <priority>${item.priority}</priority>\n  </url>`
    );
  }
  for (const post of posts || []) {
    const slug = String(post.slug || '').trim();
    if (!slug) continue;
    const lastmod = xmlDate(post.updatedAt || post.createdAt);
    urls.push(
      `  <url>\n    <loc>${escapeHtml(originPath(origin, `/blog/${slug}`))}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function buildBlogIndexHtml({ origin, storeLabel, posts }) {
  const canonical = originPath(origin, '/blog');
  const items = (posts || [])
    .map((post) => {
      const href = originPath(origin, `/blog/${post.slug}`);
      const date = post.createdAt ? xmlDate(post.createdAt) : '';
      return `      <li><a href="${escapeAttr(href)}">${escapeHtml(post.title)}</a>${date ? ` <time datetime="${escapeAttr(w3cDate(post.createdAt))}">${escapeHtml(date)}</time>` : ''}</li>`;
    })
    .join('\n');
  const body = `    <p><a href="${escapeAttr(originPath(origin, '/'))}">← Home</a></p>
    <h1>${escapeHtml(storeLabel)} Blog</h1>
    ${items ? `<ul>\n${items}\n    </ul>` : '<p>No blog posts yet.</p>'}`;
  return htmlShell({
    title: `${storeLabel} Blog`,
    description: `Guides and offers from ${storeLabel}.`,
    canonical,
    robots: 'index, follow',
    body
  });
}

function buildBlogPostHtml({ origin, storeLabel, post }) {
  const slug = String(post.slug || '').trim();
  const canonical = originPath(origin, `/blog/${slug}`);
  const title = String(post.metaTitle || post.title || 'Blog').trim();
  const description = String(post.metaDescription || '').trim();
  const robots = post.allowIndex === false ? 'noindex, nofollow' : 'index, follow';
  const articleHtml = extractArticleHtml(post.content || '')
    .replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, '')
    .trim();
  const image = post.titleImage ? String(post.titleImage).trim() : '';
  const published = w3cDate(post.createdAt);
  const modified = w3cDate(post.updatedAt || post.createdAt);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    mainEntityOfPage: canonical,
    datePublished: published || undefined,
    dateModified: modified || undefined,
    image: image || undefined,
    author: { '@type': 'Organization', name: storeLabel },
    publisher: { '@type': 'Organization', name: storeLabel }
  };
  const extraHead = `  <script type="application/ld+json">${JSON.stringify(schema)}</script>${
    image ? `\n  <meta property="og:image" content="${escapeAttr(image)}">` : ''
  }`;
  const body = `    <p><a href="${escapeAttr(originPath(origin, '/blog'))}">← Back to blog</a></p>
    <article>
      ${post.category ? `<p>${escapeHtml(post.category)}</p>` : ''}
      <h1>${escapeHtml(post.title || title)}</h1>
      ${published ? `<p><time datetime="${escapeAttr(published)}">${escapeHtml(xmlDate(post.createdAt))}</time></p>` : ''}
      ${image ? `<p><img src="${escapeAttr(image)}" alt=""></p>` : ''}
      ${articleHtml}
    </article>`;
  return htmlShell({
    title,
    description,
    canonical,
    robots,
    extraHead,
    body
  });
}

function buildNotFoundHtml({ origin, storeLabel }) {
  const canonical = originPath(origin, '/blog');
  return htmlShell({
    title: `Post not found | ${storeLabel}`,
    description: 'This blog post is not available.',
    canonical,
    robots: 'noindex, nofollow',
    body: `    <h1>Post not found</h1>
    <p>This article may have been moved or is no longer available.</p>
    <p><a href="${escapeAttr(canonical)}">Back to blog</a></p>`
  });
}

function navLinks(origin, currentPath) {
  const links = [
    ['/', 'Home'],
    ['/about', 'About'],
    ['/blog', 'Blog'],
    ['/help', 'Help'],
    ['/contact', 'Contact']
  ];
  return links
    .filter(([path]) => path !== currentPath)
    .map(([path, label]) => `<a href="${escapeAttr(originPath(origin, path))}">${escapeHtml(label)}</a>`)
    .join(' · ');
}

function fallbackCopyForPath(path) {
  if (MARKETING_PAGE_COPY[path]) return MARKETING_PAGE_COPY[path];
  if (path === '/casino') return MARKETING_PAGE_COPY['/slots'];
  return null;
}

function slugFromPath(path) {
  return String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function buildMarketingFallbackHtml({ origin, storeLabel, path }) {
  const spec = fallbackCopyForPath(path);
  const safePath = spec ? (path === '/casino' ? '/slots' : path) : '/';
  const copy = fallbackCopyForPath(safePath) || MARKETING_PAGE_COPY['/'];
  const canonical = originPath(origin, safePath);
  const heading = copy.heading(storeLabel);
  const paragraphs = copy.paragraphs(storeLabel).map((p) => `    <p>${escapeHtml(p)}</p>`).join('\n');
  const extra =
    safePath === '/'
      ? `    <p><a href="${escapeAttr(originPath(origin, '/blog'))}">Read the blog</a> · <a href="${escapeAttr(originPath(origin, '/help'))}">Help</a></p>`
      : '';
  const body = `    <p>${navLinks(origin, safePath)}</p>
    <h1>${escapeHtml(heading)}</h1>
${paragraphs}
${extra}`;
  return htmlShell({
    title: copy.title(storeLabel),
    description: copy.description(storeLabel),
    canonical,
    robots: 'index, follow',
    ogType: 'website',
    body
  });
}

function buildFooterPageHtml({ origin, storeLabel, path, page }) {
  const canonical = originPath(origin, path);
  const title = String(page.metaTitle || page.title || storeLabel).trim();
  const description = String(page.metaDescription || '').trim() || `${page.title || 'Page'} | ${storeLabel}`;
  const articleHtml = extractArticleHtml(page.content || '').trim();
  const body = `    <p>${navLinks(origin, path)}</p>
    <h1>${escapeHtml(page.title || title)}</h1>
    ${articleHtml || `<p>${escapeHtml(description)}</p>`}`;
  return htmlShell({
    title,
    description,
    canonical,
    robots: 'index, follow',
    ogType: 'website',
    extraHead: page.updatedAt
      ? `  <meta property="article:modified_time" content="${escapeAttr(w3cDate(page.updatedAt))}">`
      : '',
    body
  });
}

function buildHomeHtml({ origin, storeLabel, posts }) {
  const copy = MARKETING_PAGE_COPY['/'];
  const canonical = originPath(origin, '/');
  const items = (posts || [])
    .slice(0, 8)
    .map((post) => {
      const href = originPath(origin, `/blog/${post.slug}`);
      return `      <li><a href="${escapeAttr(href)}">${escapeHtml(post.title)}</a></li>`;
    })
    .join('\n');
  const blogBlock = items
    ? `    <h2>From the blog</h2>\n    <ul>\n${items}\n    </ul>`
    : `    <p><a href="${escapeAttr(originPath(origin, '/blog'))}">Visit the blog</a></p>`;
  const paragraphs = copy.paragraphs(storeLabel).map((p) => `    <p>${escapeHtml(p)}</p>`).join('\n');
  const body = `    <p>${navLinks(origin, '/')}</p>
    <h1>${escapeHtml(copy.heading(storeLabel))}</h1>
${paragraphs}
${blogBlock}`;
  return htmlShell({
    title: copy.title(storeLabel),
    description: copy.description(storeLabel),
    canonical,
    robots: 'index, follow',
    ogType: 'website',
    body
  });
}

module.exports = {
  STATIC_SITEMAP_PATHS,
  MARKETING_SEO_PATHS,
  extractArticleHtml,
  listIndexablePosts,
  buildSitemapXml,
  buildBlogIndexHtml,
  buildBlogPostHtml,
  buildNotFoundHtml,
  buildMarketingFallbackHtml,
  buildFooterPageHtml,
  buildHomeHtml,
  slugFromPath
};
