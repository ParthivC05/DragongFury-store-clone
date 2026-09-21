import { useEffect, useId, useRef, useState } from 'react'
import { RichTextEditor } from './RichTextEditor'
import { BlogBlockCanvas } from './BlogBlockCanvas'
import './BlogContentEditor.css'

const PREVIEW_STYLES = `
  body{font-family:Georgia,'Iowan Old Style',serif;margin:16px;line-height:1.65;color:#111;background:#fafafa}
  img{max-width:100%;height:auto;border-radius:12px}
  figure{margin:1.25rem auto;display:block}
  figcaption{font-size:13px;color:#64748b;text-align:center;margin-top:6px}
  figure[data-align='center'],figure:not([data-align]){width:78%}
  figure[data-align='wide']{width:92%}
  figure[data-align='full']{width:100%}
  figure[data-align='left']{float:left;width:46%;margin:0.2rem 0.85rem 0.7rem 0}
  figure[data-align='right']{float:right;width:46%;margin:0.2rem 0 0.7rem 0.85rem}
`

function writePreview(frame, html) {
  if (!frame) return
  frame.open()
  frame.write(`<!DOCTYPE html><html><head><style>${PREVIEW_STYLES}</style></head><body>${html || '<p style="color:#94a3b8">Nothing to preview yet.</p>'}</body></html>`)
  frame.close()
}

/**
 * Blog editor: Easy blocks, Visual (Quill), HTML, and Preview.
 */
export function BlogContentEditor({
  value = '',
  onChange,
  onUploadImage,
  minHeight = '280px',
  placeholder = 'Write your blog post…',
  defaultMode = 'blocks'
}) {
  const [mode, setMode] = useState(defaultMode)
  const frameId = useId().replace(/:/g, '')
  const htmlPreviewRef = useRef(null)
  const previewRef = useRef(null)

  useEffect(() => {
    if (mode === 'html') writePreview(htmlPreviewRef.current?.contentWindow?.document, value)
    if (mode === 'preview') writePreview(previewRef.current?.contentWindow?.document, value)
  }, [value, mode])

  return (
    <div className="blog-content-editor">
      <div className="blog-content-editor-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'blocks'}
          className={`blog-content-editor-tab${mode === 'blocks' ? ' is-active' : ''}`}
          onClick={() => setMode('blocks')}
        >
          Easy
        </button>
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
          HTML editor
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'preview'}
          className={`blog-content-editor-tab${mode === 'preview' ? ' is-active' : ''}`}
          onClick={() => setMode('preview')}
        >
          Preview
        </button>
      </div>

      {mode === 'blocks' && (
        <BlogBlockCanvas
          value={value}
          onChange={onChange}
          onUploadImage={onUploadImage}
        />
      )}

      {mode === 'visual' && (
        <RichTextEditor
          value={value}
          onChange={onChange}
          onUploadImage={onUploadImage}
          placeholder={placeholder}
          minHeight={minHeight}
        />
      )}

      {mode === 'html' && (
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
            />
          </div>
          <div className="blog-code-palette-pane">
            <span className="blog-code-palette-label">Preview</span>
            <iframe
              ref={htmlPreviewRef}
              title="Blog HTML preview"
              className="blog-code-palette-preview"
              sandbox="allow-same-origin"
              style={{ minHeight }}
            />
          </div>
        </div>
      )}

      {mode === 'preview' && (
        <iframe
          ref={previewRef}
          title="Blog post preview"
          className="blog-content-preview-frame"
          sandbox="allow-same-origin"
          style={{ minHeight: '420px' }}
        />
      )}
    </div>
  )
}
