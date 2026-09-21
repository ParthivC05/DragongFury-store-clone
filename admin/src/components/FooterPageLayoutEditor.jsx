import { useRef, useState } from 'react'
import { uploadAdminFooterImage } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { emptyBlock, emptyHero, newId } from './footerPageLayoutDefaults'
import './FooterPageLayoutEditor.css'

function normalizeIncoming(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const heroSrc = src.hero || {}
  const blocksSrc = Array.isArray(src.blocks) ? src.blocks : []
  return {
    hero: emptyHero({
      title: heroSrc.title || '',
      body: heroSrc.body || '',
      links: Array.isArray(heroSrc.links) ? heroSrc.links.map((l) => ({ text: l.text || '', url: l.url || '' })) : [],
      imageUrl: heroSrc.imageUrl || '',
      imageAlt: heroSrc.imageAlt || '',
      imagePosition: heroSrc.imagePosition === 'left' ? 'left' : 'right',
      showButton: heroSrc.showButton === true,
      buttonText: typeof heroSrc.buttonText === 'string' ? heroSrc.buttonText : 'DEPOSIT NOW',
      buttonUrl: heroSrc.buttonUrl || ''
    }),
    blocks: blocksSrc.map((b) => emptyBlock({
      id: b.id || newId(),
      title: b.title || '',
      body: b.body || '',
      links: Array.isArray(b.links) ? b.links.map((l) => ({ text: l.text || '', url: l.url || '' })) : [],
      imageUrl: b.imageUrl || '',
      imageAlt: b.imageAlt || '',
      imagePosition: b.imagePosition === 'left' ? 'left' : 'right',
      showButton: b.showButton === true,
      buttonText: typeof b.buttonText === 'string' ? b.buttonText : 'DEPOSIT NOW',
      buttonUrl: b.buttonUrl || ''
    }))
  }
}

function ImageField({ value, alt, onChange, onAltChange, uploadingKey, setUploadingKey, fieldKey }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const uploading = uploadingKey === fieldKey

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingKey(fieldKey)
    try {
      const res = await uploadAdminFooterImage(file)
      const url = res?.url
      if (!url) throw new Error('Upload failed.')
      onChange(url)
      toast.success('Image uploaded.')
    } catch (err) {
      toast.error(err.message || 'Image upload failed.')
    } finally {
      setUploadingKey('')
    }
  }

  return (
    <div className="fpl-image">
      {value ? (
        <div className="fpl-image-preview">
          <img src={value} alt="" />
        </div>
      ) : (
        <div className="fpl-image-empty">No photo yet</div>
      )}
      <div className="fpl-image-actions">
        <button
          type="button"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : (value ? 'Change photo' : 'Add photo')}
        </button>
        {value ? (
          <button
            type="button"
            className="admin-btn admin-btn-danger admin-btn-sm"
            disabled={uploading}
            onClick={() => onChange('')}
          >
            Remove
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          hidden
          onChange={handleFile}
        />
      </div>
      <details className="fpl-extras">
        <summary>Photo description (optional)</summary>
        <label className="blog-admin-field">
          <span>Alt text</span>
          <input
            type="text"
            value={alt || ''}
            onChange={(e) => onAltChange(e.target.value)}
            placeholder="Short description of the photo"
          />
        </label>
      </details>
    </div>
  )
}

