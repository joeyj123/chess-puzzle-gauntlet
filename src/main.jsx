import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Only register the service worker in production builds. Registering it in
// `npm run dev` lets it cache Vite's dev module files (App.jsx, App.css,
// etc.) — on a PWA you've already installed from a dev session, the SW's
// stale-while-revalidate strategy then keeps serving those OLD cached
// modules (old layout, old CSS, old drag behavior) even after the source
// files change, which is why an installed PWA can look "way messed up" and
// out of sync with what you're seeing in a normal browser tab.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        // ignore registration failures (e.g. unsupported browser)
      })
  })
}
