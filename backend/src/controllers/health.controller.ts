import type { Request, Response } from 'express'
import { env } from '../config/env.js'

export function getHealth(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    service: 'mockmate-backend',
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    supabaseConfigured: env.supabaseConfigured,
  })
}
