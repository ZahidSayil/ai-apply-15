import process from 'node:process'
import axios from 'axios'
import { checkRateLimit, sendJson, setCors } from './_utils.js'

// ── Qwen models (text-only) ───────────────────────
const QWEN_MODELS = [
  'qwen-plus',
  'qwen-turbo',
  'qwen-max',
]
let qwenModelIndex = 0

function getNextQwenModel() {
  const model = QWEN_MODELS[qwenModelIndex]
  qwenModelIndex = (qwenModelIndex + 1) % QWEN_MODELS.length
  return model
}

// ── Strip <think> tags, markdown fences, find JSON ──
function cleanAIResponse(raw) {
  let cleaned = raw

  // Remove <think>...</think> blocks (Qwen 3.x)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '')

  // Remove markdown code fences
  cleaned = cleaned.replace(/```json\s*/gi, '')
  cleaned = cleaned.replace(/```\s*/g, '')

  cleaned = cleaned.trim()

  // Extract the JSON object between first { and last }
  const jsonStart = cleaned.indexOf('{')
  const jsonEnd = cleaned.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1)
  }

  return cleaned
}

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests.' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  const { resumeText, jobText } = req.body || {}
  if (!resumeText || !jobText) {
    return sendJson(res, 400, { error: 'resumeText and jobText required' })
  }

  const trimmedResume = resumeText.slice(0, 3000).replace(/[<>]/g, '')
  const trimmedJob = jobText.slice(0, 2000).replace(/[<>]/g, '')

  const prompt = `You are an expert professional resume writer. Tailor this resume for the job.

ORIGINAL RESUME:
${trimmedResume}

TARGET JOB DESCRIPTION:
${trimmedJob}

RULES:
- Extract real data from the resume — never invent or use placeholders
- Rewrite bullets to match job keywords and show measurable impact
- Tailor the summary specifically to this job
- The "title" field must be a professional headline, NOT the exact job title being applied for
- Cover letter must use candidate's real name and real experience — no placeholders like [Company Name]
- Return ONLY valid JSON — no markdown, no backticks, no extra text, no thinking

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
    "title": "Professional headline combining real expertise with relevance to target role — never just copy the job title",
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

  const systemMsg = 'You are an expert resume writer. Return ONLY valid JSON. No markdown, no backticks, no thinking, no explanation. Start your response with { and end with }.'

  let raw = null
  let usedModel = ''

  // ── Attempt 1: Qwen (rotate 3 models) ───────────
  if (process.env.QWEN_API_KEY) {
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

        const requestBody = {
          model,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: prompt },
          ],
          max_tokens: 8000,
          temperature: 0.7,
        }

        // Disable thinking for Qwen 3.x models
        if (model.startsWith('qwen3')) {
          requestBody.extra_body = { enable_thinking: false }
        }

        const r = await axios.post(
          'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
          requestBody,
          {
            headers: {
              Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 50000,
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
        { timeout: 50000 }
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
    return sendJson(res, 500, { error: 'All AI models are currently unavailable. Please try again shortly.' })
  }

  // ── Parse JSON (robust) ──────────────────────────
  try {
    console.log('📦 Raw (first 200):', raw.slice(0, 200))
    const cleaned = cleanAIResponse(raw)
    console.log('🧹 Cleaned (first 200):', cleaned.slice(0, 200))

    const result = JSON.parse(cleaned)

    if (!result.resume || typeof result.resume !== 'object') {
      throw new Error('Missing resume object in response')
    }

    console.log(`✅ Parsed via ${usedModel} | score: ${result.matchScore} | name: ${result.resume.name}`)
    return sendJson(res, 200, { ...result, _model: usedModel })
  } catch (parseErr) {
    console.error('❌ JSON parse failed:', parseErr.message)
    console.error('Raw (first 500):', raw.slice(0, 500))

    // Regex fallback extraction
    const s = (p) => { const m = raw.match(p); return m ? m[1] : null }

    const extractJsonArray = (key) => {
      const regex = new RegExp(`"${key}"\\s*:\\s*\$$([^\$$]+)\\]`)
      const match = raw.match(regex)
      if (!match) return []
      try { return JSON.parse(`[${match[1]}]`) } catch { return [] }
    }

    return sendJson(res, 200, {
      matchScore: parseInt(s(/"matchScore"\s*:\s*(\d+)/)) || 70,
      matchLabel: s(/"matchLabel"\s*:\s*"([^"]+)"/) || 'Good Match',
      matchReason: s(/"matchReason"\s*:\s*"([^"]+)"/) || 'Your experience aligns with this role.',
      changes: extractJsonArray('changes').length ? extractJsonArray('changes') : ['Resume optimized', 'Keywords aligned', 'Experience highlighted'],
      resumeTips: extractJsonArray('resumeTips').length ? extractJsonArray('resumeTips') : ['Quantify achievements', 'Add job keywords', 'Lead with relevant experience'],
      coverLetter: s(/"coverLetter"\s*:\s*"([\s\S]*?)(?:"\s*[,}])/) || 'Cover letter generation failed. Please try again.',
      resume: {
        name: s(/"name"\s*:\s*"([^"]+)"/) || 'Your Name',
        title: s(/"title"\s*:\s*"([^"]+)"/) || '',
        email: s(/"email"\s*:\s*"([^"]*)"/) || '',
        phone: s(/"phone"\s*:\s*"([^"]*)"/) || '',
        location: s(/"location"\s*:\s*"([^"]*)"/) || '',
        linkedin: s(/"linkedin"\s*:\s*"([^"]*)"/) || '',
        summary: s(/"summary"\s*:\s*"([^"]+)"/) || 'Experienced professional.',
        experience: [],
        education: [],
        skills: extractJsonArray('skills'),
      },
      _model: usedModel,
      _fallback: true,
    })
  }
}