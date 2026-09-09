import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// The source-map upload only happens when SENTRY_AUTH_TOKEN is present — set as
// a Production build env var in Vercel. Everywhere else (local, CI, preview)
// the plugin is a no-op and no .map files are emitted.
const uploadSourcemaps = !!process.env.SENTRY_AUTH_TOKEN

// https://vite.dev/config/
export default defineConfig({
  build: {
    // emit maps only when we're going to upload them to Sentry and delete them
    // again — never leave them sitting in the deployed bundle
    sourcemap: uploadSourcemaps ? 'hidden' : false,
  },
  plugins: [
    react(),
    sentryVitePlugin({
      disable: !uploadSourcemaps,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Vercel exposes the commit SHA; ties the uploaded maps + the runtime
      // events to a named release.
      release: { name: process.env.VERCEL_GIT_COMMIT_SHA || undefined },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      telemetry: false,
    }),
  ],
})
