import process from 'node:process'
import axios from 'axios'
import { checkRateLimit, sendJson, setCors } from './_utils.js'

const MAX_RESUME_CHARS = Math.min(
  Number(process.env.ANALYZE_MAX_RESUME_CHARS) || 14000,
  20000
)
const MAX_JOB_CHARS = Math.min(
  Number(process.env.ANALYZE_MAX_JOB_CHARS) || 3200,
  8000
)

const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'qwen-3-235b-a22b-instruct-2507'
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

function outputTokenBudget({ includeCoverLetter, depthMode }) {
  const detailed = depthMode === 'detailed'
  const base = includeCoverLetter
    ? { cerebras: 8192, gemini: 6144, groq: 5120 }
    : detailed
      ? { cerebras: 8192, gemini: 5120, groq: 4096 }
      : { cerebras: 8192, gemini: 5500, groq: 4200 }
  return {
    cerebras: Math.min(Number(process.env.CEREBRAS_MAX_OUTPUT_TOKENS) || base.cerebras, 16000),
    gemini: Math.min(Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || base.gemini, 8192),
    groq: Math.min(Number(process.env.GROQ_MAX_OUTPUT_TOKENS) || base.groq, 8192),
  }
}

function trimJobHeadTail(text, maxChars) {
  const t = text.trim()
  if (t.length <= maxChars) return t
  const sep = '\n\n[...]\n\n'
  const budget = maxChars - sep.length
  const headLen = Math.floor(budget * 0.58)
  const tailLen = budget - headLen
  return `${t.slice(0, headLen)}${sep}${t.slice(-tailLen)}`
}

function trimResumeHeadTail(text, maxChars) {
  const t = text.trim()
  if (t.length <= maxChars) return t
  const sep =
    '\n\n[... middle of resume omitted for length; education/certs/languages are often below — read this tail ...]\n\n'
  const budget = maxChars - sep.length
  const headLen = Math.floor(budget * 0.42)
  const tailLen = budget - headLen
  return `${t.slice(0, headLen)}${sep}${t.slice(-tailLen)}`
}

// ── Section-based resume parser ──────────────────
const SECTION_HEADERS = {
  education: /^(education|academic\s*(background|qualifications?)|degrees?|qualifications?)\s*:?\s*$/i,
  certifications: /^(certifications?|certificates?|professional\s*certifications?)\s*:?\s*$/i,
  trainings: /^(trainings?\s*(&|and)?\s*workshops?|workshops?\s*(&|and)?\s*trainings?|professional\s*development|trainings?)\s*:?\s*$/i,
  languages: /^(languages?|language\s*(skills?|proficiency)?)\s*:?\s*$/i,
  licenses: /^(licenses?|professional\s*licenses?)\s*:?\s*$/i,
  skills: /^(skills?|core\s*skills?|key\s*skills?|competenc(?:ies|es)|technical\s*skills?)\s*:?\s*$/i,
  experience: /^(experience|work\s*experience|professional\s*experience|employment\s*history)\s*:?\s*$/i,
  summary: /^(summary|professional\s*summary|profile|objective|about)\s*:?\s*$/i,
}

function isAnySectionHeader(line) {
  return Object.values(SECTION_HEADERS).some((re) => re.test(line))
}

function extractSections(text) {
  if (!text) return {}
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, ' ').trim())
  const sections = {}
  let currentSection = null
  let currentLines = []

  for (const line of lines) {
    let matched = false
    for (const [key, re] of Object.entries(SECTION_HEADERS)) {
      if (re.test(line)) {
        if (currentSection) sections[currentSection] = currentLines.join('\n')
        currentSection = key
        currentLines = []
        matched = true
        break
      }
    }
    if (!matched && currentSection) {
      currentLines.push(line)
    }
  }
  if (currentSection) sections[currentSection] = currentLines.join('\n')
  return sections
}

function extractYearFromLine(s) {
  const m = String(s).match(/(19|20)\d{2}/g)
  return m ? m[m.length - 1] : ''
}

