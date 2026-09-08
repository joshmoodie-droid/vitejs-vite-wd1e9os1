import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import RequestStatus from './RequestStatus.tsx'

// Error monitoring. No-op unless VITE_SENTRY_DSN is set (so local dev and CI
// stay quiet); in Vercel it's a project env var. The DSN is a write-only
// ingest key — safe to ship in the bundle.
const dsn = import.meta.env.VITE_SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // errors only for now — no performance tracing (keeps the free-tier quota
    // for what matters).
    tracesSampleRate: 0,
  })
}

const root = createRoot(document.getElementById('root')!)

// Minimal path-based routing. Email links point at /r/:requestId?t=:token
// and open a read-only status view; everything else is the main app.
const match = window.location.pathname.match(/^\/r\/([^/]+)\/?$/)

root.render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0B0B0C',
            color: '#a3a3a3',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          <p>
            Something went wrong. Please refresh the page — if it keeps
            happening, try again shortly.
          </p>
        </div>
      }
    >
      {match ? (
        <RequestStatus
          requestId={decodeURIComponent(match[1])}
          token={new URLSearchParams(window.location.search).get('t')}
        />
      ) : (
        <App />
      )}
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
