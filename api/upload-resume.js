/* eslint-disable no-undef */
import formidable from 'formidable'
import fs from 'node:fs/promises'
import pdfParse from 'pdf-parse'
import { checkRateLimit, sendJson, setCors } from './_utils.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

function parseForm(req) {
  const form = formidable({ multiples: false, maxFileSize: 10 * 1024 * 1024 })
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err)
      resolve({ fields, files })
    })
  })
}

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  try {
    const { files } = await parseForm(req)
    const file = files?.resume
    const uploaded = Array.isArray(file) ? file[0] : file

    if (!uploaded) return sendJson(res, 400, { error: 'No file uploaded' })
    if (uploaded.mimetype !== 'application/pdf') {
      return sendJson(res, 400, { error: 'Please upload a PDF file' })
    }

    const buffer = await fs.readFile(uploaded.filepath)
    const header = buffer.subarray(0, 4).toString('utf8')
    if (header !== '%PDF') {
      return sendJson(res, 400, {
        error: 'Invalid PDF file',
        hint: 'Try re-exporting your resume as a standard PDF.',
      })
    }

    const data = await pdfParse(buffer)
    if (!data.text || data.text.trim().length === 0) {
      return sendJson(res, 400, { error: 'PDF has no readable text.' })
    }

    // Clean up temp file
    try { await fs.unlink(uploaded.filepath) } catch { /* ignore */ }

    return sendJson(res, 200, { resumeText: data.text.slice(0, 5000) })
  } catch (err) {
    const msg = (err?.message || '').toLowerCase()
    return sendJson(res, 500, {
      error: 'Failed to parse PDF',
      hint: msg.includes('xref')
        ? 'Your PDF may be malformed. Try: Print → Save as PDF, then re-upload.'
        : 'Make sure your PDF contains selectable text.',
    })
  }
}