function cleanBullet(s) {
  return s.replace(/^[\s•·\-*●○▪◦►➤]+/, '').trim().slice(0, 280)
}

function nonEmptyLines(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 3)
}

function extractEducation(text, sections) {
  const out = []
  const sectionText = sections.education || ''
  if (sectionText) {
    const lines = nonEmptyLines(sectionText)
    for (const line of lines) {
      if (line.length < 6 || line.length > 350) continue
      if (isAnySectionHeader(line)) break
      out.push({
        degree: cleanBullet(line).slice(0, 200),
        institution: '',
        year: extractYearFromLine(line),
      })
      if (out.length >= 14) break
    }
  }

  if (out.length === 0 && text) {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, ' ').trim()).filter(Boolean)
    for (const line of lines) {
      if (line.length < 12 || line.length > 350) continue
      const lower = line.toLowerCase()
      const looksAcademic =
        /\b(b\.?a\.?|b\.?s\.?|m\.?a\.?|m\.?s\.?|bachelor|master|mba|ph\.?d|university|college|high\s*school|diploma\s+in|degree\s+in|faculty\s+of|12th\s*grade|14th\s*grade|associate|graduate)\b/i.test(lower)
      if (!looksAcademic) continue
      out.push({ degree: cleanBullet(line).slice(0, 200), institution: '', year: extractYearFromLine(line) })
      if (out.length >= 14) break
    }
  }
  return out
}

const LIKELY_LANGS = [
  'English', 'Dari', 'Pashto', 'Urdu', 'Arabic', 'French', 'Spanish', 'German',
  'Turkish', 'Russian', 'Chinese', 'Hindi', 'Farsi', 'Persian', 'Balochi', 'Uzbek',
  'Turkmen', 'Hazaragi', 'Pashai', 'Nuristani', 'Portuguese', 'Italian', 'Japanese',
  'Korean', 'Swahili', 'Amharic', 'Tigrinya', 'Somali', 'Nepali', 'Bengali',
]

function extractLanguages(text, sections) {
  const sectionText = sections.languages || ''
  if (sectionText) {
    const lines = nonEmptyLines(sectionText)
    const langs = []
    for (const line of lines) {
      if (line.length < 3 || line.length > 200) continue
      if (isAnySectionHeader(line)) break
      const cleaned = cleanBullet(line)
      if (cleaned) langs.push(cleaned)
      if (langs.length >= 20) break
    }
    if (langs.length > 0) return langs
  }

  if (!text) return []
  const found = []
  for (const lang of LIKELY_LANGS) {
    const re = new RegExp(`\\b${lang}\\b`, 'i')
    if (re.test(text)) found.push(lang)
  }
  return [...new Set(found)]
}

function extractCertsAndTrainings(text, sections) {
  const certs = []
  const trains = []

  const certSection = sections.certifications || ''
  if (certSection) {
    for (const line of nonEmptyLines(certSection)) {
      if (line.length < 6 || line.length > 400) continue
      if (isAnySectionHeader(line)) break
      certs.push({ name: cleanBullet(line), issuer: '', year: extractYearFromLine(line) })
      if (certs.length >= 20) break
    }
  }

  const trainSection = sections.trainings || ''
  if (trainSection) {
    for (const line of nonEmptyLines(trainSection)) {
      if (line.length < 6 || line.length > 400) continue
      if (isAnySectionHeader(line)) break
      trains.push({ name: cleanBullet(line), issuer: '', year: extractYearFromLine(line) })
      if (trains.length >= 20) break
    }
  }

  if ((certs.length + trains.length) > 0) return { certs, trains }

  if (!text) return { certs, trains }
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, ' ').trim()).filter(Boolean)
  for (const line of lines) {
    if (line.length < 16 || line.length > 420) continue
    const lower = line.toLowerCase()
    if (isAnySectionHeader(line)) continue

    const isCert =
      /certificate\s+of|certificate\s+in|^certificate\b|diploma\s+in|completion.*(unfpa|afga|healthnet)|y-peer|national peer education|provincial mun|afmun|model united|tashabos|information technology|diplomas?\s+in\s+english/i.test(lower)
    const isTrain =
      !isCert &&
      /\b(unicef|unfpa|who|british council|training|workshop|t\.o\.t\.?|\btot\b|adolescent reproductive|peer education|legal literacy|peace.?building|hiv|meena|menstrual hygiene|round\b|capacity.?building|first.?aid|gender|protection|gfp|safeguarding)\b/i.test(lower)

    if (isCert && certs.length < 20) {
      certs.push({ name: cleanBullet(line), issuer: '', year: extractYearFromLine(line) })
    } else if (isTrain && trains.length < 20) {
      trains.push({ name: cleanBullet(line), issuer: '', year: extractYearFromLine(line) })
    }
  }
  return { certs, trains }
}

