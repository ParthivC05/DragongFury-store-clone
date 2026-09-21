import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import './RichTextEditor.css'

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

  const formats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'color',
    'background',
    'script',
    'list',
    'bullet',
    'indent',
    'align',
    'blockquote',
    'code-block',
    'link',
    'image'
  ]

  return (
    <div className="rich-text-editor-wrap" style={{ minHeight }}>
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
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
