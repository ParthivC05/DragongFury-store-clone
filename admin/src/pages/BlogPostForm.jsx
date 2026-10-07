import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createAdminBlogPost,
  getAdminBlogPost,
  updateAdminBlogPost,
  getStores,
  uploadAdminBlogImage
} from '../api/admin'
import { BlogContentEditor } from '../components/BlogContentEditor'
import { SeoMetaFields } from '../components/SeoMetaFields'
import { SchemaEditor, schemaErrorFor } from '../components/SchemaEditor'
import { PermanentRedirectField } from '../components/RecordActivity'
import { blogSchemaAuto } from '../utils/pageSchema'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { ADMIN_FEATURE_KEYS, filterStoreCodesByAdminScope } from '../constants/permissions'
import './BlogPosts.css'

const COVER_WIDTH = 2172
const COVER_HEIGHT = 724

function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(size)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that picture.'))
    }
    img.src = url
  })
}

const EMPTY = {
  title: '',
  slug: '',
  category: '',
  titleImage: '',
  content: '',
  metaTitle: '',
  metaDescription: '',
  metaTags: '',
  canonicalUrl: '',
  permanentRedirect: '',
  allowIndex: true,
  isActive: true,
  storeCode: '',
  schemaEnabled: true,
  schemaType: 'BlogPosting',
  schemaFields: {},
  schemaCustom: '',
  createdAt: '',
  updatedAt: ''
}

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export default function BlogPostForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [form, setForm] = useState(() => ({
    ...EMPTY,
    storeCode: isMaster ? 'dragonfury' : (user?.storeCode || '')
  }))
  const [slugTouched, setSlugTouched] = useState(isEdit)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [storeOptions, setStoreOptions] = useState([])

  useEffect(() => {
    if (!isMaster) return
    getStores({ limit: 200 })
      .then((res) => {
        const rows = res.list || res.stores || res.items || []
        const codes = [...new Set(
          rows
            .map((s) => s.storeCode || s.store_code)
            .filter(Boolean)
            .map((code) => String(code))
        )].sort((a, b) => a.localeCompare(b))
        const scoped = filterStoreCodesByAdminScope(codes, user?.adminPermissions, ADMIN_FEATURE_KEYS.BLOG_POSTS)
        setStoreOptions(scoped)
        setForm((prev) => {
          if (prev.storeCode && scoped.some((c) => c.toLowerCase() === String(prev.storeCode).toLowerCase())) {
            return prev
          }
          if (isEdit) return prev
          const preferred = scoped.find((c) => String(c).toLowerCase() === 'dragonfury')
          return { ...prev, storeCode: preferred || scoped[0] || '' }
        })
      })
      .catch(() => setStoreOptions([]))
  }, [isMaster, user, isEdit])

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    getAdminBlogPost(id)
      .then((res) => {
        const post = res.blog_post || {}
        setForm({
          title: post.title || '',
          slug: post.slug || '',
          category: post.category || '',
          titleImage: post.titleImage || '',
          content: post.content || '',
          metaTitle: post.metaTitle || '',
          metaDescription: post.metaDescription || '',
          metaTags: post.metaTags || '',
          canonicalUrl: post.canonicalUrl || '',
          permanentRedirect: post.permanentRedirect || '',
          allowIndex: post.allowIndex !== false,
          isActive: post.isActive !== false,
          storeCode: post.storeCode || '',
          schemaEnabled: post.schemaEnabled !== false,
          schemaType: post.schemaType || 'BlogPosting',
          schemaFields: post.schemaFields || {},
          schemaCustom: post.schemaCustom || '',
          createdAt: post.createdAt || '',
          updatedAt: post.updatedAt || ''
        })
        setSlugTouched(true)
      })
      .catch((err) => {
        toast.error(err.message || 'Could not open this blog post.')
        navigate('/blog')
      })
      .finally(() => setLoading(false))
  }, [id, isEdit, navigate, toast])

  const setField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'title' && !slugTouched) next.slug = slugify(value)
      return next
    })
  }

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { width, height } = await readImageSize(file)
      if (width !== COVER_WIDTH || height !== COVER_HEIGHT) {
        toast.error(`Use a picture that is exactly ${COVER_WIDTH} × ${COVER_HEIGHT} pixels. This one is ${width} × ${height}.`)
        return
      }
    } catch (err) {
      toast.error(err.message || 'Could not read that picture.')
      return
    }
    setUploadingCover(true)
    try {
      const res = await uploadAdminBlogImage(file)
      const url = res?.url
      if (!url) throw new Error('Could not add that picture.')
      setField('titleImage', url)
      toast.success('Picture added.')
    } catch (err) {
      toast.error(err.message || 'Could not add that picture. Try another one.')
    } finally {
      setUploadingCover(false)
    }
  }

  const handleContentImageUpload = async (file) => {
    const res = await uploadAdminBlogImage(file)
    const url = res?.url
    if (!url) throw new Error('Could not add that picture.')
    return url
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Type a title first.')
      return
    }
    const slug = form.slug.trim() || slugify(form.title)
    if (!slug) {
      toast.error('Type a title first.')
      return
    }
    if (!form.titleImage.trim()) {
      toast.error('Add a big picture at the top first.')
      return
    }
    if (isMaster && !form.storeCode.trim()) {
      toast.error('Pick which website this post is for.')
      return
    }
    const schemaPost = String(form.storeCode || '').trim().toLowerCase() === 'dragonfury'
    if (schemaPost) {
      const schemaError = schemaErrorFor(form, blogSchemaAuto(form))
      if (schemaError) {
        toast.error(schemaError)
        return
      }
    }

    setSaving(true)
    const body = {
      title: form.title.trim(),
      slug,
      category: form.category.trim() || null,
      titleImage: form.titleImage.trim(),
      content: form.content || '',
      metaTitle: form.metaTitle.trim() || null,
      metaDescription: form.metaDescription.trim() || null,
      metaTags: form.metaTags.trim() || null,
      canonicalUrl: form.canonicalUrl.trim() || null,
      permanentRedirect: form.permanentRedirect.trim(),
      allowIndex: form.allowIndex !== false,
      isActive: Boolean(form.isActive)
    }
    if (isMaster) body.storeCode = form.storeCode.trim()
    if (String(form.storeCode || '').trim().toLowerCase() === 'dragonfury') {
      body.schemaEnabled = form.schemaEnabled !== false
      body.schemaType = form.schemaType || 'BlogPosting'
      body.schemaFields = form.schemaFields || {}
      body.schemaCustom = form.schemaCustom || ''
    }

    try {
      if (isEdit) {
        await updateAdminBlogPost(id, body)
        toast.success('Saved!')
      } else {
        await createAdminBlogPost(body)
        toast.success('Your blog post is ready!')
      }
      navigate('/blog')
    } catch (err) {
      toast.error(err.message || 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="blog-admin-page"><p>Loading…</p></div>
  }

  return (
    <div className="blog-admin-page blog-admin-form-page blog-easy">
      <div className="blog-easy-top">
        <div>
          <h2>{isEdit ? 'Change this blog post' : 'Make a blog post'}</h2>
          <p className="blog-admin-intro">Follow the steps. Tap Save when you are done.</p>
        </div>
        <Link to="/blog" className="admin-btn admin-btn-secondary">Go back</Link>
      </div>

      <form className="blog-easy-form" onSubmit={handleSubmit}>
        <details className="blog-easy-extra">
          <summary>Extra settings</summary>
          <label className="blog-admin-field">
            <span>Web address name</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true)
                setField('slug', e.target.value)
              }}
              pattern="[a-zA-Z0-9\-]*"
              placeholder="made-from-the-title"
            />
            <span className="blog-admin-hint">Leave this alone unless you know what it is.</span>
          </label>
        </details>

        {isMaster && (
          <section className="blog-easy-step">
            <p className="blog-easy-num">1</p>
            <div className="blog-easy-step-body">
              <label className="blog-admin-field">
                <span>Which website?</span>
                <select
                  value={form.storeCode}
                  onChange={(e) => setField('storeCode', e.target.value)}
                  required
                >
                  <option value="">Pick one</option>
                  {storeOptions.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}

        <section className="blog-easy-step">
          <p className="blog-easy-num">{isMaster ? '2' : '1'}</p>
          <div className="blog-easy-step-body">
            <label className="blog-admin-field">
              <span>Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                required
                maxLength={512}
                placeholder="Type the name of your post"
              />
            </label>
            <label className="blog-admin-field">
              <span>Topic <em>(optional)</em></span>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                placeholder="News, Guides, Tips…"
                maxLength={128}
              />
            </label>
          </div>
        </section>

        <section className="blog-easy-step">
          <p className="blog-easy-num">{isMaster ? '3' : '2'}</p>
          <div className="blog-easy-step-body">
            <SeoMetaFields form={form} setField={setField} showIndexControl showCanonical indexNoun="post" indexControlName="blog-google-index" />
            <PermanentRedirectField
              value={form.permanentRedirect}
              onChange={(value) => setField('permanentRedirect', value)}
            />
          </div>
        </section>

        {String(form.storeCode || '').trim().toLowerCase() === 'dragonfury' && (
          <section className="blog-easy-step">
            <p className="blog-easy-num">{isMaster ? '4' : '3'}</p>
            <div className="blog-easy-step-body">
              <SchemaEditor
                value={form}
                auto={blogSchemaAuto(form)}
                defaultType="BlogPosting"
                onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
              />
            </div>
          </section>
        )}

        <section className="blog-easy-step">
          <p className="blog-easy-num">{(isMaster ? 4 : 3) + (String(form.storeCode || '').trim().toLowerCase() === 'dragonfury' ? 1 : 0)}</p>
          <div className="blog-easy-step-body">
            <span className="blog-easy-label">Add a big picture</span>
            <p className="blog-easy-help">This picture shows at the top of the post. It must be exactly 2172 × 724 pixels.</p>
            <label className={`blog-easy-cover${form.titleImage ? ' has-pic' : ''}`}>
              {form.titleImage ? (
                <img src={form.titleImage} alt="Cover" />
              ) : (
                <span>{uploadingCover ? 'Adding picture…' : 'Tap here to pick a picture'}</span>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                hidden
                disabled={uploadingCover || saving}
                onChange={handleCoverUpload}
              />
            </label>
            {form.titleImage && (
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                disabled={uploadingCover || saving}
                onClick={() => setField('titleImage', '')}
              >
                Remove picture
              </button>
            )}
          </div>
        </section>

        <section className="blog-easy-step">
          <p className="blog-easy-num">{(isMaster ? 5 : 4) + (String(form.storeCode || '').trim().toLowerCase() === 'dragonfury' ? 1 : 0)}</p>
          <div className="blog-easy-step-body">
            <span className="blog-easy-label">Write the post</span>
            <p className="blog-easy-help">Easy uses boxes. Switch to Visual editor, HTML editor, or Preview anytime.</p>
            <BlogContentEditor
              value={form.content}
              onChange={(html) => setField('content', html)}
              onUploadImage={handleContentImageUpload}
              minHeight="280px"
            />
          </div>
        </section>

        <section className="blog-easy-step">
          <p className="blog-easy-num">{(isMaster ? 6 : 5) + (String(form.storeCode || '').trim().toLowerCase() === 'dragonfury' ? 1 : 0)}</p>
          <div className="blog-easy-step-body">
            <span className="blog-easy-label">Show it on the website?</span>
            <div className="blog-easy-yesno">
              <button
                type="button"
                className={`blog-easy-choice${form.isActive ? ' is-on' : ''}`}
                onClick={() => setField('isActive', true)}
              >
                Yes, show it
              </button>
              <button
                type="button"
                className={`blog-easy-choice${!form.isActive ? ' is-on' : ''}`}
                onClick={() => setField('isActive', false)}
              >
                No, hide it
              </button>
            </div>
          </div>
        </section>

        <div className="blog-easy-save">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => navigate('/blog')}>
            Cancel
          </button>
          <button type="submit" className="admin-btn admin-btn-primary blog-easy-save-btn" disabled={saving || uploadingCover}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
