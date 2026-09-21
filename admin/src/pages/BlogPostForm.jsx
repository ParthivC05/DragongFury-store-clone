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
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './BlogPosts.css'

const EMPTY = {
  title: '',
  slug: '',
  category: '',
  titleImage: '',
  content: '',
  metaTitle: '',
  metaDescription: '',
  metaTags: '',
  allowIndex: true,
  isActive: true,
  storeCode: ''
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
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [storeOptions, setStoreOptions] = useState([])

  useEffect(() => {
    if (!isMaster) return
    getStores({ limit: 200 })
      .then((res) => {
        const rows = res.list || res.stores || res.items || []
        setStoreOptions(
          rows
            .map((s) => s.storeCode || s.store_code)
            .filter(Boolean)
            .sort((a, b) => String(a).localeCompare(String(b)))
        )
      })
      .catch(() => setStoreOptions([]))
  }, [isMaster])

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
          allowIndex: post.allowIndex !== false,
          isActive: post.isActive !== false,
          storeCode: post.storeCode || ''
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load blog post.')
        navigate('/blog')
      })
      .finally(() => setLoading(false))
  }, [id, isEdit, navigate, toast])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingCover(true)
    try {
      const res = await uploadAdminBlogImage(file)
      const url = res?.url
      if (!url) throw new Error('Upload failed.')
      setField('titleImage', url)
      toast.success('Cover image uploaded.')
    } catch (err) {
      toast.error(err.message || 'Cover image upload failed.')
    } finally {
      setUploadingCover(false)
    }
  }

  const handleContentImageUpload = async (file) => {
    const res = await uploadAdminBlogImage(file)
    const url = res?.url
    if (!url) throw new Error('Upload failed.')
    return url
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Title is required.')
      return
    }
    if (!form.slug.trim()) {
      toast.error('Slug is required.')
      return
    }
    if (!form.titleImage.trim()) {
      toast.error('Cover image is required. Please upload an image.')
      return
    }
    if (isMaster && !form.storeCode.trim()) {
      toast.error('Store code is required.')
      return
    }

    setSaving(true)
    const body = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      category: form.category.trim() || null,
      titleImage: form.titleImage.trim(),
      content: form.content || '',
      metaTitle: form.metaTitle.trim() || null,
      metaDescription: form.metaDescription.trim() || null,
      metaTags: form.metaTags.trim() || null,
      allowIndex: form.allowIndex !== false,
      isActive: Boolean(form.isActive)
    }
    if (isMaster) body.storeCode = form.storeCode.trim()

    try {
      if (isEdit) {
        await updateAdminBlogPost(id, body)
        toast.success('Blog post updated.')
      } else {
        await createAdminBlogPost(body)
        toast.success('Blog post created.')
      }
      navigate('/blog')
    } catch (err) {
      toast.error(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="blog-admin-page"><p>Loading…</p></div>
  }

  return (
    <div className="blog-admin-page blog-admin-form-page">
      <div className="blog-admin-header">
        <div>
          <h2>{isEdit ? 'Edit blog post' : 'Create blog post'}</h2>
          <p className="blog-admin-intro">
            Use the visual editor or HTML / code palette for full custom markup (tables, embeds, styled blocks).
          </p>
        </div>
        <Link to="/blog" className="admin-btn admin-btn-secondary">Back to list</Link>
      </div>

      <form className="blog-admin-form" onSubmit={handleSubmit}>
        {isMaster && (
          <label className="blog-admin-field">
            <span>Store code</span>
            <select
              value={form.storeCode}
              onChange={(e) => setField('storeCode', e.target.value)}
              required
            >
              <option value="">Select store</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
              {!storeOptions.includes('dragonfury') && (
                <option value="dragonfury">dragonfury</option>
              )}
            </select>
          </label>
        )}

        <label className="blog-admin-field">
          <span>Title</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            required
            maxLength={512}
          />
        </label>

        <label className="blog-admin-field">
          <span>Slug</span>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setField('slug', e.target.value)}
            required
            pattern="[a-zA-Z0-9\-]+"
            title="Letters, numbers, and hyphens only"
            placeholder="my-blog-post"
          />
        </label>

        <label className="blog-admin-field">
          <span>Category</span>
          <input
            type="text"
            value={form.category}
            onChange={(e) => setField('category', e.target.value)}
            placeholder="Guides, News, Updates…"
            maxLength={128}
          />
        </label>

        <div className="blog-admin-field">
          <span>Cover image <em className="blog-admin-required">(required)</em></span>
          <div className="blog-admin-cover">
            {form.titleImage ? (
              <div className="blog-admin-cover-preview">
                <img src={form.titleImage} alt="Cover preview" />
              </div>
            ) : (
              <div className="blog-admin-cover-empty">No cover image yet</div>
            )}
            <div className="blog-admin-cover-actions">
              <label className="admin-btn admin-btn-secondary blog-admin-upload-btn">
                {uploadingCover ? 'Uploading…' : form.titleImage ? 'Replace image' : 'Upload image'}
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
                  className="admin-btn admin-btn-danger admin-btn-sm"
                  disabled={uploadingCover || saving}
                  onClick={() => setField('titleImage', '')}
                >
                  Remove
                </button>
              )}
            </div>
            <p className="blog-admin-hint">PNG, JPG, WEBP, or GIF. Max 5MB.</p>
          </div>
        </div>

        <label className="blog-admin-field blog-admin-field-toggle">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setField('isActive', e.target.checked)}
          />
          <span>Active (visible on user site)</span>
        </label>

        <SeoMetaFields form={form} setField={setField} showIndexControl indexNoun="post" indexControlName="blog-google-index" />

        <div className="blog-admin-field">
          <span>Content</span>
          <BlogContentEditor
            value={form.content}
            onChange={(html) => setField('content', html)}
            onUploadImage={handleContentImageUpload}
            minHeight="320px"
          />
        </div>

        <div className="blog-admin-form-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => navigate('/blog')}>
            Cancel
          </button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || uploadingCover}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create post'}
          </button>
        </div>
      </form>
    </div>
  )
}
