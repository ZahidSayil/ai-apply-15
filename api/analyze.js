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
    const geminiKey = getRequiredEnv('GEMINI_API_KEY')

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 12000,
          responseMimeType: 'application/json',
        },
      },
      { timeout: 30_000 },
    )

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = raw.replace(/```json|```/g, '').trim()

    try {
      const result = JSON.parse(clean)
      return sendJson(res, 200, result)
    } catch (parseErr) {
      // Fallback extraction (mirrors previous backend behavior)
      const scoreMatch = raw.match(/"matchScore"\s*:\s*(\d+)/)
      const labelMatch = raw.match(/"matchLabel"\s*:\s*"([^"]+)"/)
      const reasonMatch = raw.match(/"matchReason"\s*:\s*"([^"]*?)"/)
      const tailoredMatch = raw.match(/"tailoredResume"\s*:\s*"([\s\S]*?)(?<!\\)"\s*,/)
      const coverMatch = raw.match(/"coverLetter"\s*:\s*"([\s\S]*?)(?<!\\)"\s*,/)
      const changesMatch = raw.match(/"changes"\s*:\s*\[([\s\S]*?)\]/)
      const tipsMatch = raw.match(/"resumeTips"\s*:\s*\[([\s\S]*?)\]/)

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

      return sendJson(res, 200, fallback)
    }
  } catch (err) {
    return sendJson(res, 500, {
      error: 'AI analysis failed',
      detail: err?.response?.data?.error?.message || err?.message || String(err),
    })
  }
}

