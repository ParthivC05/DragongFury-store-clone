export const SCHEMA_TYPES = [
  { value: 'WebPage', label: 'WebPage' },
  { value: 'BlogPosting', label: 'Article / BlogPosting' },
  { value: 'Organization', label: 'Organization' },
  { value: 'Breadcrumb', label: 'Breadcrumb' },
  { value: 'Custom', label: 'Custom Schema' }
]

export const PLAYJUWA_ORIGIN = 'https://dragonfury.casino'

function clean(value) {
  return value == null ? '' : String(value).trim()
}

function prefer(saved, auto) {
  const next = clean(saved)
  return next || clean(auto)
}

export function parseCustomSchema(raw) {
  let text = clean(raw)
  if (!text) throw new Error('Paste the JSON-LD schema.')
  const wrapped = text.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
  if (wrapped) text = wrapped[1].trim()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Schema JSON-LD is not valid JSON.')
  }
  if (!data || typeof data !== 'object') throw new Error('Schema JSON-LD must be a JSON object.')
  if (!Array.isArray(data) && !data['@context']) data['@context'] = 'https://schema.org'
  return data
}

function breadcrumbSchema(crumbs) {
  const list = (Array.isArray(crumbs) ? crumbs : [])
    .map((item) => ({ name: clean(item?.name), item: clean(item?.url || item?.item) }))
    .filter((item) => item.name && item.item)
  if (!list.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.item
    }))
  }
}

export function buildManagedSchema({ enabled, type, fields, custom, auto }) {
  if (enabled === false) return null
  const kind = SCHEMA_TYPES.some((item) => item.value === type) ? type : 'WebPage'
  if (kind === 'Custom') return parseCustomSchema(custom)
  const saved = fields && typeof fields === 'object' ? fields : {}
  const source = auto || {}
  const name = prefer(saved.name, source.name)
  const description = prefer(saved.description, source.description)
  const url = prefer(saved.url, source.url)
  const image = prefer(saved.image, source.image)
  const author = prefer(saved.author, source.author)
  const logo = prefer(saved.logo, source.logo)
  const datePublished = prefer(saved.datePublished, source.datePublished)
  const dateModified = prefer(saved.dateModified, source.dateModified)

  if (kind === 'WebPage') {
    const schema = { '@context': 'https://schema.org', '@type': 'WebPage' }
    if (name) schema.name = name
    if (description) schema.description = description
    if (url) schema.url = url
    return schema
  }
  if (kind === 'BlogPosting') {
    const schema = { '@context': 'https://schema.org', '@type': 'BlogPosting' }
    if (name) schema.headline = name
    if (description) schema.description = description
    if (url) schema.mainEntityOfPage = url
    if (image) schema.image = image
    if (datePublished) schema.datePublished = datePublished
    if (dateModified) schema.dateModified = dateModified
    if (author) {
      schema.author = { '@type': 'Organization', name: author }
      schema.publisher = { '@type': 'Organization', name: author }
    }
    return schema
  }
  if (kind === 'Organization') {
    const schema = { '@context': 'https://schema.org', '@type': 'Organization' }
    if (name) schema.name = name
    if (url) schema.url = url
    if (logo) schema.logo = logo
    if (description) schema.description = description
    return schema
  }
  const customCrumbs = Array.isArray(saved.breadcrumbs) && saved.breadcrumbs.length
    ? saved.breadcrumbs
    : source.breadcrumbs
  return breadcrumbSchema(customCrumbs)
}

export function blogSchemaAuto(form) {
  const slug = clean(form.slug) || 'post'
  const ownUrl = `${PLAYJUWA_ORIGIN}/blog/${slug}`
  const url = clean(form.canonicalUrl) || ownUrl
  const title = clean(form.title)
  return {
    name: clean(form.metaTitle) || title,
    description: clean(form.metaDescription),
    url,
    image: clean(form.titleImage),
    author: 'dragonfury.casino',
    logo: `${PLAYJUWA_ORIGIN}/logo.png`,
    datePublished: clean(form.createdAt),
    dateModified: clean(form.updatedAt) || clean(form.createdAt),
    breadcrumbs: [
      { name: 'Home', url: `${PLAYJUWA_ORIGIN}/` },
      { name: 'Blog', url: `${PLAYJUWA_ORIGIN}/blog` },
      { name: title || 'Post', url }
    ]
  }
}

export function homeSchemaAuto() {
  const url = `${PLAYJUWA_ORIGIN}/`
  return {
    name: 'dragonfury.casino | USA Sweepstakes Casino Games & Bonuses',
    description: 'Play sweepstakes casino games online with dragonfury.casino. Explore platforms, fish games, bonuses, and secure play across the USA.',
    url,
    image: '',
    author: 'dragonfury.casino',
    logo: `${PLAYJUWA_ORIGIN}/logo.png`,
    breadcrumbs: [{ name: 'Home', url }]
  }
}

const STORE_ORIGINS = {
  playjuwa: 'https://playjuwa.com',
  dragonfury: 'https://dragonfury.casino',
  winners4: 'https://winners4.com',
  sweepstakebet: 'https://sweepstakebet.com',
  myvepower: 'https://myvepower.com',
  casinoslots: 'https://casinoslots.casino',
  goodgdragon: 'https://goodgdragon.com',
  goodwork: 'https://luckywinnerspower.com',
  grandsweeps: 'https://grandsweep.xyz',
  betgamezone: 'https://betgamezone.com'
}

export function originForStore(storeCode) {
  const code = String(storeCode || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  return STORE_ORIGINS[code] || PLAYJUWA_ORIGIN
}

function hostOf(origin) {
  return String(origin || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export function footerSchemaAuto(form, origin = PLAYJUWA_ORIGIN) {
  const base = String(origin || PLAYJUWA_ORIGIN).replace(/\/$/, '')
  const slug = clean(form?.slug) || 'page'
  const url = `${base}/${slug}`
  const title = clean(form?.title)
  return {
    name: clean(form?.metaTitle) || title,
    description: clean(form?.metaDescription),
    url,
    image: '',
    author: hostOf(base),
    logo: `${base}/logo.png`,
    datePublished: clean(form?.createdAt),
    dateModified: clean(form?.updatedAt) || clean(form?.createdAt),
    breadcrumbs: [
      { name: 'Home', url: `${base}/` },
      { name: title || 'Page', url }
    ]
  }
}

export function gameSchemaAuto(form, origin = PLAYJUWA_ORIGIN) {
  const base = String(origin || PLAYJUWA_ORIGIN).replace(/\/$/, '')
  const slug = clean(form?.slug) || 'game'
  const ownUrl = `${base}/games/${slug}`
  const url = clean(form?.canonicalUrl) || ownUrl
  const title = clean(form?.name || form?.title)
  return {
    name: clean(form?.metaTitle) || title,
    description: clean(form?.metaDescription) || clean(form?.heroLead),
    url,
    image: clean(form?.imageUrl) || clean(form?.defaultImage),
    author: hostOf(base),
    logo: `${base}/logo.png`,
    datePublished: clean(form?.createdAt),
    dateModified: clean(form?.updatedAt) || clean(form?.createdAt),
    breadcrumbs: [
      { name: 'Home', url: `${base}/` },
      { name: 'Games', url: `${base}/games` },
      { name: title || 'Game', url }
    ]
  }
}
