import { useState, useEffect } from 'react'
import {
  getAllGameTemplates,
  getGameTemplate,
  createGameTemplate,
  updateGameTemplate
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import './Distributors.css'
import './Games.css'
import {
  isSimpleGame,
  isAgentCredentialGame,
  usesStreamlitTemplateFields,
  usesVegasXTemplateFields,
  usesOrionStarsTerminalTemplateFields,
  usesOrionStarsBotAutomationTemplateFields,
  usesFirekirinTerminalTemplateFields,
  usesFirekirinBotAutomationTemplateFields,
  usesMilkywayTerminalTemplateFields,
  usesMilkywayBotAutomationTemplateFields,
  usesGameroomAgentTemplateFields,
  usesGameroomBotAutomationTemplateFields,
  usesCashmachineAgentTemplateFields,
  usesCashmachineBotAutomationTemplateFields,
  getGameIntegrationLabel,
  formatTemplateOptionLabel,
  resolveAgentTemplateGameKey
} from '../utils/gameIntegration.helpers'

const initialForm = {
  name: '',
  gameKey: '',
  streamlitToken: '',
  botBaseUrl: '',
  gameLink: '',
  isActive: true
}

export default function GameTemplates() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'edit'
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(initialForm)

  const loadTemplates = () => {
    setLoading(true)
    getAllGameTemplates()
      .then((data) => setList(data.list || []))
      .catch((err) => {
        toast.error(err.message || 'Failed to load game configs')
        setList([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const openAdd = () => {
    setForm(initialForm)
    setModalMode('add')
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = async (template) => {
    setEditingId(template.id)
    setModalMode('edit')
    try {
      const data = await getGameTemplate(template.id)
      setForm({
        name: data.name ?? '',
        gameKey: data.gameKey ?? '',
        streamlitToken: data.streamlitToken ?? '',
        botBaseUrl: data.botBaseUrl ?? '',
        gameLink: data.gameLink ?? '',
        isActive: data.isActive !== false
      })
      setModalOpen(true)
    } catch (err) {
      toast.error(err.message || 'Failed to load config')
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalMode('add')
    setForm(initialForm)
    setEditingId(null)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'isActive') {
      setForm((prev) => ({ ...prev, isActive: e.target.checked }))
      return
    }
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const name = (form.name || '').trim()
    const gameKey = (form.gameKey || '').trim()
    const streamlitToken = (form.streamlitToken || '').trim()
    const botBaseUrl = (form.botBaseUrl || '').trim()
    if (!name) {
      toast.error('Name is required.')
      return
    }
    if (usesStreamlitTemplateFields(form)) {
      if (!gameKey) {
        toast.error('Game key is required.')
        return
      }
      if (modalMode === 'add' && !streamlitToken) {
        toast.error('Streamlit token is required.')
        return
      }
    }
    if (isAgentCredentialGame(form)) {
      const resolvedKey = resolveAgentTemplateGameKey(name, gameKey)
      if (!resolvedKey) {
        toast.error('Could not resolve integration key. Use a name like "Game Vault (Agent)" / gamevault_agent or "Juwa 2.0 (Agent)".')
        return
      }
    }
    if (usesVegasXTemplateFields(form) && !gameKey) {
      toast.error('Game key is required for VegasX.')
      return
    }
    if (usesOrionStarsTerminalTemplateFields(form) && !gameKey) {
      toast.error('Game key is required for Orion Stars.')
      return
    }
    if (usesFirekirinTerminalTemplateFields(form) && !gameKey) {
      toast.error('Game key is required for Firekirin Agent. Use firekirin_agent.')
      return
    }
    if (usesMilkywayTerminalTemplateFields(form) && !gameKey) {
      toast.error('Game key is required for Milkyway Agent. Use milkyway_agent.')
      return
    }
    if (usesGameroomAgentTemplateFields(form) && !gameKey) {
      toast.error('Game key is required for Gameroom Agent. Use gameroom_agent.')
      return
    }
    if (usesCashmachineAgentTemplateFields(form) && !gameKey) {
      toast.error('Game key is required for CashMachine777 Agent. Use cashmachine_agent.')
      return
    }
    if (modalMode === 'add' && !botBaseUrl) {
      toast.error('Bot base URL is required.')
      return
    }
    setSaving(true)
    try {
      if (modalMode === 'add') {
        const payload = {
          name,
          botBaseUrl,
          gameLink: (form.gameLink || '').trim() || null,
          isActive: form.isActive
        }
        if (usesStreamlitTemplateFields(form)) {
          payload.gameKey = gameKey
          payload.streamlitToken = streamlitToken
        }
        if (isAgentCredentialGame(form)) {
          payload.gameKey = resolveAgentTemplateGameKey(name, gameKey)
        }
        if (usesVegasXTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesOrionStarsTerminalTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesFirekirinTerminalTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesMilkywayTerminalTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesGameroomAgentTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesCashmachineAgentTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        const res = await createGameTemplate(payload)
        toast.success(res.message || 'Game config created.')
        if (res.template) setList((prev) => [...prev, res.template])
      } else {
        const payload = {
          name,
          gameLink: (form.gameLink || '').trim() || null,
          isActive: form.isActive
        }
        if (usesStreamlitTemplateFields(form)) payload.gameKey = gameKey
        if (isAgentCredentialGame(form)) {
          payload.gameKey = resolveAgentTemplateGameKey(name, gameKey)
        }
        if (usesVegasXTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesOrionStarsTerminalTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesFirekirinTerminalTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesMilkywayTerminalTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesGameroomAgentTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (usesCashmachineAgentTemplateFields(form)) {
          payload.gameKey = gameKey
        }
        if (streamlitToken) payload.streamlitToken = streamlitToken
        if (botBaseUrl) payload.botBaseUrl = botBaseUrl
        const res = await updateGameTemplate(editingId, payload)
        toast.success(res.message || 'Game config updated.')
        if (res.template) {
          setList((prev) => prev.map((t) => (t.id === editingId ? res.template : t)))
        } else {
          loadTemplates()
        }
      }
      closeModal()
    } catch (err) {
      toast.error(err.message || (modalMode === 'add' ? 'Failed to create config.' : 'Failed to update config.'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (template) => {
    const nextActive = !template.isActive
    setSaving(true)
    try {
      await updateGameTemplate(template.id, { isActive: nextActive })
      toast.success(`Config "${template.name}" is now ${nextActive ? 'active' : 'inactive'}.`)
      setList((prev) => prev.map((t) => (t.id === template.id ? { ...t, isActive: nextActive } : t)))
    } catch (err) {
      toast.error(err.message || 'Failed to update status.')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleString()
    } catch {
      return d
    }
  }

  return (
    <div className="distributors-page games-page">
      <div className="page-header">
        <h2>Game configs</h2>
        <p className="page-description" style={{ marginTop: '0.25rem', color: '#6b7280', fontSize: '0.875rem' }}>
          Add and manage game configs. Store admins use these configs when adding games. Active configs appear in the game dropdown.
        </p>
        <div className="page-header-actions">
          <button type="button" className="admin-btn admin-btn-primary" onClick={openAdd}>
            Add config
          </button>
        </div>
      </div>

      {loading ? (
        <div className="page-loading">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Game key</th>
                <th>Integration</th>
                <th>Game link</th>
                <th>Active</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={8}>No game configs yet. Use “Add config” to create one.</td>
                </tr>
              ) : (
                list.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{formatTemplateOptionLabel(t)}</td>
                    <td><code style={{ fontSize: '0.8125rem' }}>{t.gameKey ?? '—'}</code></td>
                    <td>{getGameIntegrationLabel(t) || '—'}</td>
                    <td>
                      {t.gameLink ? (
                        <a href={t.gameLink} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>
                          {t.gameLink}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`games-bot-mode-badge ${t.isActive ? 'games-bot-mode-auto' : 'games-bot-mode-manual'}`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(t.created_at ?? t.createdAt)}</td>
                    <td>
                      <div className="games-actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-edit"
                          onClick={() => openEdit(t)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`admin-btn admin-btn-sm ${t.isActive ? 'admin-btn-warning' : 'admin-btn-success'}`}
                          onClick={() => handleToggleActive(t)}
                          disabled={saving}
                          title={t.isActive ? 'Deactivate config (hide from dropdown)' : 'Activate config'}
                        >
                          {t.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div
          className="games-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-configs-modal-title"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="games-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <h2 id="game-configs-modal-title" className="games-modal-title">
              {modalMode === 'edit' ? 'Edit game config' : 'Add game config'}
            </h2>
            <form onSubmit={handleSubmit} className="games-modal-form">
              <div className="games-modal-field">
                <label htmlFor="gt-name">Name</label>
                <input
                  id="gt-name"
                  name="name"
                  type="text"
                  className="store-features-input"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. OrionStars Agent, OrionStars Bot, VegasX, Juwa"
                />
              </div>
              {usesStreamlitTemplateFields(form) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input
                      id="gt-gameKey"
                      name="gameKey"
                      type="text"
                      className="store-features-input"
                      value={form.gameKey}
                      onChange={handleChange}
                      required
                      placeholder="e.g. orionstars_bot, Juwa, Juwa2.0, GameVault"
                    />
                  </div>
                  <div className="games-modal-field">
                    <label htmlFor="gt-streamlitToken">Streamlit token</label>
                    <input
                      id="gt-streamlitToken"
                      name="streamlitToken"
                      type="password"
                      className="store-features-input"
                      value={form.streamlitToken}
                      onChange={handleChange}
                      required={modalMode === 'add'}
                      placeholder={modalMode === 'edit' ? 'Leave blank to keep current' : 'Required'}
                      autoComplete="off"
                    />
                    {modalMode === 'edit' && (
                      <p className="games-modal-hint">Leave blank to keep the existing token.</p>
                    )}
                  </div>
                </>
              )}
              {usesVegasXTemplateFields(form) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input
                      id="gt-gameKey"
                      name="gameKey"
                      type="text"
                      className="store-features-input"
                      value={form.gameKey}
                      onChange={handleChange}
                      required
                      placeholder="e.g. VegasX"
                    />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    VegasX agent API — only Name, Game key, Bot base URL, and Game link are required. Store admins provide store username and password when adding the game.
                  </p>
                </>
              )}
              {usesOrionStarsTerminalTemplateFields(form) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input
                      id="gt-gameKey"
                      name="gameKey"
                      type="text"
                      className="store-features-input"
                      value={form.gameKey}
                      onChange={handleChange}
                      required
                      placeholder="e.g. orionstars_agent"
                    />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    Orion Stars Terminal Agent API — use game key <code>orionstars_agent</code> (or <code>orionstars</code>). Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesOrionStarsBotAutomationTemplateFields(form) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Orion Stars bot automation API — use game key <code>orionstars_bot</code>. Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {usesFirekirinTerminalTemplateFields(form) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input
                      id="gt-gameKey"
                      name="gameKey"
                      type="text"
                      className="store-features-input"
                      value={form.gameKey}
                      onChange={handleChange}
                      required
                      placeholder="e.g. firekirin_agent"
                    />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    Firekirin Agent API — use game key <code>firekirin_agent</code>. Bot base URL should be <code>https://firekirin.xyz:8033</code>. Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesFirekirinBotAutomationTemplateFields(form) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Firekirin bot automation API — use game key <code>firekirin</code> (or <code>firekirin_bot</code>). Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {usesMilkywayTerminalTemplateFields(form) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input
                      id="gt-gameKey"
                      name="gameKey"
                      type="text"
                      className="store-features-input"
                      value={form.gameKey}
                      onChange={handleChange}
                      required
                      placeholder="e.g. milkyway_agent"
                    />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    Milkyway Agent API — use game key <code>milkyway_agent</code>. Bot base URL should be <code>https://milkywayapp.xyz:8033</code>. Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesMilkywayBotAutomationTemplateFields(form) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Milkyway bot automation API — use game key <code>milkyway</code> (or <code>milkyway_bot</code>). Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {usesGameroomAgentTemplateFields(form) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input
                      id="gt-gameKey"
                      name="gameKey"
                      type="text"
                      className="store-features-input"
                      value={form.gameKey}
                      onChange={handleChange}
                      required
                      placeholder="e.g. gameroom_agent"
                    />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    Gameroom Agent API — use game key <code>gameroom_agent</code>. Bot base URL should be <code>https://agentserver.gameroom777.com</code>. Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesGameroomBotAutomationTemplateFields(form) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Gameroom bot automation API — use game key <code>gameroom</code> (or <code>gameroom_bot</code>). Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {usesCashmachineAgentTemplateFields(form) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input
                      id="gt-gameKey"
                      name="gameKey"
                      type="text"
                      className="store-features-input"
                      value={form.gameKey}
                      onChange={handleChange}
                      required
                      placeholder="e.g. cashmachine_agent"
                    />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    CashMachine777 Agent API — use game key <code>cashmachine_agent</code>. Bot base URL should be <code>https://agentserver.cashmachine777.com</code>. Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesCashmachineBotAutomationTemplateFields(form) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  CashMachine777 bot automation API — use game key <code>cashmachine777</code>. Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {isSimpleGame(form.name) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  For Vblink, UltraPanda, and Egame99 you only need Name, Bot base URL, and Game link. Game key and Streamlit token are not used.
                </p>
              )}
              {isAgentCredentialGame(form) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Agent API template — only Name, Bot base URL, and Game link are required (same as Game Vault agent / Juwa 2.0 agent / Juwa agent). Store admins provide Agent ID and API secret key when adding the game. For original Juwa Agent use game key <code>juwa_agent</code> and base URL <code>https://external.juwa777.com</code>.
                </p>
              )}
              <div className="games-modal-field">
                <label htmlFor="gt-botBaseUrl">Bot base URL</label>
                <input
                  id="gt-botBaseUrl"
                  name="botBaseUrl"
                  type="url"
                  className="store-features-input"
                  value={form.botBaseUrl}
                  onChange={handleChange}
                  required={modalMode === 'add'}
                  placeholder={modalMode === 'edit' ? 'Leave blank to keep current' : 'https://...'}
                />
                {modalMode === 'edit' && (
                  <p className="games-modal-hint">Leave blank to keep the existing URL.</p>
                )}
              </div>
              <div className="games-modal-field">
                <label htmlFor="gt-gameLink">Game link</label>
                <input
                  id="gt-gameLink"
                  name="gameLink"
                  type="url"
                  className="store-features-input"
                  value={form.gameLink}
                  onChange={handleChange}
                  placeholder="https://..."
                />
              </div>
              <div className="games-modal-field games-modal-field-checkbox">
                <label>
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={form.isActive}
                    onChange={handleChange}
                  />
                  <span>Active (show in “Add game” dropdown)</span>
                </label>
              </div>
              <div className="games-modal-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : modalMode === 'edit' ? 'Update config' : 'Add config'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
