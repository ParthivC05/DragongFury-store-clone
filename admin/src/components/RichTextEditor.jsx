import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect, useCallback } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import './RichTextEditor.css'

function QuillField({ value = '', onChange, modules, placeholder, className }, ref) {
  const wrapRef = useRef(null)
  const quillRef = useRef(null)
  const lastHtmlRef = useRef(value || '')
  const appliedPropRef = useRef(value || '')
  const onChangeRef = useRef(onChange)
  const modulesRef = useRef(modules)
  const placeholderRef = useRef(placeholder)

  onChangeRef.current = onChange
  modulesRef.current = modules
  placeholderRef.current = placeholder

  useImperativeHandle(ref, () => ({
    getEditor: () => quillRef.current
  }), [])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined

    const host = document.createElement('div')
    wrap.appendChild(host)

    const quill = new Quill(host, {
      theme: 'snow',
      modules: modulesRef.current,
      placeholder: placeholderRef.current
    })
    quillRef.current = quill

    const initial = lastHtmlRef.current
    if (initial && initial !== '<p><br></p>') {
      quill.clipboard.dangerouslyPasteHTML(initial, 'silent')
      lastHtmlRef.current = quill.root.innerHTML
      appliedPropRef.current = initial
    }

    const handleChange = () => {
      const html = quill.root.innerHTML
      lastHtmlRef.current = html
      appliedPropRef.current = html
      onChangeRef.current?.(html)
    }
    quill.on('text-change', handleChange)

    return () => {
      quill.off('text-change', handleChange)
      quillRef.current = null
      wrap.innerHTML = ''
    }
  }, [])

  useEffect(() => {
    const quill = quillRef.current
    if (!quill) return
    const next = value || ''
    if (next === appliedPropRef.current || next === lastHtmlRef.current) return
    if (next === quill.root.innerHTML) {
      appliedPropRef.current = next
      lastHtmlRef.current = next
      return
    }
    const selection = quill.getSelection()
    if (!next || next === '<p><br></p>') {
      quill.setText('', 'silent')
    } else {
      quill.clipboard.dangerouslyPasteHTML(next, 'silent')
    }
    appliedPropRef.current = next
    lastHtmlRef.current = quill.root.innerHTML
    if (selection) {
      const length = quill.getLength()
      quill.setSelection(Math.min(selection.index, Math.max(length - 1, 0)), selection.length, 'silent')
    }
  }, [value])

  return <div ref={wrapRef} className={className} />
}

const QuillFieldWithRef = forwardRef(QuillField)
QuillFieldWithRef.displayName = 'QuillField'

/**
 * Modal for inserting an image by upload (preferred) and/or URL.
 */
