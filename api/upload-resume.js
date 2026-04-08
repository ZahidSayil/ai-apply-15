import formidable from 'formidable'
import fs from 'fs/promises'
import pdfParse from 'pdf-parse'
import { checkRateLimit, sendJson } from './_utils.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

function parseForm(req) {
  const form = formidable({
    multiples: false,
    maxFileSize: 10 * 1024 * 1024, // 10MB
  })
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err)
      resolve({ fields, files })
    })
  })
}

export default async function handler(req, res) {
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests. Please try again later.' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  try {
    const { files } = await parseForm(req)
    const file = files?.resume
    const uploaded = Array.isArray(file) ? file[0] : file

    if (!uploaded) return sendJson(res, 400, { error: 'No file uploaded' })
    if (uploaded.mimetype !== 'application/pdf') return sendJson(res, 400, { error: 'Please upload a PDF file' })

    const buffer = await fs.readFile(uploaded.filepath)
    const header = buffer.subarray(0, 4).toString('utf8')
    if (header !== '%PDF') {
      return sendJson(res, 400, {
        error: 'Invalid PDF file',
        hint: 'This file does not look like a valid PDF. Try re-exporting your resume as a standard PDF.',
      })
    }

    const data = await pdfParse(buffer)

    if (!data.text || data.text.trim().length === 0) {
      return sendJson(res, 400, { error: 'PDF has no readable text. Please upload a different file.' })
    }

    return sendJson(res, 200, { resumeText: data.text.slice(0, 5000) })
  } catch (err) {
    const msg = (err?.message || '').toLowerCase()
    const isXref = msg.includes('xref')
    return sendJson(res, 500, {
      error: 'Failed to parse PDF',
      detail: err?.message || String(err),
      hint: isXref
        ? 'Your PDF appears to be malformed (XRef table issue). Try: open it and "Print" → "Save as PDF", or export again from Google Docs/Word/Canva. Then re-upload.'
        : 'Make sure your PDF contains selectable text (not just images).',
    })
  }
}

