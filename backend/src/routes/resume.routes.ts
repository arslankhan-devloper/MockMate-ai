import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { analyzeResumeHandler } from '../controllers/resume.controller.js'
import { requireAuth } from '../middleware/auth.js'
import { MAX_RESUME_BYTES } from '../services/resume.service.js'
import { sendError } from '../utils/http.js'

// Uploads are held in memory only (never written to disk) and capped so a
// single request cannot exhaust the server.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_RESUME_BYTES,
    files: 1,
    fields: 4,
    fieldSize: 10_000,
    parts: 6,
  },
})

// Wrap Multer so its errors become the API's standard JSON error shape instead
// of falling through to the generic 500 handler.
function uploadResume(req: Request, res: Response, next: NextFunction): void {
  upload.single('resume')(req, res, (err: unknown) => {
    if (!err) {
      next()
      return
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      sendError(res, 413, 'file_too_large', 'Resume must be 5 MB or smaller.')
      return
    }
    sendError(res, 400, 'upload_error', 'The upload could not be processed.')
  })
}

export const resumeRouter = Router()

resumeRouter.use(requireAuth)
resumeRouter.post('/analyze', uploadResume, analyzeResumeHandler)
