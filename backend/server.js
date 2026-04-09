import process from 'node:process'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import formidable from 'formidable'
import fs from 'node:fs/promises'
import pdfParse from 'pdf-parse'
import axios from 'axios'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// ── Qwen model rotation ───────────────────────────
const QWEN_MODELS = [
  'qwen-plus',
  'qwen3.5-122b-a10b',
  'qvq-max-2025-03-25',
]
let qwenModelIndex = 0

function getNextQwenModel() {
  const model = QWEN_MODELS[qwenModelIndex]
  qwenModelIndex = (qwenModelIndex + 1) % QWEN_MODELS.length
  return model
}

// ── Startup ────────────────────────────────────────
console.log('')
console.log('🔑 API Keys loaded:')
const keyNames = ['JINA_API_KEY', 'QWEN_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY']
keyNames.forEach(k => {
  console.log(`  ${k}: ${process.env[k] ? '✓ Loaded' : '✗ Missing'}`)
})
console.log('')
console.log('🤖 LLM Strategy:')
console.log(`  PRIMARY: Qwen (Rotating: ${QWEN_MODELS.join(', ')})`)
if (process.env.GEMINI_API_KEY) console.log('  FALLBACK 1: Gemini 2.0 Flash')
if (process.env.GROQ_API_KEY) console.log('  FALLBACK 2: Groq (Llama 3.3 70B)')
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
    console.log(`📄 Parsing PDF: ${name} (${uploaded.size} bytes)`)

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

    console.log(`✅ PDF parsed, extracted ${data.text.length} characters`)
    res.json({ resumeText: data.text.slice(0, 5000) })
  } catch (err) {
    console.error('❌ Upload error:', err.message)
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
    console.log(`🔗 Scraping: ${url}`)
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
      console.log(`✅ Scraped ${text.length} chars`)
      return res.json({ jobText: text.slice(0, 4000), source: 'scraped' })
    }

    console.log('⚠️ Site appears blocked')
    res.json({ jobText: null, source: 'blocked', message: 'Site blocks scrapers. Paste description instead.' })
  } catch (err) {
    console.log('⚠️ Scrape failed:', err.message)
    res.json({ jobText: null, source: 'blocked', message: 'Could not fetch. Paste description instead.' })
  }
})

