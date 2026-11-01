import type { Request, Response } from 'express'
import {
  GroqError,
  MAX_RESUME_BYTES,
  MIN_RESUME_TEXT_LENGTH,
  ResumeExtractionError,
  analyzeResume,
  detectResumeKind,
  extractResumeText,
} from '../services/resume.service.js'
import { sendError } from '../utils/http.js'
import { validateResumeInputs } from '../utils/resumeValidation.js'

// POST /api/resume/analyze — multipart upload (file field "resume", optional
// "jobTitle" / "jobDescription"). The file is parsed in memory, analysed by
// Groq on the server, and the validated result is returned. Nothing is stored.
export async function analyzeResumeHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const file = req.file
  if (!file || !file.buffer || file.buffer.length === 0) {
    sendError(res, 400, 'missing_file', 'Attach a PDF or DOCX resume to analyse.')
    return
  }
  if (file.size > MAX_RESUME_BYTES) {
    sendError(res, 413, 'file_too_large', 'Resume must be 5 MB or smaller.')
    return
  }

  // The MIME type supplied by the browser is untrusted; the file name is used
  // as the primary signal and the extractor handles malformed input safely.
  const kind = detectResumeKind(file.originalname, file.mimetype)
  if (!kind) {
    sendError(res, 400, 'unsupported_file_type', 'Only PDF and DOCX resumes are supported.')
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const parsed = validateResumeInputs(body.jobTitle, body.jobDescription)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  let resumeText: string
  try {
    resumeText = await extractResumeText(file.buffer, kind)
  } catch (err) {
    if (err instanceof ResumeExtractionError) {
      const status = err.code === 'resume_too_long' ? 422 : 400
      sendError(res, status, err.code, err.message)
      return
    }
    sendError(res, 400, 'unreadable_resume', 'We could not read this resume. Try a different file.')
    return
  }

  if (resumeText.length < MIN_RESUME_TEXT_LENGTH) {
    sendError(
      res,
      422,
      'no_readable_text',
      'We could not find enough readable text. If your resume is a scanned image, ' +
        'please upload a text-based PDF or DOCX.',
    )
    return
  }

  try {
    const analysis = await analyzeResume({
      resumeText,
      jobTitle: parsed.jobTitle,
      jobDescription: parsed.jobDescription,
    })
    res.status(200).json(analysis)
  } catch (err) {
    if (err instanceof GroqError) {
      sendError(res, err.status, err.code, err.message)
      return
    }
    sendError(res, 502, 'ai_request_failed', 'Resume analysis failed. Please try again.')
  }
}
