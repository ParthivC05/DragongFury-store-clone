/**
 * Convert blog HTML <-> visual story blocks so images can sit anywhere
 * between headings, paragraphs, and quotes.
 */

export function newBlockId() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createBlock(type, extra = {}) {
  const base = { id: extra.id || newBlockId(), type }
  if (type === 'heading') {
    return { ...base, level: extra.level || 2, text: extra.text || '' }
  }
  if (type === 'text') {
    return { ...base, html: extra.html || '' }
  }
  if (type === 'image') {
    return {
      ...base,
      src: extra.src || '',
      alt: extra.alt || '',
      caption: extra.caption || '',
      align: extra.align || 'center'
    }
  }
  if (type === 'quote') {
    return { ...base, html: extra.html || extra.text || '' }
  }
  if (type === 'divider') return base
  return { ...base, html: extra.html || '' }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isBlankHtml(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
  return !text
}

function headingLevel(tag) {
  const n = Number(String(tag || '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 2
}

function readAlign(el, img) {
  const raw = el?.getAttribute?.('data-align') || ''
  if (['wide', 'left', 'right', 'center', 'full'].includes(raw)) return raw
  const cls = `${el?.className || ''} ${img?.className || ''} ${el?.getAttribute?.('class') || ''}`
  if (/\bql-align-center\b/.test(cls) || /text-align:\s*center/i.test(el?.getAttribute?.('style') || '')) return 'center'
  if (/\bql-align-right\b/.test(cls)) return 'right'
  if (/\bql-align-left\b/.test(cls)) return 'left'
  return 'center'
}

function imageFromElement(el) {
  const img = el.tagName === 'IMG' ? el : el.querySelector?.('img')
  if (!img?.getAttribute('src')) return null
  const captionEl = el.tagName === 'FIGURE' ? el.querySelector('figcaption') : null
  return createBlock('image', {
    src: img.getAttribute('src') || '',
    alt: img.getAttribute('alt') || '',
    caption: captionEl?.textContent?.trim() || '',
    align: readAlign(el, img)
  })
}

function nodeToBlocks(node) {
  if (!node) return []
  if (node.nodeType === 3) {
    const text = node.textContent?.trim()
    return text ? [createBlock('text', { html: `<p>${escapeHtml(text)}</p>` })] : []
  }
  if (node.nodeType !== 1) return []

  const el = node
  const marked = el.getAttribute('data-blog-block')
  const tag = el.tagName

  if (marked === 'heading' || /^H[1-6]$/.test(tag)) {
    const text = el.textContent || ''
    if (!text.trim()) return []
    return [createBlock('heading', { level: headingLevel(el.getAttribute('data-level') || tag), text: text.trim() })]
  }

  if (marked === 'image' || tag === 'FIGURE' || tag === 'IMG') {
    const block = imageFromElement(el)
    return block ? [block] : []
  }

  if (marked === 'quote' || tag === 'BLOCKQUOTE') {
    const html = el.innerHTML.trim()
    return html ? [createBlock('quote', { html })] : []
  }

  if (marked === 'divider' || tag === 'HR') {
    return [createBlock('divider')]
  }

  if (marked === 'text') {
    if (isBlankHtml(el.innerHTML)) return []
    return [createBlock('text', { html: el.innerHTML })]
  }

  const onlyImg = el.children.length === 1 && (el.children[0].tagName === 'IMG' || el.children[0].tagName === 'FIGURE')
  const textWithoutImg = (el.textContent || '').replace(/\s+/g, ' ').trim()
  if (el.querySelector?.('img') && (onlyImg || !textWithoutImg)) {
    const block = imageFromElement(el)
    return block ? [block] : []
  }

  if (el.querySelector?.('img')) {
    const out = []
    const kids = [...el.childNodes]
    let buffer = []
    const flush = () => {
      if (!buffer.length) return
      const wrap = el.ownerDocument.createElement(tag === 'P' ? 'p' : 'div')
      buffer.forEach((child) => wrap.appendChild(child.cloneNode(true)))
      if (!isBlankHtml(wrap.innerHTML)) out.push(createBlock('text', { html: wrap.outerHTML }))
      buffer = []
    }
    kids.forEach((child) => {
      if (child.nodeType === 1 && (child.tagName === 'IMG' || child.tagName === 'FIGURE' || child.querySelector?.('img'))) {
        flush()
        const imgBlock = imageFromElement(child)
        if (imgBlock) out.push(imgBlock)
        else out.push(...nodeToBlocks(child))
      } else {
        buffer.push(child)
      }
    })
    flush()
    return out
  }

  const html = el.outerHTML
  return isBlankHtml(html) ? [] : [createBlock('text', { html })]
}

export function htmlToBlocks(raw) {
  const html = String(raw || '').trim()
  if (!html) return [createBlock('text')]

  let inner = html
  const body = inner.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (body) inner = body[1]

  const doc = new DOMParser().parseFromString(`<div id="blog-root">${inner}</div>`, 'text/html')
  const root = doc.getElementById('blog-root')
  if (!root) return [createBlock('text')]

  const blocks = []
  Array.from(root.childNodes).forEach((node) => {
    blocks.push(...nodeToBlocks(node))
  })

  return blocks.length ? blocks : [createBlock('text')]
}

function blockToHtml(block) {
  if (!block) return ''
  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(2, Number(block.level) || 2))
      const text = (block.text || '').trim()
      if (!text) return ''
      return `<h${level} data-blog-block="heading">${escapeHtml(text)}</h${level}>`
    }
    case 'text': {
      const html = String(block.html || '').trim()
      if (isBlankHtml(html)) return ''
      return `<div data-blog-block="text">${html}</div>`
    }
    case 'image': {
      if (!block.src) return ''
      const align = ['wide', 'left', 'right', 'center', 'full'].includes(block.align) ? block.align : 'center'
      const caption = (block.caption || '').trim()
      const capHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''
      return `<figure data-blog-block="image" class="pj-blog-inline-figure" data-align="${align}"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt || '')}">${capHtml}</figure>`
    }
    case 'quote': {
      const html = String(block.html || '').trim()
      if (isBlankHtml(html)) return ''
      return `<blockquote data-blog-block="quote">${html}</blockquote>`
    }
    case 'divider':
      return '<hr data-blog-block="divider">'
    default:
      return ''
  }
}

export function blocksToHtml(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map(blockToHtml).filter(Boolean).join('\n')
}

export function sanitizeFragment(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return ''
  root.querySelectorAll('script,style,iframe,object,embed').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (/^on/i.test(attr.name) || (attr.name === 'href' && /^\s*javascript:/i.test(attr.value))) {
        el.removeAttribute(attr.name)
      }
    })
  })
  return root.innerHTML
}