function LinksEditor({ links, onChange }) {
  const rows = Array.isArray(links) ? links : []
  const hasRows = rows.length > 0

  const update = (index, patch) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const [linksOpen, setLinksOpen] = useState(hasRows)

  return (
    <details
      className="fpl-extras"
      open={linksOpen}
      onToggle={(e) => setLinksOpen(e.currentTarget.open)}
    >
      <summary>Turn words into links {hasRows ? `(${rows.length})` : ''}</summary>
      <p className="blog-admin-hint">
        Type the exact words from the text, then paste where they should go (e.g. /help).
      </p>
      <div className="fpl-links-head">
        <button
          type="button"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => onChange([...rows, { text: '', url: '' }])}
        >
          Add a link
        </button>
      </div>
      {hasRows ? (
        <div className="fpl-links-list">
          {rows.map((row, index) => (
            <div className="fpl-link-row" key={`link-${index}`}>
              <input
                type="text"
                value={row.text || ''}
                onChange={(e) => update(index, { text: e.target.value })}
                placeholder="Words in the text"
              />
              <input
                type="text"
                value={row.url || ''}
                onChange={(e) => update(index, { url: e.target.value })}
                placeholder="/page or https://…"
              />
              <button
                type="button"
                className="admin-btn admin-btn-danger admin-btn-sm"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </details>
  )
}

function BlockFields({
  block,
  onChange,
  namePrefix,
  showTitle,
  titleLabel,
  uploadingKey,
  setUploadingKey
}) {
  const set = (patch) => onChange({ ...block, ...patch })

  return (
    <div className="fpl-block-fields">
      {showTitle ? (
        <label className="blog-admin-field">
          <span>{titleLabel}</span>
          <input
            type="text"
            value={block.title || ''}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Section heading"
          />
        </label>
      ) : null}

      <label className="blog-admin-field">
        <span>Text</span>
        <textarea
          value={block.body || ''}
          onChange={(e) => set({ body: e.target.value })}
          rows={5}
          placeholder="Write the page text. Leave a blank line between paragraphs."
        />
      </label>

      <div className="fpl-place-picks" role="group" aria-label="Photo side">
        <span className="fpl-place-label">Photo side</span>
        <button
          type="button"
          className={`fpl-place-btn${block.imagePosition === 'left' ? ' is-on' : ''}`}
          onClick={() => set({ imagePosition: 'left' })}
        >
          Left
        </button>
        <button
          type="button"
          className={`fpl-place-btn${block.imagePosition !== 'left' ? ' is-on' : ''}`}
          onClick={() => set({ imagePosition: 'right' })}
        >
          Right
        </button>
      </div>

      <ImageField
        value={block.imageUrl}
        alt={block.imageAlt}
        onChange={(imageUrl) => set({ imageUrl })}
        onAltChange={(imageAlt) => set({ imageAlt })}
        uploadingKey={uploadingKey}
        setUploadingKey={setUploadingKey}
        fieldKey={namePrefix}
      />

      <label className="blog-admin-field blog-admin-field-toggle">
        <input
          type="checkbox"
          checked={block.showButton === true}
          onChange={(e) => set({ showButton: e.target.checked })}
        />
        <span>Add a button</span>
      </label>
      {block.showButton ? (
        <div className="fpl-button-fields">
          <label className="blog-admin-field">
            <span>Button text</span>
            <input
              type="text"
              value={block.buttonText || ''}
              onChange={(e) => set({ buttonText: e.target.value })}
              placeholder="PLAY NOW"
            />
          </label>
          <label className="blog-admin-field">
            <span>Button goes to</span>
            <input
              type="text"
              value={block.buttonUrl || ''}
              onChange={(e) => set({ buttonUrl: e.target.value })}
              placeholder="/deposit"
              required
            />
          </label>
        </div>
      ) : null}

      <LinksEditor links={block.links} onChange={(links) => set({ links })} />
    </div>
  )
}

export function FooterPageLayoutEditor({ value, onChange, legacyHtml = '' }) {
  const sections = normalizeIncoming(value)
  const [uploadingKey, setUploadingKey] = useState('')
  const [openKey, setOpenKey] = useState('hero')

  const setHero = (hero) => onChange({ ...sections, hero })
  const setBlocks = (blocks) => onChange({ ...sections, blocks })

  const toggle = (key) => setOpenKey((cur) => (cur === key ? '' : key))

  const moveBlock = (index, dir) => {
    const next = [...sections.blocks]
    const dest = index + dir
    if (dest < 0 || dest >= next.length) return
    const [item] = next.splice(index, 1)
    next.splice(dest, 0, item)
    setBlocks(next)
  }

  return (
    <div className="fpl-editor">
      {legacyHtml ? (
        <div className="fpl-legacy-note">
          This page still uses old HTML. Fill in a section below and save to switch to the new layout.
        </div>
      ) : null}

      <section className={`fpl-card${openKey === 'hero' ? ' is-open' : ''}`}>
        <button type="button" className="fpl-card-toggle" onClick={() => toggle('hero')}>
          <div>
            <h3>Top of page</h3>
            <p>{sections.hero.title || 'Heading, intro text, and photo'}</p>
          </div>
          <span>{openKey === 'hero' ? 'Hide' : 'Edit'}</span>
        </button>
        {openKey === 'hero' ? (
          <div className="fpl-card-body">
            <label className="blog-admin-field">
              <span>Heading</span>
              <input
                type="text"
                value={sections.hero.title || ''}
                onChange={(e) => setHero({ ...sections.hero, title: e.target.value })}
                placeholder="e.g. Platform Games"
              />
            </label>
            <BlockFields
              block={sections.hero}
              onChange={setHero}
              namePrefix="hero"
              showTitle={false}
              uploadingKey={uploadingKey}
              setUploadingKey={setUploadingKey}
            />
          </div>
        ) : null}
      </section>

      {sections.blocks.map((block, index) => {
        const key = block.id
        const open = openKey === key
        return (
          <section className={`fpl-card${open ? ' is-open' : ''}`} key={key}>
            <div className="fpl-card-head">
              <button type="button" className="fpl-card-toggle" onClick={() => toggle(key)}>
                <div>
                  <h3>Section {index + 1}</h3>
                  <p>{block.title || 'Heading, text, and photo'}</p>
                </div>
                <span>{open ? 'Hide' : 'Edit'}</span>
              </button>
              <div className="fpl-card-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={index === 0}
                  onClick={() => moveBlock(index, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={index === sections.blocks.length - 1}
                  onClick={() => moveBlock(index, 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-danger admin-btn-sm"
                  onClick={() => setBlocks(sections.blocks.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            </div>
            {open ? (
              <div className="fpl-card-body">
                <BlockFields
                  block={block}
                  onChange={(next) => setBlocks(sections.blocks.map((row, i) => (i === index ? next : row)))}
                  namePrefix={block.id}
                  showTitle
                  titleLabel="Heading"
                  uploadingKey={uploadingKey}
                  setUploadingKey={setUploadingKey}
                />
              </div>
            ) : null}
          </section>
        )
      })}

      <button
        type="button"
        className="fpl-add-section"
        onClick={() => {
          const next = emptyBlock()
          setBlocks([...sections.blocks, next])
          setOpenKey(next.id)
        }}
      >
        + Add another section
      </button>
    </div>
  )
}
