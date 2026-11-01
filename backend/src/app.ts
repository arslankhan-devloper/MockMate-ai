import cors from 'cors'
import express, { type Express } from 'express'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import { notFound } from './middleware/notFound.js'
import { registerRoutes } from './routes/index.js'

export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(
    cors({
      origin: env.frontendOrigins,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  registerRoutes(app)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
