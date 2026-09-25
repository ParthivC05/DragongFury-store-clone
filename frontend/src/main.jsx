import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { scheduleDashboardStyles } from './styles/loadDashboardStyles'
import App from './App.jsx'
import site from './config/site'
import { applySitewideSchema } from './utils/schemaOrg'
import { registerPwaServiceWorker } from './lib/registerPwaServiceWorker'
import { registerPwaInstallPromptCapture } from './lib/pwaInstallPrompt'
import { detectStandalone } from './utils/mobileGameImmersive'
import { startIdleTabRecovery } from './utils/idleTabRecovery'
import { startTabResumeRepaint } from './utils/forceUiRepaint'
import { lockAppZoom } from './utils/lockPlayPageZoom'
import { startClubClickSounds } from './lib/clubClickSounds'

scheduleDashboardStyles()
registerPwaInstallPromptCapture()
registerPwaServiceWorker()
startIdleTabRecovery()
startTabResumeRepaint()
lockAppZoom()

/**
 * After a deploy, hashed Vite chunks from the previous build are gone.
 * Tabs still holding the old shell fail lazy imports (LiveWinPopup, Intercom,
 * CheckEmail, etc.) and Clarity reports MIME text/html + "Failed to fetch
 * dynamically imported module". Reload once to pick up the new asset map.
 * See https://vite.dev/guide/build#load-error-handling
 */
const PRELOAD_RELOAD_KEY = 'vite:preload-reload'

function reloadForStaleAssets() {
  try {
    if (sessionStorage.getItem(PRELOAD_RELOAD_KEY) === '1') return
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1')
  } catch {
    /* private mode / blocked storage — still attempt one reload */
  }
  window.location.reload()
}

function isStaleChunkError(reason) {
  const msg = String(reason?.message || reason || '')
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    /text\/html.*javascript|javascript.*mime/i.test(msg)
  )
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  reloadForStaleAssets()
})

window.addEventListener('unhandledrejection', (event) => {
  if (!isStaleChunkError(event.reason)) return
  event.preventDefault()
  reloadForStaleAssets()
})

// Benign Chromium quirk — not a real app bug; Clarity still counts it as JS error
window.addEventListener('error', (event) => {
  const msg = event.message || ''
  if (
    msg.includes('ResizeObserver loop completed with undelivered notifications') ||
    msg.includes('ResizeObserver loop limit exceeded')
  ) {
    event.stopImmediatePropagation()
    event.preventDefault()
  }
})

// After a healthy boot, allow another auto-reload on a future deploy in this tab
window.setTimeout(() => {
  try {
    sessionStorage.removeItem(PRELOAD_RELOAD_KEY)
  } catch {
    /* ignore */
  }
}, 15000)

/* Home-screen / installed PWA only — used for iOS status-bar safe-area CSS */
if (detectStandalone()) {
  document.documentElement.classList.add('pj-standalone')
}

if (site?.seoTitle || site?.platformName) {
  document.title = site.seoTitle || site.platformName
}

if (site?.seoDescription) {
  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', site.seoDescription)
}

applySitewideSchema()

if (site?.faviconUrl) {
  let favicon = document.querySelector('link[rel="icon"]')
  if (!favicon) {
    favicon = document.createElement('link')
    favicon.rel = 'icon'
    document.head.appendChild(favicon)
  }
  favicon.href = site.faviconUrl
}

startClubClickSounds()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
