import type { Response } from 'express'

export interface ErrorBody {
  error: string
  code: string
  fields?: Record<string, string>
}

// Every API error response shares one shape: a human-readable `error`, a stable
// machine `code`, and (for validation failures) per-field `fields`.
export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  extra?: Pick<ErrorBody, 'fields'>,
): void {
  const body: ErrorBody = { error: message, code }
  if (extra?.fields) body.fields = extra.fields
  res.status(status).json(body)
}
