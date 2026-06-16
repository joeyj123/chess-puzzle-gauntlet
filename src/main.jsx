import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { crashed: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[Chess Puzzle App] Unhandled render error:', error, info)
  }
  render() {
    if (this.state.crashed) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100dvh', gap: '1rem',
          fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center',
        }}>
          <span style={{ fontSize: '3rem' }}>♟</span>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ color: '#666', margin: 0 }}>
            An unexpected error occurred. Your stats are saved — just reload to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '.6rem 1.4rem', borderRadius: '8px', border: 'none',
              background: '#2563eb', color: '#fff', fontSize: '1rem', cursor: 'pointer',
            }}
          >
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
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
