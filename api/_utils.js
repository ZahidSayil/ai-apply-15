/* eslint-disable no-undef */
import process from 'node:process'

// Allowed origins — add your Vercel domain after first deploy
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
]

export function setCors(req, res) {
  const origin = req.headers.origin || ''
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''
  const customDomain = process.env.ALLOWED_ORIGIN || ''

  const allowed = [
    ...ALLOWED_ORIGINS,
    vercelUrl,
    customDomain,
  ].filter(Boolean)

  if (allowed.includes(origin) || process.env.NODE_ENV !== 'production') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
  } else {
    res.setHeader('Access-Control-Allow-Origin', vercelUrl || ALLOWED_ORIGINS[0])
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

export function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return null
  return JSON.parse(raw)
}

const rateLimit = new Map()
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 15 // tighter for production

export function checkRateLimit(req) {
  const ip =
    req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  const now = Date.now()
  const userRequests = rateLimit.get(ip) || []
  const valid = userRequests.filter((t) => now - t < RATE_LIMIT_WINDOW)
  if (valid.length >= RATE_LIMIT_MAX) return false
  valid.push(now)
  rateLimit.set(ip, valid)
  return true
}

export function getRequiredEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} not configured`)
  return v
}