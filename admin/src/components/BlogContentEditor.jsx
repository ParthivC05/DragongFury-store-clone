import { useEffect, useId, useRef, useState } from 'react'
import { RichTextEditor } from './RichTextEditor'
import './BlogContentEditor.css'

/**
 * Blog content editor with Visual (Quill) and HTML Code palette modes + live preview.
 * Matches Orionstars CMS “code palette” idea while keeping Partner Platform Quill for rich text.
 */
export function BlogContentEditor({ value = '', onChange, onUploadImage, minHeight = '280px' }) {
  const [mode, setMode] = useState('visual')
  const frameId = useId().replace(/:/g, '')
  const iframeRef = useRef(null)

  useEffect(() => {
    if (mode !== 'html') return
    const frame = iframeRef.current?.contentWindow?.document
    if (!frame) return
    frame.open()
    frame.write(`<!DOCTYPE html><html><head><style>
      body{font-family:system-ui,sans-serif;margin:12px;line-height:1.55;color:#111}
      img{max-width:100%;height:auto} pre,code{background:#f4f4f5;padding:2px 4px;border-radius:4px}
      pre{padding:12px;overflow:auto} table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ddd;padding:6px 8px}
    </style></head><body>${value || ''}</body></html>`)
    frame.close()
  }, [value, mode])

  return (
    <div className="blog-content-editor">
      <div className="blog-content-editor-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'visual'}
          className={`blog-content-editor-tab${mode === 'visual' ? ' is-active' : ''}`}
          onClick={() => setMode('visual')}
        >
          Visual editor
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'html'}
          className={`blog-content-editor-tab${mode === 'html' ? ' is-active' : ''}`}
          onClick={() => setMode('html')}
        >
          HTML / code palette
        </button>
      </div>

      {mode === 'visual' ? (
        <RichTextEditor
          value={value}
          onChange={onChange}
          onUploadImage={onUploadImage}
          placeholder="Write your blog post…"
          minHeight={minHeight}
        />
      ) : (
        <div className="blog-code-palette">
          <div className="blog-code-palette-pane">
            <label className="blog-code-palette-label" htmlFor={`blog-html-${frameId}`}>
              HTML
            </label>
            <textarea
              id={`blog-html-${frameId}`}
              className="blog-code-palette-textarea"
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              spellCheck={false}
              style={{ minHeight }}
              placeholder="<h2>Heading</h2>&#10;<p>Your content…</p>"
            />
          </div>
          <div className="blog-code-palette-pane">
            <span className="blog-code-palette-label">Live preview</span>
            <iframe
              ref={iframeRef}
              title="Blog HTML preview"
              className="blog-code-palette-preview"
              sandbox="allow-same-origin"
              style={{ minHeight }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
