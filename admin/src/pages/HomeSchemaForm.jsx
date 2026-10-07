import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminHomeSchema, saveAdminHomeSchema } from '../api/admin'
import { SchemaEditor, schemaErrorFor } from '../components/SchemaEditor'
import { homeSchemaAuto } from '../utils/pageSchema'
import { useToast } from '../context/ToastContext'
import './BlogPosts.css'

const AUTO = homeSchemaAuto()

export default function HomeSchemaForm() {
  const toast = useToast()
  const [form, setForm] = useState({
    schemaEnabled: true,
    schemaType: 'WebPage',
    schemaFields: {},
    schemaCustom: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAdminHomeSchema()
      .then((res) => {
        setForm({
          schemaEnabled: res.schemaEnabled !== false,
          schemaType: res.schemaType || 'WebPage',
          schemaFields: res.schemaFields || {},
          schemaCustom: res.schemaCustom || ''
        })
      })
      .catch((err) => toast.error(err.message || 'Could not load home page schema.'))
      .finally(() => setLoading(false))
  }, [toast])

  const save = async (e) => {
    e.preventDefault()
    const schemaError = schemaErrorFor(form, AUTO)
    if (schemaError) {
      toast.error(schemaError)
      return
    }
    setSaving(true)
    try {
      const res = await saveAdminHomeSchema(form)
      setForm({
        schemaEnabled: res.schemaEnabled !== false,
        schemaType: res.schemaType || 'WebPage',
        schemaFields: res.schemaFields || {},
        schemaCustom: res.schemaCustom || ''
      })
      toast.success('Home page schema saved.')
    } catch (err) {
      toast.error(err.message || 'Could not save home page schema.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="blog-admin-page"><p>Loading…</p></div>

  return (
    <div className="blog-admin-page blog-admin-form-page blog-easy">
      <div className="blog-easy-top">
        <div>
          <h2>Home page schema</h2>
          <p className="blog-admin-intro">dragonfury.casino home page. This does not change the visible page text.</p>
        </div>
        <Link to="/blog" className="admin-btn admin-btn-secondary">Go back</Link>
      </div>
      <form className="blog-easy-form" onSubmit={save}>
        <section className="blog-easy-step">
          <p className="blog-easy-num">1</p>
          <div className="blog-easy-step-body">
            <SchemaEditor
              value={form}
              auto={AUTO}
              defaultType="WebPage"
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />
          </div>
        </section>
        <div className="blog-easy-save">
          <button type="submit" className="admin-btn admin-btn-primary blog-easy-save-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
