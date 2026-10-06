import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getAdminGameSeoPage, updateAdminGameSeoPage, uploadAdminFooterImage } from '../api/admin'
import { SeoMetaFields } from '../components/SeoMetaFields'
import { FooterPageLayoutEditor } from '../components/FooterPageLayoutEditor'
import { emptySections } from '../components/footerPageLayoutDefaults'
import { useToast } from '../context/ToastContext'
import './BlogPosts.css'
import './FooterPages.css'

export default function GameSeoPageForm() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const storeCode = searchParams.get('storeCode') || 'dragonfury'
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getAdminGameSeoPage(slug, { storeCode })
      .then((res) => {
        const page = res.game_page || {}
        setForm({
          name: page.name || '',
          genre: page.genre || '',
          imageUrl: page.imageUrl || '',
          defaultImage: page.defaultImage || '',
          heroLead: page.heroLead || '',
          heroBlurb: page.heroBlurb || '',
          buttons: Array.isArray(page.buttons) && page.buttons.length
            ? page.buttons
            : [{ label: '', href: '' }],
          sections: page.sections && (page.sections.hero || page.sections.blocks)
            ? page.sections
            : emptySections(),
          metaTitle: page.metaTitle || '',
          metaDescription: page.metaDescription || '',
          metaTags: page.metaTags || '',
          canonicalUrl: page.canonicalUrl || '',
          allowIndex: page.allowIndex !== false,
          isActive: page.isActive !== false
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Could not load this game page.')
        setForm(null)
      })
      .finally(() => setLoading(false))
  }, [slug, storeCode, toast])

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const uploadHero = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadAdminFooterImage(file)
      if (!res?.url) throw new Error('Upload failed.')
      setField('imageUrl', res.url)
      toast.success('Image uploaded.')
    } catch (err) {
      toast.error(err.message || 'Image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    try {
      await updateAdminGameSeoPage(slug, {
        storeCode,
        name: form.name.trim(),
        genre: form.genre.trim(),
        imageUrl: form.imageUrl.trim() || null,
        heroLead: form.heroLead,
        heroBlurb: form.heroBlurb,
        buttons: form.buttons.filter((button) => button.label.trim() && button.href.trim()),
        sections: form.sections,
        metaTitle: form.metaTitle.trim() || null,
        metaDescription: form.metaDescription.trim() || null,
        metaTags: form.metaTags.trim() || null,
        canonicalUrl: form.canonicalUrl.trim() || null,
        allowIndex: form.allowIndex !== false,
        isActive: form.isActive !== false
      })
      toast.success('Game page saved.')
      navigate('/footer')
    } catch (err) {
      toast.error(err.message || 'Could not save this game page.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="blog-admin-page"><p>Loading game page…</p></div>
  if (!form) return <div className="blog-admin-page"><p>Game page not found.</p></div>

  const rawPreview = form.imageUrl || form.defaultImage
  const preview = rawPreview && rawPreview.startsWith('/')
    ? `https://dragonfury.online${rawPreview}`
    : rawPreview

  return (
    <form className="blog-admin-page blog-admin-form-page footer-admin-page footer-form-page" onSubmit={save}>
      <div className="footer-admin-hero">
        <div>
          <p className="footer-admin-hero-sub"><Link to="/footer">← Footer links</Link></p>
          <h2>Edit {form.name || 'game page'}</h2>
          <p className="footer-admin-hero-sub">Dragon Fury page at /games/{slug}</p>
        </div>
        <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="blog-admin-form footer-form-steps">

      <section className="footer-form-panel">
          <label className="blog-admin-field">
            <span>Name</span>
            <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} maxLength={255} required />
          </label>
          <label className="blog-admin-field">
            <span>Label above the title</span>
            <input type="text" value={form.genre} onChange={(e) => setField('genre', e.target.value)} maxLength={128} placeholder="Fish & Slots" />
          </label>
          <label className="blog-admin-field">
            <span>Hero image</span>
            {preview ? <img src={preview} alt="" style={{ display: 'block', width: 140, margin: '0.4rem 0' }} /> : null}
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                uploadHero(file)
              }}
            />
            <span className="blog-admin-hint">
              {form.imageUrl
                ? 'A custom image is set. Remove it to use the default platform image.'
                : 'No custom image. The default platform image is shown.'}
            </span>
            {form.imageUrl ? (
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setField('imageUrl', '')}>
                Use default image
              </button>
            ) : null}
          </label>
          <label className="blog-admin-field">
            <span>Hero text</span>
            <textarea rows={3} value={form.heroLead} onChange={(e) => setField('heroLead', e.target.value)} />
          </label>
          <label className="blog-admin-field">
            <span>Second line</span>
            <textarea rows={2} value={form.heroBlurb} onChange={(e) => setField('heroBlurb', e.target.value)} />
          </label>
          <div className="blog-admin-field">
            <span>Buttons</span>
            {form.buttons.map((button, index) => (
              <div key={index} className="game-seo-button-row">
                <input
                  type="text"
                  value={button.label}
                  placeholder="Button label"
                  onChange={(e) => {
                    const buttons = form.buttons.slice()
                    buttons[index] = { ...button, label: e.target.value }
                    setField('buttons', buttons)
                  }}
                />
                <input
                  type="text"
                  value={button.href}
                  placeholder="/register or https://..."
                  onChange={(e) => {
                    const buttons = form.buttons.slice()
                    buttons[index] = { ...button, href: e.target.value }
                    setField('buttons', buttons)
                  }}
                />
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setField('buttons', form.buttons.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              style={{ marginTop: '0.5rem' }}
              onClick={() => setField('buttons', [...form.buttons, { label: '', href: '' }])}
            >
              Add button
            </button>
            <span className="blog-admin-hint">Use a site path such as /register or /games, or a full https link.</span>
          </div>
          <label className="blog-admin-field-toggle">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => setField('isActive', e.target.checked)}
            />
            <span>Show this game on the games page</span>
          </label>
      </section>

      <FooterPageLayoutEditor
        value={form.sections}
        onChange={(sections) => setField('sections', { blocks: sections.blocks || [] })}
        allowFaq
        hideHero
      />

      <SeoMetaFields
        form={form}
        setField={setField}
        showIndexControl
        showCanonical
        indexNoun="game page"
        indexControlName="game-page-google-index"
      />
      </div>
    </form>
  )
}