function extractLicenses(sections) {
  const out = []
  const sectionText = sections.licenses || ''
  if (!sectionText) return out
  for (const line of nonEmptyLines(sectionText)) {
    if (line.length < 6 || line.length > 300) continue
    if (isAnySectionHeader(line)) break
    out.push({ name: cleanBullet(line), issuer: '', year: extractYearFromLine(line) })
    if (out.length >= 12) break
  }
  return out
}

function enrichCredentialsFromResumeText(result, sourceResume) {
  const out = {
    ...result,
    resume: { ...result.resume },
  }
  const r = out.resume
  const orig = result.resume || {}
  if (!sourceResume || typeof sourceResume !== 'string') return out

  const sections = extractSections(sourceResume)
  let filledFromSource = false

  if (!orig.education?.length) {
    const edu = extractEducation(sourceResume, sections)
    if (edu.length) {
      r.education = edu
      filledFromSource = true
    }
  }

  if (!orig.languages?.length) {
    const langs = extractLanguages(sourceResume, sections)
    if (langs.length) {
      r.languages = langs
      filledFromSource = true
    }
  }

  const { certs, trains } = extractCertsAndTrainings(sourceResume, sections)
  if (!orig.certifications?.length && certs.length) {
    r.certifications = certs.slice(0, 6)
    filledFromSource = true
  }
  if (!orig.trainings?.length && trains.length) {
    r.trainings = trains.slice(0, 6)
    filledFromSource = true
  }

  if (!orig.licenses?.length) {
    const lic = extractLicenses(sections)
    if (lic.length) {
      r.licenses = lic
      filledFromSource = true
    }
  }

  if (filledFromSource) out._credentialsEnriched = true
  return out
}

function estimateTokens(text) {
  return Math.ceil(text.length / 3.8)
}

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

function asStringArray(input, fallback = []) {
  if (typeof input === 'string') {
    const t = input.trim()
    return t ? [t] : fallback
  }
  if (!Array.isArray(input)) return fallback
  const out = []
  for (const item of input) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
    else if (item && typeof item === 'object') {
      const s = item.name ?? item.skill ?? item.label ?? item.language ?? item.text
      if (typeof s === 'string' && s.trim()) out.push(s.trim())
    }
  }
  return out.length ? out : fallback
}

function normalizeCertifications(raw) {
  let input = raw
  if (input && typeof input === 'object' && !Array.isArray(input)) input = [input]
  if (!Array.isArray(input)) return []
  return input
    .map((c) => {
      if (typeof c === 'string') {
        const t = c.trim()
        return t ? { name: t, issuer: '', year: '' } : null
      }
      if (c && typeof c === 'object') {
        return {
          name: typeof c.name === 'string' ? c.name : '',
          issuer: typeof c.issuer === 'string' ? c.issuer : '',
          year: typeof c.year === 'string' ? c.year : '',
        }
      }
      return null
    })
    .filter(Boolean)
}

