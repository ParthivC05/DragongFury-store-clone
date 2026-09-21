import { useEffect, useRef, useState } from 'react'
import {
  blocksToHtml,
  createBlock,
  htmlToBlocks,
  sanitizeFragment
} from '../utils/blogBlocks'
import { useToast } from '../context/ToastContext'
import './BlogBlockCanvas.css'

function exec(command, value = null) {
  document.execCommand(command, false, value)
}

function TextEditable({ html, onChange, placeholder, className }) {
  const ref = useRef(null)
  const localRef = useRef(false)

  useEffect(() => {
    if (localRef.current) {
      localRef.current = false
      return
    }
    if (ref.current && ref.current.innerHTML !== (html || '')) {
      ref.current.innerHTML = html || ''
    }
  }, [html])

  return (
    <div
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(e) => {
        localRef.current = true
        onChange(e.currentTarget.innerHTML)
      }}
      onBlur={(e) => {
        localRef.current = true
        onChange(sanitizeFragment(e.currentTarget.innerHTML))
      }}
    />
  )
}

function FormatBar() {
  return (
    <div className="bbc-format" onMouseDown={(e) => e.preventDefault()}>
      <button type="button" onClick={() => exec('bold')} title="Make text thick">B</button>
      <button type="button" onClick={() => exec('italic')} title="Make text slanted"><em>I</em></button>
      <button type="button" onClick={() => exec('insertUnorderedList')} title="Make a list">List</button>
      <button
        type="button"
        title="Add a link"
        onClick={() => {
          const url = window.prompt('Paste the website link')
          if (url) exec('createLink', url)
        }}
      >
        Link
      </button>
    </div>
  )
}

function AddButtons({ onInsert }) {
  return (
    <div className="bbc-add">
      <button type="button" className="bbc-add-btn bbc-add-btn-picture" onClick={() => onInsert('image')}>
        <span aria-hidden>📷</span>
        Add a picture
      </button>
      <button type="button" className="bbc-add-btn" onClick={() => onInsert('text')}>
        <span aria-hidden>✏️</span>
        Add more words
      </button>
      <button type="button" className="bbc-add-btn bbc-add-btn-quiet" onClick={() => onInsert('heading')}>
        Add a title
      </button>
    </div>
  )
}

