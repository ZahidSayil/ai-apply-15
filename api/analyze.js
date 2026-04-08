import axios from 'axios'
import process from 'process'
import { checkRateLimit, readJson, sendJson, getRequiredEnv } from './_utils.js'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeAnalyzeResult(result, { trimmedResume }) {
  let r = result
  if (typeof r === 'string') {
    try {
      r = JSON.parse(r)
    } catch {
      // keep string
    }
  }

  for (const key of ['tailoredResume', 'coverLetter']) {
    if (typeof r?.[key] === 'string' && r[key].trim().startsWith('{')) {
      try {
        r[key] = JSON.parse(r[key])
      } catch {
        // ignore
      }
    }
  }

  const toText = (v) => {
    if (typeof v === 'string') return v
    if (v == null) return ''
    if (typeof v === 'object') return JSON.stringify(v, null, 2)
    return String(v)
  }

  const toArray = (v) => {
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : toText(x))).filter(Boolean)
    if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean)
    return []
  }

  return {
    matchScore: Number.isFinite(r?.matchScore) ? r.matchScore : parseInt(r?.matchScore, 10) || 75,
    matchLabel: typeof r?.matchLabel === 'string' ? r.matchLabel : 'Good Match',
    matchReason: typeof r?.matchReason === 'string' ? r.matchReason : 'Your experience aligns with key job requirements.',
    tailoredResume: toText(r?.tailoredResume).slice(0, 4000) || trimmedResume.slice(0, 800),
    coverLetter: toText(r?.coverLetter).slice(0, 2000),
    changes: toArray(r?.changes).slice(0, 10),
    resumeTips: toArray(r?.resumeTips).slice(0, 10),
  }
}

async function callGroq({ groqKey, prompt }) {
  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert professional resume writer. Return ONLY valid JSON. No markdown. No backticks. No extra text.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    },
    {
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  )

  const raw = response.data?.choices?.[0]?.message?.content || ''
  // Some models occasionally wrap in fences; strip just in case.
  return raw.replace(/```json|```/g, '').trim()
}