function normalizeEducation(raw) {
  let input = raw
  if (input && typeof input === 'object' && !Array.isArray(input)) input = [input]
  if (!Array.isArray(input)) return []
  return input
    .map((e) => {
      if (typeof e === 'string') {
        const t = e.trim()
        return t ? { degree: t, institution: '', year: '' } : null
      }
      if (!e || typeof e !== 'object') return null
      const institution =
        e.institution ?? e.school ?? e.university ?? e.org ?? ''
      const degree = e.degree ?? e.program ?? e.qualification ?? e.title ?? ''
      const year = e.year ?? e.dates ?? e.graduationYear ?? ''
      return {
        institution: typeof institution === 'string' ? institution : '',
        degree: typeof degree === 'string' ? degree : '',
        year: typeof year === 'string' ? year : '',
      }
    })
    .filter((e) => e && (e.degree || e.institution))
}

function normalizeMatchScore(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 70
  if (n > 0 && n <= 1) return Math.min(100, Math.round(n * 100))
  if (n > 1 && n <= 100) return Math.round(n)
  if (n > 100) return 100
  if (n === 0) return 0
  return 70
}

function normalizeResult(parsed, { includeCoverLetter }) {
  const resume = parsed?.resume && typeof parsed.resume === 'object' ? parsed.resume : {}
  const keywordGaps = parsed?.keywordGaps && typeof parsed.keywordGaps === 'object' ? parsed.keywordGaps : {}

  return {
    matchScore: normalizeMatchScore(parsed?.matchScore),
    matchLabel: typeof parsed?.matchLabel === 'string' ? parsed.matchLabel : 'Good Match',
    matchReason: typeof parsed?.matchReason === 'string' ? parsed.matchReason : 'Your profile aligns with the role with room for targeted improvements.',
    changes: asStringArray(parsed?.changes, ['Resume optimized for role relevance', 'Keywords aligned with job requirements', 'Experience bullets rewritten for impact']),
    resumeTips: asStringArray(parsed?.resumeTips, ['Quantify outcomes with numbers', 'Mirror role-specific keywords naturally', 'Lead each bullet with a strong action verb']),
    outreachMessage: typeof parsed?.outreachMessage === 'string' ? parsed.outreachMessage : '',
    expertAgentNotes: typeof parsed?.expertAgentNotes === 'string' ? parsed.expertAgentNotes : '',
    coverLetter: includeCoverLetter && typeof parsed?.coverLetter === 'string'
      ? parsed.coverLetter
      : '',
    keywordGaps: {
      missingKeywords: asStringArray(keywordGaps.missingKeywords, []),
      matchedKeywords: asStringArray(keywordGaps.matchedKeywords, []),
      priorityActions: asStringArray(keywordGaps.priorityActions, []),
    },
    resume: {
      name: typeof resume.name === 'string' ? resume.name : 'Your Name',
      title: typeof resume.title === 'string' ? resume.title : '',
      email: typeof resume.email === 'string' ? resume.email : '',
      phone: typeof resume.phone === 'string' ? resume.phone : '',
      location: typeof resume.location === 'string' ? resume.location : '',
      linkedin: typeof resume.linkedin === 'string' ? resume.linkedin : '',
      summary: typeof resume.summary === 'string' ? resume.summary : 'Experienced professional aligned with the target role.',
      experience: Array.isArray(resume.experience) ? resume.experience : [],
      education: normalizeEducation(
        resume.education ?? resume.degrees ?? resume.academicBackground
      ),
      certifications: normalizeCertifications(
        resume.certifications ?? resume.certificates ?? resume.certificate
      ),
      licenses: normalizeCertifications(resume.licenses ?? resume.license),
      trainings: normalizeCertifications(
        resume.trainings ?? resume.professionalTrainings ?? resume.workshops
      ),
      skills: asStringArray(resume.skills ?? resume.coreSkills),
      languages: asStringArray(resume.languages ?? resume.languageSkills),
      computerSkills: asStringArray(resume.computerSkills ?? resume.tools),
    },
  }
}

