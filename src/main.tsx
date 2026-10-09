import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import RequestStatus from './RequestStatus.tsx'
import { currentRoute } from './lib/routes.ts'

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

// Email links to /r/:requestId?t=:token open a read-only status view;
// everything else is the main app. Routes live in lib/routes.ts.
const route = currentRoute()

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
      {route.name === 'request' ? (
        <RequestStatus requestId={route.requestId} token={route.token} />
      ) : (
        <App />
      )}
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
