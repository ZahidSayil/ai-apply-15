import axios from 'axios'
import { checkRateLimit, readJson, sendJson, getRequiredEnv } from './_utils.js'

export default async function handler(req, res) {
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests. Please try again later.' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  let body
  try {
    body = await readJson(req)
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' })
  }

  const url = body?.url
  if (!url) return sendJson(res, 400, { error: 'URL required' })

  try {
    const jinaKey = getRequiredEnv('JINA_API_KEY')
    const jinaUrl = `https://r.jina.ai/${url}`
    const response = await axios.get(jinaUrl, {
      headers: {
        Authorization: `Bearer ${jinaKey}`,
        Accept: 'text/plain',
        'X-Timeout': '10',
      },
      timeout: 12_000,
    })

    const text = response.data
    const isBlocked =
      text.includes('CAPTCHA') ||
      text.includes('not yet fully loaded') ||
      text.includes('404 error') ||
      text.length < 300

    if (!isBlocked) {
      return sendJson(res, 200, { jobText: text.slice(0, 4000), source: 'scraped' })
    }

    return sendJson(res, 200, {
      jobText: null,
      source: 'blocked',
      message: 'This job site blocks scrapers. Please paste the job description instead.',
    })
  } catch (err) {
    // Treat failures as "blocked" so the UI can fall back to paste mode.
    return sendJson(res, 200, {
      jobText: null,
      source: 'blocked',
      message: 'Could not fetch job. Please paste the description instead.',
      detail: err?.message,
    })
  }
}

