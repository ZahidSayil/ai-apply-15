import process from 'node:process'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import formidable from 'formidable'
import fs from 'node:fs/promises'
import pdfParse from 'pdf-parse'
import axios from 'axios'

import analyzeHandler from '../api/analyze.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// ── Startup ────────────────────────────────────────
console.log('')
console.log('API Keys loaded:')
const keyNames = ['JINA_API_KEY', 'CEREBRAS_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY']
keyNames.forEach(k => {
  console.log(`  ${k}: ${process.env[k] ? 'YES' : 'MISSING'}`)
})
console.log('')
console.log('LLM priority: 1) Cerebras  2) Groq  3) Gemini')
console.log('')

// ═══════════════════════════════════════════════════
// POST /upload-resume
// ═══════════════════════════════════════════════════
app.post('/upload-resume', async (req, res) => {
  try {
    const form = formidable({ multiples: false, maxFileSize: 10 * 1024 * 1024 })

    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err)
        resolve({ fields, files })
      })
    })

    const file = files?.resume
    const uploaded = Array.isArray(file) ? file[0] : file
    if (!uploaded) return res.status(400).json({ error: 'No file uploaded' })

    const name = uploaded.originalFilename || uploaded.newFilename || 'unknown'
    console.log(`[upload] Parsing PDF: ${name} (${uploaded.size} bytes)`)

    if (uploaded.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Please upload a PDF file' })
    }

    const buffer = await fs.readFile(uploaded.filepath)
    const header = buffer.subarray(0, 4).toString('utf8')
    if (header !== '%PDF') {
      return res.status(400).json({ error: 'Invalid PDF file' })
    }

    const data = await pdfParse(buffer)
    if (!data.text || data.text.trim().length === 0) {
      return res.status(400).json({ error: 'PDF has no readable text.' })
    }

    try { await fs.unlink(uploaded.filepath) } catch { /* ignore */ }

    const maxChars = Math.min(Number(process.env.UPLOAD_RESUME_MAX_CHARS) || 60000, 80000)
    console.log(`[upload] PDF parsed, extracted ${data.text.length} characters (sending ${Math.min(data.text.length, maxChars)})`)
    res.json({ resumeText: data.text.slice(0, maxChars) })
  } catch (err) {
    console.error('[upload] Error:', err.message)
    const msg = (err?.message || '').toLowerCase()
    res.status(500).json({
      error: 'Failed to parse PDF',
      detail: err.message,
      hint: msg.includes('xref')
        ? 'Your PDF may be malformed. Try: Print → Save as PDF, then re-upload.'
        : 'Make sure your PDF contains selectable text.',
    })
  }
})

// ═══════════════════════════════════════════════════
// POST /scrape
// ═══════════════════════════════════════════════════
app.post('/scrape', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL required' })

  const jinaKey = process.env.JINA_API_KEY
  if (!jinaKey) {
    return res.json({
      jobText: null,
      source: 'blocked',
      message: 'JINA_API_KEY not configured. Please paste the job description.',
    })
  }

  try {
    console.log(`[scrape] ${url}`)
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
      console.log(`[scrape] OK, ${text.length} chars`)
      return res.json({ jobText: text.slice(0, 8000), source: 'scraped' })
    }

    console.log('[scrape] Site appears blocked')
    res.json({ jobText: null, source: 'blocked', message: 'Site blocks scrapers. Paste description instead.' })
  } catch (err) {
    console.log('[scrape] Failed:', err.message)
    res.json({ jobText: null, source: 'blocked', message: 'Could not fetch. Paste description instead.' })
  }
})

// ═══════════════════════════════════════════════════
// POST /analyze — delegates to api/analyze.js (single source of truth)
// ═══════════════════════════════════════════════════
app.post('/analyze', (req, res) => {
  return analyzeHandler(req, res)
})

// ═══════════════════════════════════════════════════
// GET /health
// ═══════════════════════════════════════════════════
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ═══════════════════════════════════════════════════
// Start
// ═══════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`)
  console.log('')
})
