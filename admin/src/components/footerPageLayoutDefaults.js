function newId() {
  return `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function emptyBlock(overrides = {}) {
  return {
    id: newId(),
    title: '',
    body: '',
    links: [],
    imageUrl: '',
    imageAlt: '',
    imagePosition: 'right',
    showButton: false,
    buttonText: 'DEPOSIT NOW',
    buttonUrl: '',
    ...overrides
  }
}

export function emptyHero(overrides = {}) {
  const block = emptyBlock(overrides)
  delete block.id
  return block
}

export function emptySections() {
  return { hero: emptyHero(), blocks: [] }
}

export function layoutHasContent(sections) {
  const hero = sections?.hero || {}
  const blocks = Array.isArray(sections?.blocks) ? sections.blocks : []
  const filled = (b) => Boolean(
    String(b?.title || '').trim()
    || String(b?.body || '').trim()
    || String(b?.imageUrl || '').trim()
    || b?.showButton
  )
  return filled(hero) || blocks.some(filled)
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paragraphsHtml(body, links) {
  const chunks = String(body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (!chunks.length) return ''
  const valid = (Array.isArray(links) ? links : []).filter((l) => l?.text && l?.url)
  return chunks.map((chunk) => {
    let html = escapeHtml(chunk).replace(/\n/g, '<br />')
    valid.forEach((link) => {
      const needle = escapeHtml(link.text)
      if (!needle) return
      html = html.replace(
        needle,
        `<a href="${escapeHtml(link.url)}">${needle}</a>`
      )
    })
    return `<p>${html}</p>`
  }).join('')
}

export function sectionsToHtml(sections) {
  if (!layoutHasContent(sections)) return ''
  const parts = []
  const hero = sections.hero || {}
  if (hero.title || hero.body || hero.imageUrl || hero.showButton) {
    const title = hero.title ? `<h1 class="pj-fp-hero-title">${escapeHtml(hero.title)}</h1>` : ''
    const img = hero.imageUrl ? `<div class="pj-fp-media"><img src="${escapeHtml(hero.imageUrl)}" alt="${escapeHtml(hero.imageAlt || '')}" /></div>` : ''
    const body = paragraphsHtml(hero.body, hero.links)
    const btn = hero.showButton && hero.buttonUrl
      ? `<p><a class="pj-fp-cta" href="${escapeHtml(hero.buttonUrl)}">${escapeHtml(hero.buttonText || 'DEPOSIT NOW')}</a></p>`
      : ''
    parts.push(`<section class="pj-fp-hero">${title}<div class="pj-fp-split">${body ? `<div class="pj-fp-copy">${body}</div>` : ''}${img}${btn}</div></section>`)
  }
  const blocks = Array.isArray(sections.blocks) ? sections.blocks : []
  blocks.forEach((block) => {
    if (!block?.title && !block?.body && !block?.imageUrl && !block?.showButton) return
    const title = block.title ? `<h2 class="pj-fp-section-title">${escapeHtml(block.title)}</h2>` : ''
    const body = paragraphsHtml(block.body, block.links)
    const img = block.imageUrl ? `<div class="pj-fp-media"><img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.imageAlt || '')}" /></div>` : ''
    const btn = block.showButton && block.buttonUrl
      ? `<p><a class="pj-fp-cta" href="${escapeHtml(block.buttonUrl)}">${escapeHtml(block.buttonText || 'DEPOSIT NOW')}</a></p>`
      : ''
    parts.push(`<section class="pj-fp-card"><div class="pj-fp-split">${title || body || btn ? `<div class="pj-fp-copy">${title}${body}${btn}</div>` : ''}${img}</div></section>`)
  })
  return `<div class="pj-fp-layout">${parts.join('\n')}</div>`
}

export { newId }