async function callQwen({ qwenKey, prompt }) {
  const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  const response = await axios.post(
    url,
    {
      model: process.env.QWEN_MODEL || 'qwen3.6-plus',
      messages: [
        { role: 'system', content: 'Return ONLY valid JSON. No markdown. No backticks. No extra text.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    },
    {
      headers: {
        Authorization: `Bearer ${qwenKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  )

  const raw = response.data?.choices?.[0]?.message?.content || ''
  return raw.replace(/```json|```/g, '').trim()
}

export default async function handler(req, res) {
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests. Please try again later.' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  let body
  try {
    body = await readJson(req)
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' })
  }

  const resumeText = body?.resumeText
  const jobText = body?.jobText
  if (!resumeText || !jobText) return sendJson(res, 400, { error: 'resumeText and jobText required' })

  // Trim inputs to avoid token overflow
  const trimmedResume = resumeText.slice(0, 3000)
  const trimmedJob = jobText.slice(0, 2000)

  const prompt = `You are an expert professional resume writer. Your task is to tailor a resume for a specific job.

ORIGINAL RESUME:
${trimmedResume}

TARGET JOB DESCRIPTION:
${trimmedJob}

TASK: Create a professionally tailored version that highlights relevant skills and achievements.

CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON - no markdown, backticks, or extra text
2. matchScore: 0-100 integer rating how well resume matches the job
3. matchLabel: "Excellent Match", "Strong Match", "Good Match", or "Fair Match"
4. matchReason: 1 sentence explaining the match
5. tailoredResume: Complete professional resume (800-1000 chars) with name, summary, and key sections rewritten to match job requirements. Make it ready-to-use.
6. changes: Array of 3-5 specific changes made to tailor the resume
7. coverLetter: Professional cover letter (400-600 chars) ready to send
8. resumeTips: Array of 3-5 actionable tips for this specific role

Return EXACTLY this JSON structure:
{
  "matchScore": 82,
  "matchLabel": "Strong Match",
  "matchReason": "Your experience directly aligns with the core requirements.",
  "tailoredResume": "FULL PROFESSIONAL RESUME HERE - Include summary highlighting relevant skills, experience section with accomplishments matching job keywords, skills section tailored to job requirements",
  "changes": ["Emphasized leadership experience matching job requirements", "Highlighted quantifiable achievements in target technologies", "Reordered experience sections by job relevance", "Added industry-specific keywords from job description", "Strengthened metrics and impact statements"],
  "coverLetter": "FULL PROFESSIONAL COVER LETTER - Personalized greeting, paragraph explaining fit for role, paragraph showing understanding of company/role, closing with call to action",
  "resumeTips": ["Use exact keywords from the job description", "Quantify all achievements with metrics", "Lead with most relevant experience", "Highlight team leadership and impact", "Include technologies/tools matching job requirements"]
}`

  try {
    let clean = null

    // 1) Try Qwen first (primary)
    try {
      const qwenKey = process.env.QWEN_API_KEY || getRequiredEnv('DASHSCOPE_API_KEY')

      // Retry on transient overloads (429/5xx/timeouts).
      const backoffs = [0, 800, 1600, 2500]
      let lastErr
      for (const wait of backoffs) {
        if (wait) await sleep(wait)
        try {
          clean = await callQwen({ qwenKey, prompt })
          lastErr = null
          break
        } catch (e) {
          lastErr = e
          const status = e?.response?.status
          const msg = e?.response?.data?.error?.message || e?.message || ''
          const isOverload = status === 429 || status === 503 || status >= 500 || msg.toLowerCase().includes('timeout')
          if (!isOverload) break
        }
      }
      if (!clean) throw lastErr
    } catch (qwenErr) {
      // 2) Fallback to Groq if configured
      const groqKey = process.env.GROQ_API_KEY
      if (!groqKey) throw qwenErr
      clean = await callGroq({ groqKey, prompt })
    }

    try {
      const result = JSON.parse(clean)
      return sendJson(res, 200, normalizeAnalyzeResult(result, { trimmedResume }))
    } catch (parseErr) {
      // Fallback extraction (mirrors previous backend behavior)
      const scoreMatch = clean.match(/"matchScore"\s*:\s*(\d+)/)
      const labelMatch = clean.match(/"matchLabel"\s*:\s*"([^"]+)"/)
      const reasonMatch = clean.match(/"matchReason"\s*:\s*"([^"]*?)"/)
      const tailoredMatch = clean.match(/"tailoredResume"\s*:\s*"([\s\S]*?)(?<!\\)"\s*,/)
      const coverMatch = clean.match(/"coverLetter"\s*:\s*"([\s\S]*?)(?<!\\)"\s*,/)
      const changesMatch = clean.match(/"changes"\s*:\s*\[([\s\S]*?)\]/)
      const tipsMatch = clean.match(/"resumeTips"\s*:\s*\[([\s\S]*?)\]/)

      const extractArray = (str) => {
        if (!str) return []
        return str
          .split(',')
          .map((s) => s.trim().replace(/^"|"$/g, '').slice(0, 200))
          .filter((s) => s.length > 0)
      }

      const fallback = {
        matchScore: scoreMatch ? parseInt(scoreMatch[1], 10) : 75,
        matchLabel: labelMatch ? labelMatch[1] : 'Good Match',
        matchReason: reasonMatch ? reasonMatch[1] : 'Your experience aligns with key job requirements.',
        tailoredResume: tailoredMatch
          ? tailoredMatch[1].slice(0, 1000)
          : `${trimmedResume.slice(0, 800)}\n\n[Your resume tailored for this role - key keywords and achievements highlighted to match job description]`,
        changes: extractArray(
          changesMatch ? changesMatch[1] : 'Keywords optimized, Experience reordered, Skills highlighted, Impact statements added, Technical skills emphasized',
        ),
        coverLetter: coverMatch
          ? coverMatch[1].slice(0, 600)
          : 'Dear Hiring Manager,\n\nI am excited to apply for this position. My background in [key skill] and experience with [relevant tech] make me a strong fit. I am confident I can contribute significantly to your team.\n\nBest regards',
        resumeTips: extractArray(
          tipsMatch ? tipsMatch[1] : 'Use exact job keywords, Quantify achievements, Lead with relevant experience, Highlight specific technologies, Show impact with metrics',
        ),
        parseError: parseErr?.message,
      }

      return sendJson(res, 200, normalizeAnalyzeResult(fallback, { trimmedResume }))
    }
  } catch (err) {
    return sendJson(res, 500, {
      error: 'AI analysis failed',
      detail: err?.response?.data?.error?.message || err?.message || String(err),
    })
  }
}

