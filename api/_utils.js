import process from 'process'

// Very small helpers for Vercel Serverless Functions.

export function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

export async function readJson(req) {
  // Vercel often provides req.body already parsed for JSON,
  // but we support raw stream too for local/node compatibility.
  if (req.body && typeof req.body === 'object') return req.body

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return null
  return JSON.parse(raw)
}

// Best-effort in-memory rate limiting (per warm lambda instance).
const rateLimit = new Map()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 30 // allow a bit more on serverless

export function checkRateLimit(req) {
  const ip =
    req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'

  const now = Date.now()
  const userRequests = rateLimit.get(ip) || []
  const validRequests = userRequests.filter((t) => now - t < RATE_LIMIT_WINDOW)
  if (validRequests.length >= RATE_LIMIT_MAX) return false
  validRequests.push(now)
  rateLimit.set(ip, validRequests)
  return true
}

export function getRequiredEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} not configured`)
  return v
}

