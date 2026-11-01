import { Router } from 'express'
import { getProfile, patchProfile } from '../controllers/profile.controller.js'
import { requireAuth } from '../middleware/auth.js'

export const profileRouter = Router()

// Every profile route requires a verified Supabase access token. `requireAuth`
// attaches the caller's identity and a token-scoped Supabase client, so all
// reads and writes run under RLS.
profileRouter.use(requireAuth)

profileRouter.get('/', getProfile)
profileRouter.patch('/', patchProfile)