function buildPrompt({ trimmedResume, trimmedJob, includeCoverLetter, depthMode }) {
  const detailed = depthMode === 'detailed'
  const arrayLimits = detailed
    ? 'changes<=8,resumeTips<=8,keyword lists<=15 each,expertAgentNotes<=4 sentences'
    : 'changes<=5,resumeTips<=5,keyword lists<=10 each,expertAgentNotes<=2 sentences,outreach<=6 lines'
  const modeInstruction = detailed
    ? `Richer bullets; no filler. ${arrayLimits}`
    : `Tight bullets; keep every role/fact. ${arrayLimits}`

  return `ATS resume editor (NGO/edu/health/M&E). ONE JSON only. No invented facts.

RESUME:
${trimmedResume}

JOB:
${trimmedJob}

TOKEN BUDGET PRIORITY (spend output tokens in this order):
1. EXPERIENCE (60% of effort) — this is the MOST important section. Every job MUST have 3-6 strong bullets. Rewrite bullets to match JOB keywords, quantify impact, use action verbs. Never return experience with empty or missing bullets.
2. SUMMARY (10%) — 2-3 sentences tailored to this specific job, using JOB terminology.
3. SKILLS + keywordGaps (10%) — domain skills from source, matched to JOB.
4. CREDENTIALS (10%) — education, certs, trainings, languages. Keep only items RELEVANT to the JOB. Do not dump every training from the CV.
5. OTHER (10%) — changes, tips, cover letter.

EXPERIENCE RULES:
- Each distinct job in RESUME → one experience entry with company, role, duration, bullets[]
- MINIMUM 3 bullets per job, up to 6 for the most relevant roles
- Bullets must be specific: action verb + what + measurable result/scope
- Tailor bullets to match JOB requirements (PSS, protection, M&E, health, etc.)
- company = organization name, role = position title — never the same text in both
- No fake employers/dates

CREDENTIALS (only include what exists in RESUME):
- education[]: {degree,institution,year} — formal degrees/diplomas only
- certifications[]: {name,issuer,year} — max 5, prioritize those relevant to JOB
- licenses[]: {name,issuer,year} or []
- trainings[]: {name,issuer,year} — max 6, ONLY the most relevant to JOB. Do not list all 20 trainings from the CV.
- languages[]: one string per language with proficiency if available
- computerSkills[]: from source resume

keywordGaps (never all-empty): matchedKeywords>=4; missingKeywords>=3 JD terms weak/absent; priorityActions>=3 concrete fixes.

matchScore=int 0-100. ${modeInstruction}
${includeCoverLetter ? 'coverLetter<=180 words,facts only.' : 'coverLetter:""'}

Keys: matchScore,matchLabel,matchReason,changes,resumeTips,outreachMessage,expertAgentNotes,coverLetter,keywordGaps,resume{name,title,email,phone,location,linkedin,summary,experience[],education[],certifications[],licenses[],trainings[],skills[],languages[],computerSkills[]}`
}

const SYSTEM_MSG = 'Return one valid JSON object only. No markdown. Obey employer vs job title: company=organization name, role=position title—never duplicate the same text in both.'

