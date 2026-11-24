// Blog publishing logic. Works on any "store" with:
//   read(path) -> string | null        (file contents, null if missing)
//   commit(message, changes)           changes: [{ path, content, encoding: 'utf-8'|'base64', isNew? } | { path, delete: true }]
import { escapeHtml, markdownToHtml, wordCount } from '../admin/markdown.js';

const START = '<!-- POSTS:START -->';
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const SLUG_RE = /^blog-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class BlogError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function slugify(title) {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
  return `blog-${base || 'post'}`;
}

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function siteUrl(blogHtml) {
  const m = blogHtml.match(/<link rel="canonical" href="([^"]+)\/blog\.html">/);
  return m ? m[1] : '';
}

function between(html, startRe, endTag) {
  const start = html.search(startRe);
  if (start < 0) throw new BlogError(500, `blog.html is missing ${startRe}`);
  const end = html.indexOf(endTag, start);
  return html.slice(start, end + endTag.length);
}

function cardHtml(p) {
  return `

      <a class="card blog-card" href="${p.slug}.html" style="text-decoration:none;color:inherit">
        <div class="blog-cover"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.imageAlt)}"></div>
        <div class="card-body">
          <div class="blog-meta"><i class="fas fa-calendar"></i>${formatDate(p.date)}<span></span><i class="fas fa-clock"></i>${p.readTime} min read</div>
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.excerpt)}</p>
          <span class="blog-readmore">Read more<i class="fas fa-arrow-right"></i></span>
        </div>
      </a>`;
}

export function buildPostPage(p, blogHtml) {
  const url = `${siteUrl(blogHtml)}/${p.slug}.html`;
  const header = between(blogHtml, /<header class="site-header">/, '</header>');
  const footer = between(blogHtml, /<footer class="footer">/, '</footer>');
  const chat = between(blogHtml, /<a class="chat-btn"/, '</a>');
  const t = escapeHtml(p.title);
  const d = escapeHtml(p.excerpt);
  const tag = p.tag ? `<span></span><i class="fas fa-tag"></i>${escapeHtml(p.tag)}` : '';
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    description: p.excerpt,
    datePublished: p.date,
    image: `${siteUrl(blogHtml)}/${p.image}`,
    author: { '@type': 'Organization', name: 'TVirish' },
    publisher: { '@type': 'Organization', name: 'TVirish', logo: { '@type': 'ImageObject', url: `${siteUrl(blogHtml)}/logo.jpg` } },
    mainEntityOfPage: url,
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en-IE">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t} | TVirish</title>
<meta name="description" content="${d}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${siteUrl(blogHtml)}/${escapeHtml(p.image)}">
<meta property="og:url" content="${url}">
<link rel="icon" type="image/jpeg" href="logo.jpg">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/fontawesome.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/solid.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/brands.min.css">
<link rel="stylesheet" href="styles.css">
</head>
<body>

${header}

<section class="article-hero">
  <a class="back-link" href="blog.html"><i class="fas fa-arrow-left"></i>Back to Blog</a>
  <h1 class="article-title">${t}</h1>
  <div class="container container-narrow" style="margin-bottom:26px">
    <div class="blog-meta"><i class="fas fa-calendar"></i>${formatDate(p.date)}<span></span><i class="fas fa-clock"></i>${p.readTime} min read${tag}</div>
  </div>
  <div class="container container-narrow">
    <div class="article-cover"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.imageAlt)}"></div>
  </div>
</section>

<article class="article-body">
${markdownToHtml(p.body)}

  <div class="article-cta">
    <h3>Ready to start watching?</h3>
    <p>Instant access in under 5 minutes, with a 30-day money-back guarantee.</p>
    <a href="index.html#pricing" class="btn"><i class="fas fa-bolt"></i>See Plans &amp; Pricing</a>
  </div>
</article>

${footer}

${chat}

<script type="application/ld+json">${ld}</script>
</body>
</html>
`;
}

export function addCard(blogHtml, p) {
  if (!blogHtml.includes(START)) throw new BlogError(500, `blog.html is missing the ${START} marker`);
  return blogHtml.replace(START, START + cardHtml(p));
}

function cardRe(slug) {
  return new RegExp(`\\n\\n?[ \\t]*<a class="card blog-card" href="${slug}\\.html"[\\s\\S]*?</a>`);
}

export function listPosts(blogHtml) {
  const posts = [];
  const re = /<a class="card blog-card" href="([^"]+)\.html"[\s\S]*?<img src="([^"]*)"[\s\S]*?<i class="fas fa-calendar"><\/i>([^<]*)<[\s\S]*?<h3>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/g;
  for (const m of blogHtml.matchAll(re)) {
    posts.push({ slug: m[1], image: m[2], date: m[3].trim(), title: m[4].replace(/&amp;/g, '&').trim() });
  }
  return posts;
}

function clean(v, max) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function createPost(store, input) {
  const title = clean(input.title, 140);
  const excerpt = clean(input.excerpt, 300);
  const imageAlt = clean(input.imageAlt, 200) || title;
  const tag = clean(input.tag, 40);
  const body = String(input.body ?? '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : new Date().toISOString().slice(0, 10);
  if (!title) throw new BlogError(400, 'Please add a title.');
  if (!excerpt) throw new BlogError(400, 'Please add a short summary.');
  if (wordCount(body) < 20) throw new BlogError(400, 'The article text is too short.');

  const ext = IMAGE_TYPES[input.image?.type];
  if (!ext || !input.image.data) throw new BlogError(400, 'Please add a cover image (JPG, PNG or WebP).');
  const imageBytes = Buffer.from(input.image.data, 'base64');
  if (imageBytes.length > MAX_IMAGE_BYTES) throw new BlogError(400, 'The cover image is too large (max 3 MB).');

  const blogHtml = await store.read('blog.html');
  if (!blogHtml) throw new BlogError(500, 'blog.html was not found in the GitLab repository.');

  let slug = slugify(title);
  for (let n = 2; (await store.read(`${slug}.html`)) !== null; n++) slug = `${slugify(title)}-${n}`;

  const post = {
    slug, title, excerpt, tag, body, date, imageAlt,
    image: `blog-images/${slug}.${ext}`,
    readTime: Math.max(1, Math.round(wordCount(body) / 200)),
  };

  await store.commit(`Add blog post: ${title}`, [
    { path: post.image, content: input.image.data, encoding: 'base64', isNew: true },
    { path: `${slug}.html`, content: buildPostPage(post, blogHtml), encoding: 'utf-8', isNew: true },
    { path: 'blog.html', content: addCard(blogHtml, post), encoding: 'utf-8' },
  ]);
  return { slug, path: `/${slug}.html` };
}

export async function deletePost(store, slug) {
  if (!SLUG_RE.test(slug || '')) throw new BlogError(400, 'Invalid post.');
  const blogHtml = await store.read('blog.html');
  const post = listPosts(blogHtml || '').find((p) => p.slug === slug);
  if (!post) throw new BlogError(404, 'That post is not on the blog page.');

  const changes = [{ path: 'blog.html', content: blogHtml.replace(cardRe(slug), ''), encoding: 'utf-8' }];
  if ((await store.read(`${slug}.html`)) !== null) changes.push({ path: `${slug}.html`, delete: true });
  if (post.image.startsWith('blog-images/')) changes.push({ path: post.image, delete: true });
  await store.commit(`Delete blog post: ${post.title}`, changes);
  return { slug };
}
