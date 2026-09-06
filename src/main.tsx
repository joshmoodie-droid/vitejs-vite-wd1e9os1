import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import RequestStatus from './RequestStatus.tsx'

const root = createRoot(document.getElementById('root')!)

// Minimal path-based routing. Email links point at /r/:requestId?t=:token
// and open a read-only status view; everything else is the main app.
const match = window.location.pathname.match(/^\/r\/([^/]+)\/?$/)

root.render(
  <StrictMode>
    {match ? (
      <RequestStatus
        requestId={decodeURIComponent(match[1])}
        token={new URLSearchParams(window.location.search).get('t')}
      />
    ) : (
      <App />
    )}
  </StrictMode>,
)
