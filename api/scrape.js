/* eslint-disable no-unused-vars */
import process from 'node:process'
import axios from 'axios'
import { checkRateLimit, readJson, sendJson, setCors } from './_utils.js'

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  let body
  try {
    body = await readJson(req)
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' })
  }

  const url = body?.url
  if (!url) return sendJson(res, 400, { error: 'URL required' })

  // Basic URL validation
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return sendJson(res, 400, { error: 'Invalid URL. Must start with http:// or https://' })
    }
  } catch {
    return sendJson(res, 400, { error: 'Invalid URL format' })
  }

  const jinaKey = process.env.JINA_API_KEY
  if (!jinaKey) {
    return sendJson(res, 200, {
      jobText: null,
      source: 'blocked',
      message: 'URL scraping not available. Please paste the job description instead.',
    })
  }

  try {
    const response = await axios.get(`https://r.jina.ai/${url}`, {
      headers: {
        Authorization: `Bearer ${jinaKey}`,
        Accept: 'text/plain',
        'X-Timeout': '10',
      },
      timeout: 12000,
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
    return sendJson(res, 200, {
      jobText: null,
      source: 'blocked',
      message: 'Could not fetch job. Please paste the description instead.',
    })
  }
}