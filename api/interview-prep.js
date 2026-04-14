import process from 'node:process'
import axios from 'axios'
import { checkRateLimit, sendJson, setCors } from './_utils.js'

const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'qwen-3-235b-a22b-instruct-2507'
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

const SYSTEM_MSG = 'Return one valid JSON object only. No markdown, no backticks, no extra text.'

function cleanAIResponse(raw) {
  let cleaned = raw
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '')
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
  cleaned = cleaned.replace(/```json\s*/gi, '')
  cleaned = cleaned.replace(/```\s*/g, '')
  cleaned = cleaned.trim()

  const jsonStart = cleaned.indexOf('{')
  const jsonEnd = cleaned.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1)
  }
  return cleaned
}

function buildInterviewPrompt(resumeText, jobText) {
  const resume = resumeText.slice(0, 6000)
  const job = jobText.slice(0, 4000)

  return `You are an expert interview coach. Based on this resume and job description, generate the most likely interview questions the candidate will face.

RESUME (summary):
${resume}

JOB DESCRIPTION:
${job}

Generate exactly 6-8 interview questions. For each question, provide:
- "question": The exact question the interviewer would ask
- "why": One sentence explaining why they'd ask this (what gap or skill they're probing)
- "answerHint": 2-3 bullet points the candidate should mention, using SPECIFIC facts from their resume

Return JSON: { "questions": [ { "question", "why", "answerHint" } ] }

Rules:
- Mix behavioral ("Tell me about a time..."), technical, and situational questions
- At least 2 questions should target GAPS between the resume and job requirements
- Use the candidate's real experience in answer hints — never generic advice
- Include one question about their motivation for this specific role`
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

  const prompt = buildInterviewPrompt(resumeText, jobText)
  let raw = null
  let usedModel = ''

  if (process.env.CEREBRAS_API_KEY) {
    try {
      console.log('[interview] Trying Cerebras...')
      const r = await axios.post(
        'https://api.cerebras.ai/v1/chat/completions',
        {
          model: CEREBRAS_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_MSG },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.6,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      )
      raw = r.data.choices[0].message.content
      usedModel = `cerebras:${CEREBRAS_MODEL}`
      console.log(`[interview] Cerebras OK, length: ${raw.length}`)
    } catch (e) {
      console.warn('[interview] Cerebras failed:', e.response?.data?.message || e.response?.data?.error?.message || e.message)
    }
  }

  if (!raw && process.env.GROQ_API_KEY) {
    try {
      console.log('[interview] Trying Groq...')
      const r = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_MSG },
            { role: 'user', content: prompt },
          ],
          max_tokens: 3500,
          temperature: 0.6,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      )
      raw = r.data.choices[0].message.content
      usedModel = `groq:${GROQ_MODEL}`
      console.log('[interview] Groq OK, length:', raw.length)
    } catch (e) {
      console.warn('[interview] Groq failed:', e.response?.data?.error?.message || e.message)
    }
  }

  if (!raw && process.env.GEMINI_API_KEY) {
    try {
      console.log('[interview] Trying Gemini...')
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: `${SYSTEM_MSG}\n\n${prompt}` }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        },
        { timeout: 60000 }
      )
      raw = r.data.candidates[0].content.parts[0].text
      usedModel = 'gemini-2.0-flash'
      console.log('[interview] Gemini OK, length:', raw.length)
    } catch (e) {
      console.warn('[interview] Gemini failed:', e.response?.data?.error?.message || e.message)
    }
  }

  if (!raw) {
    return sendJson(res, 500, { error: 'All AI models are currently unavailable. Please try again shortly.' })
  }

  try {
    const cleaned = cleanAIResponse(raw)
    const parsed = JSON.parse(cleaned)
    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    console.log(`[interview] OK via ${usedModel} | ${questions.length} questions`)
    return sendJson(res, 200, { questions, _model: usedModel })
  } catch (parseErr) {
    console.error('[interview] JSON parse failed:', parseErr.message)
    return sendJson(res, 500, { error: 'Failed to parse interview questions. Try again.' })
  }
}
