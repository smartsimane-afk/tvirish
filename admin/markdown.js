// Tiny formatter for blog posts, used by the dashboard preview and when publishing.
//   ## Heading / ### Subheading    - bullet    1. numbered
//   **bold**   *italic*   [link text](https://example.com)
//   ![photo description](blog-images/photo.jpg)   on its own line = photo
//   A blank line starts a new paragraph.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(url) {
  url = url.trim();
  return /^(https?:\/\/|mailto:|#|\/|[\w.-]+\.html)/i.test(url) ? url : '#';
}

function safeImageSrc(url) {
  url = url.trim();
  return /^(https:\/\/|[\w-]+(\/[\w.-]+)*\.(jpe?g|png|webp|gif)$)/i.test(url) ? url : '';
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const href = safeHref(url.replace(/&amp;/g, '&'));
      const external = /^https?:\/\//i.test(href);
      return `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

// resolveImage lets the dashboard preview show photos that are not uploaded yet.
export function markdownToHtml(src, { resolveImage } = {}) {
  const out = [];
  let para = [];
  let list = null; // { tag, items }

  const flushPara = () => {
    if (para.length) out.push(`  <p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`  <${list.tag}>\n${list.items.map((i) => `    <li>${inline(i)}</li>`).join('\n')}\n  </${list.tag}>`);
    list = null;
  };

  for (const raw of String(src).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) {
      flushPara();
      flushList();
    } else if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      flushPara();
      flushList();
      const src = (resolveImage && resolveImage(m[2])) || safeImageSrc(m[2]);
      if (src) out.push(`  <figure class="article-img"><img src="${escapeHtml(src)}" alt="${escapeHtml(m[1])}" loading="lazy"></figure>`);
    } else if ((m = line.match(/^(#{2,3})\s+(.*)$/))) {
      flushPara();
      flushList();
      const tag = m[1].length === 2 ? 'h2' : 'h3';
      out.push(`  <${tag}>${inline(m[2])}</${tag}>`);
    } else if ((m = line.match(/^(?:[-*]|(\d+)\.)\s+(.*)$/))) {
      flushPara();
      const tag = m[1] ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(m[2]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join('\n\n');
}

export function wordCount(src) {
  const text = String(src).replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  return (text.match(/[\p{L}\p{N}']+/gu) || []).length;
}
