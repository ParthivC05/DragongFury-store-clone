import { SCHEMA_TYPES, buildManagedSchema, parseCustomSchema } from '../utils/pageSchema'

const FIELD_LABELS = {
  name: 'Name',
  description: 'Description',
  url: 'URL',
  image: 'Image',
  author: 'Author',
  logo: 'Logo',
  datePublished: 'Published date',
  dateModified: 'Updated date'
}

function fieldsFor(type) {
  if (type === 'BlogPosting') return ['name', 'description', 'url', 'image', 'author', 'datePublished', 'dateModified']
  if (type === 'Organization') return ['name', 'url', 'logo', 'description']
  if (type === 'WebPage') return ['name', 'description', 'url']
  return []
}

function shownValue(fields, auto, key) {
  const saved = fields?.[key]
  if (saved != null && String(saved).trim() !== '') return String(saved)
  return auto?.[key] || ''
}

export function SchemaEditor({ value, onChange, auto, defaultType = 'WebPage' }) {
  const type = value.schemaType || defaultType
  const fields = value.schemaFields || {}
  const enabled = value.schemaEnabled !== false
  let preview = ''
  let previewError = ''
  if (!enabled) {
    preview = 'Schema is off for this page. The sitewide Organization and WebSite blocks stay.'
  } else {
    try {
      const schema = buildManagedSchema({
        enabled,
        type,
        fields,
        custom: value.schemaCustom,
        auto
      })
      preview = schema ? JSON.stringify(schema, null, 2) : 'Nothing to publish for this schema type yet.'
    } catch (err) {
      previewError = err.message || 'Schema JSON-LD is not valid JSON.'
    }
  }

  const setField = (key, nextValue) => {
    const next = { ...fields }
    const automatic = String(auto?.[key] || '').trim()
    if (!String(nextValue).trim() || String(nextValue).trim() === automatic) delete next[key]
    else next[key] = nextValue
    onChange({ schemaFields: next })
  }

  const crumbs = Array.isArray(fields.breadcrumbs) && fields.breadcrumbs.length
    ? fields.breadcrumbs
    : (auto?.breadcrumbs || [])

  return (
    <div className="blog-admin-seo">
      <p className="blog-admin-seo-title">Schema</p>
      <p className="blog-admin-seo-desc">
        Controls the JSON-LD block for this page. Basic details fill from the page. Change a field only when it should differ.
      </p>
      <label className="blog-admin-field-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange({ schemaEnabled: e.target.checked })}
        />
        <span>Enable schema</span>
      </label>
      {enabled && (
        <>
          <label className="blog-admin-field">
            <span>Schema type</span>
            <select value={type} onChange={(e) => onChange({ schemaType: e.target.value })}>
              {SCHEMA_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          {fieldsFor(type).map((key) => (
            <label className="blog-admin-field" key={key}>
              <span>{type === 'BlogPosting' && key === 'name' ? 'Headline' : FIELD_LABELS[key]}</span>
              {key === 'description' ? (
                <textarea
                  rows={3}
                  value={shownValue(fields, auto, key)}
                  onChange={(e) => setField(key, e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  value={shownValue(fields, auto, key)}
                  onChange={(e) => setField(key, e.target.value)}
                />
              )}
            </label>
          ))}
          {type === 'Breadcrumb' && (
            <div className="blog-admin-field">
              <span>Breadcrumb steps</span>
              {crumbs.map((crumb, index) => (
                <div className="blog-schema-crumb" key={`${crumb.url}-${index}`}>
                  <input
                    type="text"
                    value={crumb.name || ''}
                    placeholder="Name"
                    onChange={(e) => {
                      const next = crumbs.map((item, i) => (i === index ? { ...item, name: e.target.value } : item))
                      onChange({ schemaFields: { ...fields, breadcrumbs: next } })
                    }}
                  />
                  <input
                    type="text"
                    value={crumb.url || ''}
                    placeholder="https://dragonfury.casino/"
                    onChange={(e) => {
                      const next = crumbs.map((item, i) => (i === index ? { ...item, url: e.target.value } : item))
                      onChange({ schemaFields: { ...fields, breadcrumbs: next } })
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => onChange({
                  schemaFields: {
                    ...fields,
                    breadcrumbs: [...crumbs, { name: '', url: '' }]
                  }
                })}
              >
                Add step
              </button>
            </div>
          )}
          {type === 'Custom' && (
            <label className="blog-admin-field">
              <span>Custom JSON-LD</span>
              <textarea
                rows={10}
                value={value.schemaCustom || ''}
                placeholder='{"@context":"https://schema.org","@type":"WebPage"}'
                onChange={(e) => onChange({ schemaCustom: e.target.value })}
              />
              <span className="blog-admin-hint">Paste one JSON-LD object, or the full script tag.</span>
            </label>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => onChange({ schemaFields: {}, schemaCustom: '' })}
          >
            Reset to automatic
          </button>
        </>
      )}
      <div className="blog-admin-field">
        <span>Schema preview</span>
        {previewError ? (
          <p className="blog-schema-error">{previewError}</p>
        ) : (
          <pre className="blog-schema-preview">{preview}</pre>
        )}
      </div>
    </div>
  )
}

export function schemaErrorFor(value, auto) {
  if (value?.schemaEnabled === false) return ''
  if ((value?.schemaType || 'WebPage') !== 'Custom') return ''
  try {
    parseCustomSchema(value.schemaCustom)
    buildManagedSchema({
      enabled: true,
      type: 'Custom',
      fields: value.schemaFields,
      custom: value.schemaCustom,
      auto
    })
    return ''
  } catch (err) {
    return err.message || 'Schema JSON-LD is not valid JSON.'
  }
}
