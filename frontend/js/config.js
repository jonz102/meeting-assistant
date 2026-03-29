/**
 * Runtime configuration.
 * On Vercel: set VITE_API_BASE_URL (or API_BASE_URL) as an Environment Variable
 * in the Vercel dashboard → Project → Settings → Environment Variables.
 *
 * Locally: falls back to http://localhost:8000
 */
window.APP_CONFIG = {
  // Vercel injects NEXT_PUBLIC_ / plain env vars at build time for frameworks.
  // For a plain static site we use a meta tag injected by vercel.json OR
  // fall back to localhost for local dev.
  API_BASE_URL: (
    document.querySelector('meta[name="api-base-url"]')?.content ||
    'http://localhost:8000'
  ),
  WS_BASE_URL: (
    document.querySelector('meta[name="ws-base-url"]')?.content ||
    'ws://localhost:8000'
  )
};