// ═══════════════════════════════════════════════════
// POST /analyze
// ═══════════════════════════════════════════════════
app.post('/analyze', async (req, res) => {
  const { resumeText, jobText } = req.body
  if (!resumeText || !jobText) {
    return res.status(400).json({ error: 'resumeText and jobText required' })
  }

  const trimmedResume = resumeText.slice(0, 3000)
  const trimmedJob = jobText.slice(0, 2000)

  const prompt = `You are an expert professional resume writer. Tailor this resume for the job.

ORIGINAL RESUME:
${trimmedResume}

TARGET JOB DESCRIPTION:
${trimmedJob}

RULES:
- Extract real data from the resume — never invent or use placeholders
- Rewrite bullets to match job keywords and show measurable impact
- Tailor the summary specifically to this job
- Cover letter must use candidate's real name and real experience — no placeholders like [Company Name]
- The "title" field must be a professional headline, NOT the exact job title being applied for
- Return ONLY valid JSON — no markdown, no backticks, no extra text

Return this exact JSON structure:
{
  "matchScore": 82,
  "matchLabel": "Strong Match",
  "matchReason": "One specific sentence explaining the score.",
  "changes": [
    "Specific change 1 made to resume",
    "Specific change 2 made to resume",
    "Specific change 3 made to resume"
  ],
  "resumeTips": [
    "Specific actionable tip for this role",
    "Specific actionable tip for this role",
    "Specific actionable tip for this role"
  ],
  "coverLetter": "Full ready-to-send cover letter using candidate real name and experience. No placeholders whatsoever.",
  "resume": {
    "name": "Extracted full name from resume",
    "title": "Professional headline combining their real expertise with relevance to target role (e.g. 'Certified Project Manager | Agile & Operations Specialist') — never just copy the job title",
    "email": "Extracted email or empty string",
    "phone": "Extracted phone or empty string",
    "location": "Extracted location or empty string",
    "linkedin": "Extracted LinkedIn URL or empty string",
    "summary": "2-3 sentence professional summary rewritten to match this job description keywords and requirements",
    "experience": [
      {
        "company": "Real company name from resume",
        "role": "Real job title from resume",
        "duration": "Date range from resume",
        "bullets": [
          "Rewritten achievement bullet with metrics and job keywords",
          "Rewritten achievement bullet with metrics and job keywords",
          "Rewritten achievement bullet with metrics and job keywords"
        ]
      }
    ],
    "education": [
      {
        "institution": "Real institution name",
        "degree": "Real degree and field",
        "year": "Graduation year"
      }
    ],
    "skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5", "Skill 6", "Skill 7", "Skill 8"]
  }
}`

  const systemMsg = 'You are an expert resume writer. Always return valid JSON only. No markdown, no backticks, no explanation.'

  let raw = null
  let usedModel = ''

  // ── Attempt 1: Qwen (rotate through 3 models) ───
  if (process.env.QWEN_API_KEY) {
    // Start from current rotation index
    const startModel = getNextQwenModel()
    const startIdx = QWEN_MODELS.indexOf(startModel)
    const ordered = [
      ...QWEN_MODELS.slice(startIdx),
      ...QWEN_MODELS.slice(0, startIdx),
    ]

    for (const model of ordered) {
      if (raw) break
      try {
        console.log(`🤖 Trying Qwen (${model})...`)
        const r = await axios.post(
          'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
          {
            model,
            messages: [
              { role: 'system', content: systemMsg },
              { role: 'user', content: prompt },
            ],
            max_tokens: 8000,
            temperature: 0.7,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 45000,
          }
        )
        raw = r.data.choices[0].message.content
        usedModel = model
        console.log(`✅ Qwen (${model}) responded, length: ${raw.length}`)
      } catch (e) {
        console.warn(`⚠️ Qwen (${model}) failed:`, e.response?.data?.message || e.message)
      }
    }
  }

  // ── Attempt 2: Gemini ────────────────────────────
  if (!raw && process.env.GEMINI_API_KEY) {
    try {
      console.log('🤖 Trying Gemini...')
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: `${systemMsg}\n\n${prompt}` }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8000,
            responseMimeType: 'application/json',
          },
        },
        { timeout: 45000 }
      )
      raw = r.data.candidates[0].content.parts[0].text
      usedModel = 'gemini-2.0-flash'
      console.log('✅ Gemini responded, length:', raw.length)
    } catch (e) {
      console.warn('⚠️ Gemini failed:', e.response?.data?.error?.message || e.message)
    }
  }

  // ── Attempt 3: Groq (last resort) ───────────────
  if (!raw && process.env.GROQ_API_KEY) {
    try {
      console.log('🤖 Trying Groq...')
      const r = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: prompt },
          ],
          max_tokens: 8000,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      )
      raw = r.data.choices[0].message.content
      usedModel = 'groq-llama-3.3-70b'
      console.log('✅ Groq responded, length:', raw.length)
    } catch (e) {
      console.warn('⚠️ Groq failed:', e.response?.data?.error?.message || e.message)
    }
  }

  // ── All failed ───────────────────────────────────
  if (!raw) {
    console.error('❌ All AI models failed')
    return res.status(500).json({ error: 'All AI models failed. Check API keys.' })
  }

  // ── Parse JSON ───────────────────────────────────
  try {
    const clean = raw.replace(/```json\s?|```/g, '').trim()
    const result = JSON.parse(clean)
    console.log(`✅ Parsed via ${usedModel} | score: ${result.matchScore}`)
    res.json({ ...result, _model: usedModel })
  } catch (parseErr) {
    console.error('❌ JSON parse failed:', parseErr.message)
    console.error('Raw (first 500):', raw.slice(0, 500))
    const s = (p) => { const m = raw.match(p); return m ? m[1] : null }
    res.json({
      matchScore: parseInt(s(/"matchScore"\s*:\s*(\d+)/)) || 70,
      matchLabel: s(/"matchLabel"\s*:\s*"([^"]+)"/) || 'Good Match',
      matchReason: s(/"matchReason"\s*:\s*"([^"]+)"/) || 'Your experience aligns with this role.',
      changes: ['Resume keywords optimized', 'Experience reordered', 'Skills tailored'],
      resumeTips: ['Quantify achievements', 'Add job keywords', 'Lead with relevant experience'],
      coverLetter: 'Dear Hiring Manager,\n\nI am excited to apply.\n\nBest regards',
      resume: {
        name: s(/"name"\s*:\s*"([^"]+)"/) || 'Your Name',
        title: '', email: '', phone: '', location: '', linkedin: '',
        summary: 'Experienced professional with relevant skills.',
        experience: [], education: [], skills: [],
      },
      _model: usedModel,
      _fallback: true,
    })
  }
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
  console.log(`✅ ApplyAI backend running on port ${PORT}`)
  console.log('')
})