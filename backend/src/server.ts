import { createApp } from './app.js'
import { env } from './config/env.js'

const app = createApp()

app.listen(env.port, () => {
  console.log(`[mockmate-backend] listening on http://localhost:${env.port} (${env.nodeEnv})`)

  if (!env.supabaseConfigured) {
    console.warn(
      '[mockmate-backend] Supabase is not configured. Set SUPABASE_URL and ' +
        'SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) in backend/.env to enable ' +
        'token verification. The health endpoint still works.',
    )
  }
})