const PLACES = [
  { id: 'center', label: 'Normal' },
  { id: 'wide', label: 'Wide' },
  { id: 'full', label: 'Biggest' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' }
]

function ImageBlock({ block, onChange, onUploadImage, uploading, autoPick }) {
  const inputRef = useRef(null)
  const toast = useToast()
  const pickedRef = useRef(false)

  useEffect(() => {
    if (!autoPick || block.src || pickedRef.current) return
    pickedRef.current = true
    inputRef.current?.click()
  }, [autoPick, block.src])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onUploadImage) return
    try {
      const url = await onUploadImage(file)
      if (url) onChange({ src: url })
    } catch (err) {
      toast.error(err.message || 'Could not add that picture. Try another one.')
    }
  }

  return (
    <div className="bbc-image">
      {block.src ? (
        <div className={`bbc-image-frame is-${block.align || 'center'}`}>
          <img src={block.src} alt={block.alt || ''} />
        </div>
      ) : (
        <button
          type="button"
          className="bbc-image-empty"
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Adding picture…' : 'Tap here to pick a picture'}
          <span>From your computer</span>
        </button>
      )}
      <div className="bbc-image-tools">
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {block.src ? 'Change picture' : 'Pick a picture'}
        </button>
        {block.src && (
          <button
            type="button"
            className="admin-btn admin-btn-danger"
            onClick={() => onChange({ src: '' })}
          >
            Remove picture
          </button>
        )}
      </div>
      <p className="bbc-place-label">How big should this picture be?</p>
      <div className="bbc-places" role="group" aria-label="Picture size">
        {PLACES.map((place) => (
          <button
            key={place.id}
            type="button"
            className={`bbc-place${(block.align || 'center') === place.id ? ' is-on' : ''}`}
            onClick={() => onChange({ align: place.id })}
          >
            {place.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        className="bbc-caption"
        value={block.caption || ''}
        onChange={(e) => onChange({ caption: e.target.value })}
        placeholder="Words under the picture (optional)"
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        hidden
        onChange={handleFile}
      />
    </div>
  )
}

const TYPE_LABEL = {
  text: 'Words',
  image: 'Picture',
  heading: 'Title',
  quote: 'Quote',
  divider: 'Line'
}

export function BlogBlockCanvas({ value = '', onChange, onUploadImage }) {
  const emittedRef = useRef(value || '')
  const [blocks, setBlocks] = useState(() => htmlToBlocks(value))
  const [uploadingId, setUploadingId] = useState('')
  const [pickId, setPickId] = useState('')

  useEffect(() => {
    if ((value || '') === emittedRef.current) return
    setBlocks(htmlToBlocks(value))
    emittedRef.current = value || ''
  }, [value])

  const emit = (next) => {
    setBlocks(next)
    const html = blocksToHtml(next)
    emittedRef.current = html
    onChange?.(html)
  }

  const updateBlock = (id, patch) => {
    emit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  const insertAt = (index, type) => {
    const block = createBlock(type)
    const next = [...blocks]
    next.splice(index, 0, block)
    emit(next)
    if (type === 'image') setPickId(block.id)
  }

  const removeAt = (id) => {
    const next = blocks.filter((b) => b.id !== id)
    emit(next.length ? next : [createBlock('text')])
  }

  const move = (index, dir) => {
    const to = index + dir
    if (to < 0 || to >= blocks.length) return
    const next = [...blocks]
    const [row] = next.splice(index, 1)
    next.splice(to, 0, row)
    emit(next)
  }

  const handleUpload = async (id, file) => {
    if (!onUploadImage) return ''
    setUploadingId(id)
    try {
      return await onUploadImage(file)
    } finally {
      setUploadingId('')
    }
  }

  return (
    <div className="bbc bbc-easy">
      <p className="bbc-hint">Write in the boxes. Tap a button to add a picture or more words.</p>
      <AddButtons onInsert={(type) => insertAt(0, type)} />
      {blocks.map((block, index) => (
        <div key={block.id}>
          <article className={`bbc-card bbc-card-${block.type}`}>
            <header className="bbc-card-head">
              <span className="bbc-type">{TYPE_LABEL[block.type] || block.type}</span>
              <div className="bbc-card-actions">
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
                  Move up
                </button>
                <button type="button" disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>
                  Move down
                </button>
                <button type="button" className="is-danger" onClick={() => removeAt(block.id)}>
                  Delete
                </button>
              </div>
            </header>

            {block.type === 'heading' && (
              <input
                type="text"
                className="bbc-heading-input"
                value={block.text || ''}
                onChange={(e) => updateBlock(block.id, { text: e.target.value, level: 2 })}
                placeholder="Type a title here"
              />
            )}

            {block.type === 'text' && (
              <div className="bbc-text-wrap">
                <FormatBar />
                <TextEditable
                  html={block.html}
                  className="bbc-text"
                  placeholder="Type here…"
                  onChange={(html) => updateBlock(block.id, { html })}
                />
              </div>
            )}

            {block.type === 'image' && (
              <ImageBlock
                block={block}
                uploading={uploadingId === block.id}
                autoPick={pickId === block.id}
                onChange={(patch) => updateBlock(block.id, patch)}
                onUploadImage={(file) => handleUpload(block.id, file)}
              />
            )}

            {block.type === 'quote' && (
              <TextEditable
                html={block.html}
                className="bbc-quote"
                placeholder="Type a special line…"
                onChange={(html) => updateBlock(block.id, { html })}
              />
            )}

            {block.type === 'divider' && <hr className="bbc-divider" />}
          </article>
          <AddButtons onInsert={(type) => insertAt(index + 1, type)} />
        </div>
      ))}
    </div>
  )
}