function ImageInsertModal({ open, onClose, onInsert, onUploadImage }) {
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [previewError, setPreviewError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const urlInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const allowUpload = typeof onUploadImage === 'function'

  useEffect(() => {
    if (open) {
      setUrl('')
      setAlt('')
      setPreviewError(false)
      setUploading(false)
      setUploadError('')
      setTimeout(() => {
        if (allowUpload) fileInputRef.current?.focus?.()
        else urlInputRef.current?.focus()
      }, 0)
    }
  }, [open, allowUpload])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const handleInsertClick = () => {
    const trimmed = url.trim()
    if (!trimmed) return
    onInsert(trimmed, alt.trim() || undefined)
    onClose()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !allowUpload) return
    setUploading(true)
    setUploadError('')
    setPreviewError(false)
    try {
      const uploadedUrl = await onUploadImage(file)
      if (!uploadedUrl) throw new Error('Upload failed.')
      setUrl(String(uploadedUrl))
    } catch (err) {
      setUploadError(err?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const trimmedUrl = url.trim()
  const showPreview = trimmedUrl && (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://'))

  if (!open) return null

  return (
    <div
      className="rte-image-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Insert image"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="rte-image-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="rte-image-modal-form">
          {allowUpload && (
            <div className="rte-image-modal-field">
              <label htmlFor="rte-image-file">Upload image</label>
              <input
                ref={fileInputRef}
                id="rte-image-file"
                type="file"
                className="rte-image-modal-input"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                disabled={uploading}
                onChange={handleFileChange}
              />
              <p className="rte-image-modal-hint">PNG, JPG, WEBP, or GIF. Max 5MB.</p>
              {uploading && <p className="rte-image-modal-hint">Uploading…</p>}
              {uploadError && <p className="rte-image-modal-preview-error">{uploadError}</p>}
            </div>
          )}
          {!allowUpload && (
            <div className="rte-image-modal-field">
              <label htmlFor="rte-image-url">Image URL</label>
              <input
                ref={urlInputRef}
                id="rte-image-url"
                type="url"
                className="rte-image-modal-input"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  setPreviewError(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleInsertClick()
                  }
                }}
                placeholder="https://example.com/image.png"
                required
                autoComplete="off"
              />
            </div>
          )}
          <div className="rte-image-modal-field">
            <label htmlFor="rte-image-alt">Alt text (optional)</label>
            <input
              id="rte-image-alt"
              type="text"
              className="rte-image-modal-input"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Describe the image for accessibility"
              autoComplete="off"
            />
          </div>
          {showPreview && (
            <div className="rte-image-modal-preview">
              <div className="rte-image-modal-preview-box">
                {previewError ? (
                  <span className="rte-image-modal-preview-error">
                    Could not load image. Check the URL.
                  </span>
                ) : (
                  <img
                    src={trimmedUrl}
                    alt={alt || 'Preview'}
                    onLoad={() => setPreviewError(false)}
                    onError={() => setPreviewError(true)}
                  />
                )}
              </div>
            </div>
          )}
          <div className="rte-image-modal-actions">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={!trimmedUrl || uploading}
              onClick={handleInsertClick}
            >
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Full rich text editor (Quill): headers, bold, italic, underline, strike,
 * color, lists, indent, blockquote, code, link, image, alignment, clean.
 * Pass onUploadImage(file) => Promise<url> to use file upload instead of URL.
 */
export function RichTextEditor({
  value = '',
  onChange,
  onUploadImage,
  placeholder = 'Enter content…',
  minHeight = '200px'
}) {
  const quillRef = useRef(null)
  const [imageModalOpen, setImageModalOpen] = useState(false)
  const pendingInsertRef = useRef(null)

  const imageHandler = useMemo(() => {
    return function () {
      const quill = this.quill ?? quillRef.current?.getEditor?.()
      if (!quill) return
      const range = quill.getSelection(true)
      const index = range?.index ?? quill.getLength()
      pendingInsertRef.current = { quill, index }
      setImageModalOpen(true)
    }
  }, [])

  const handleImageInsert = useCallback((url, alt) => {
    const pending = pendingInsertRef.current
    if (!pending) return
    const quill = quillRef.current?.getEditor?.() ?? pending.quill
    if (!quill) return
    const index = pending.index ?? quill.getLength()
    quill.insertEmbed(index, 'image', url.trim(), 'user')
    quill.setSelection(index + 1)
    if (alt) {
      try {
        const leaf = quill.getLeaf(index)?.[0]
        const img = leaf?.domNode
        if (img?.tagName === 'IMG') img.setAttribute('alt', alt)
      } catch (_) { /* ignore */ }
    }
    pendingInsertRef.current = null
  }, [])

  const closeImageModal = useCallback(() => {
    setImageModalOpen(false)
    pendingInsertRef.current = null
  }, [])

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, 4, 5, 6, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ script: 'sub' }, { script: 'super' }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ indent: '-1' }, { indent: '+1' }],
          [{ align: [] }],
          ['blockquote', 'code-block'],
          ['link', 'image'],
          ['clean']
        ],
        handlers: {
          image: imageHandler
        }
      },
      clipboard: {
        matchVisual: false
      }
    }),
    [imageHandler]
  )

  return (
    <div className="rich-text-editor-wrap" style={{ minHeight }}>
      <QuillFieldWithRef
        ref={quillRef}
        value={value}
        onChange={onChange}
        modules={modules}
        placeholder={placeholder}
        className="rich-text-quill"
      />
      <ImageInsertModal
        open={imageModalOpen}
        onClose={closeImageModal}
        onInsert={handleImageInsert}
        onUploadImage={onUploadImage}
      />
    </div>
  )
}