function modelTemperature() {
  return 0.52
}

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests.' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  const { resumeText, jobText, options = {} } = req.body || {}
  if (!resumeText || !jobText) {
    return sendJson(res, 400, { error: 'resumeText and jobText required' })
  }

  const includeCoverLetter = Boolean(options.includeCoverLetter)
  const depthMode = options.depthMode === 'detailed' ? 'detailed' : 'concise'

  const resumeClean = resumeText.replace(/[<>]/g, '')
  const resumeForExtraction = resumeClean.slice(0, 60000)
  const trimmedResume = trimResumeHeadTail(resumeClean, MAX_RESUME_CHARS)
  const jobClean = jobText.replace(/[<>]/g, '')
  const jobSource = jobClean.length > MAX_JOB_CHARS ? jobClean.slice(0, 25000) : jobClean
  const trimmedJob = trimJobHeadTail(jobSource, MAX_JOB_CHARS)
  const prompt = buildPrompt({ trimmedResume, trimmedJob, includeCoverLetter, depthMode })

  const temp = modelTemperature()
  const budget = outputTokenBudget({ includeCoverLetter, depthMode })
  const estIn = estimateTokens(SYSTEM_MSG + prompt)
  console.log(`[analyze] ~${estIn} in-tok | out cap: cerebras=${budget.cerebras} groq=${budget.groq} gemini=${budget.gemini} | resume chars=${resumeClean.length}`)

  let raw = null
  let usedModel = ''

  // ── Attempt 1: Cerebras (primary — 1M tokens/day free) ──
  if (!raw && process.env.CEREBRAS_API_KEY) {
    try {
      console.log(`[analyze] Trying Cerebras (${CEREBRAS_MODEL})...`)
      const r = await axios.post(
        'https://api.cerebras.ai/v1/chat/completions',
        {
          model: CEREBRAS_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_MSG },
            { role: 'user', content: prompt },
          ],
          max_tokens: budget.cerebras,
          temperature: temp,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        }
      )
      raw = r.data.choices[0].message.content
      usedModel = `cerebras:${CEREBRAS_MODEL}`
      console.log(`[analyze] Cerebras OK, length: ${raw.length}`)
    } catch (e) {
      console.warn('[analyze] Cerebras failed:', e.response?.data?.message || e.response?.data?.error?.message || e.message)
    }
  }

  // ── Attempt 2: Groq (fallback 1) ──────────────
  if (!raw && process.env.GROQ_API_KEY) {
    try {
      const groqMax = budget.groq
      console.log(`[analyze] Trying Groq (${GROQ_MODEL}, max_tokens=${groqMax})...`)
      const r = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_MSG },
            { role: 'user', content: prompt },
          ],
          max_tokens: groqMax,
          temperature: temp,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        }
      )
      raw = r.data.choices[0].message.content
      usedModel = `groq:${GROQ_MODEL}`
      console.log('[analyze] Groq OK, length:', raw.length)
    } catch (e) {
      console.warn('[analyze] Groq failed:', e.response?.data?.error?.message || e.message)
    }
  }

  // ── Attempt 3: Gemini (fallback 2) ─────────────
  if (!raw && process.env.GEMINI_API_KEY) {
    try {
      console.log('[analyze] Trying Gemini...')
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: `${SYSTEM_MSG}\n\n${prompt}` }] }],
          generationConfig: {
            temperature: temp,
            maxOutputTokens: budget.gemini,
            responseMimeType: 'application/json',
          },
        },
        { timeout: 120000 }
      )
      raw = r.data.candidates[0].content.parts[0].text
      usedModel = 'gemini-2.0-flash'
      console.log('[analyze] Gemini OK, length:', raw.length)
    } catch (e) {
      console.warn('[analyze] Gemini failed:', e.response?.data?.error?.message || e.message)
    }
  }

  if (!raw) {
    return sendJson(res, 500, { error: 'All AI models are currently unavailable. Please try again shortly.' })
  }

  try {
    console.log('[analyze] Raw (first 200):', raw.slice(0, 200))
    const cleaned = cleanAIResponse(raw)
    console.log('[analyze] Cleaned (first 200):', cleaned.slice(0, 200))

    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Missing resume object in response')
    }
    const result = normalizeResult(parsed, { includeCoverLetter })
    const merged = enrichCredentialsFromResumeText(result, resumeForExtraction)

    console.log(
      `[analyze] OK via ${usedModel} | score: ${merged.matchScore} | edu: ${merged.resume.education?.length ?? 0} | langs: ${merged.resume.languages?.length ?? 0} | certs: ${merged.resume.certifications?.length ?? 0} | trainings: ${merged.resume.trainings?.length ?? 0} | enriched: ${Boolean(merged._credentialsEnriched)}`
    )
    return sendJson(res, 200, { ...merged, _model: usedModel })
  } catch (parseErr) {
    console.error('[analyze] JSON parse failed:', parseErr.message)
    console.error('Raw (first 500):', raw.slice(0, 500))
    const fallbackResult = normalizeResult({}, { includeCoverLetter })
    fallbackResult._fallback = true
    const mergedFallback = enrichCredentialsFromResumeText(fallbackResult, resumeForExtraction)
    return sendJson(res, 200, { ...mergedFallback, _model: usedModel })
  }
}
