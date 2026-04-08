import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import process from 'process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env explicitly from the repo root `.env` (don't rely on cwd).
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
// Optionally allow a `backend/.env` for local overrides.
dotenv.config({ path: path.resolve(__dirname, '.env'), override: false });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGroq(prompt) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }
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
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const raw = response.data?.choices?.[0]?.message?.content || '';
  return raw.replace(/```json|```/g, '').trim();
}

function normalizeAnalyzeResult(result, { trimmedResume }) {
  // Some models return nested JSON or structured objects; normalize to our UI schema.
  let r = result
  if (typeof r === 'string') {
    try { r = JSON.parse(r) } catch { /* keep string */ }
  }

  // If tailoredResume/coverLetter are JSON-strings, decode them.
  for (const key of ['tailoredResume', 'coverLetter']) {
    if (typeof r?.[key] === 'string' && r[key].trim().startsWith('{')) {
      try { r[key] = JSON.parse(r[key]) } catch { /* ignore */ }
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

// ✅ Verify API Keys are loaded
console.log('🔑 API Keys loaded:');
console.log('JINA_API_KEY:', process.env.JINA_API_KEY ? '✓ Loaded' : '✗ Missing');
console.log('QWEN_API_KEY:', process.env.QWEN_API_KEY ? '✓ Loaded' : '✗ Missing');
console.log('DASHSCOPE_API_KEY:', process.env.DASHSCOPE_API_KEY ? '✓ Loaded' : '✗ Missing');
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? '✓ Loaded' : '✗ Missing');

// Simple rate limiter (basic implementation)
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = rateLimit.get(ip) || [];

  // Remove old requests outside the window
  const validRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (validRequests.length >= RATE_LIMIT_MAX) {
    return false; // Rate limit exceeded
  }

  validRequests.push(now);
  rateLimit.set(ip, validRequests);
  return true; // OK to proceed
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Rate limiting middleware
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
});

app.get('/test-groq', async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'Groq API key not configured' });
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Hello, just testing the API. Respond with \"API working\" only.' }],
        max_tokens: 10,
        temperature: 0
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    res.json({
      status: 'success',
      response: response.data.choices?.[0]?.message?.content,
      usage: response.data.usage
    });
  } catch (err) {
    console.error('Groq API Test Error:', err.response?.status, err.response?.data);
    res.status(500).json({
      error: 'Groq API test failed',
      detail: err.response?.data || err.message
    });
  }
});

app.get('/test-qwen', async (req, res) => {
  const qwenKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!qwenKey) {
    return res.status(500).json({ error: 'QWEN_API_KEY (or DASHSCOPE_API_KEY) not configured' });
  }

  const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  try {
    const response = await axios.post(
      url,
      {
        model: process.env.QWEN_MODEL || 'qwen3.6-plus',
        messages: [{ role: 'user', content: 'Respond with: QWEN_OK' }],
        temperature: 0,
        max_tokens: 20
      },
      {
        headers: {
          Authorization: `Bearer ${qwenKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    res.json({
      status: 'success',
      model: process.env.QWEN_MODEL || 'qwen3.6-plus',
      baseUrl,
      response: response.data?.choices?.[0]?.message?.content,
      usage: response.data?.usage
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      model: process.env.QWEN_MODEL || 'qwen3.6-plus',
      baseUrl,
      detail: err.response?.data || err.message
    });
  }
});

// ── Scrape job description from URL ───────
app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await axios.get(jinaUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
        'Accept': 'text/plain',
        'X-Timeout': '10'
      },
      timeout: 12000
    });

    const text = response.data;

    const isBlocked = text.includes('CAPTCHA') ||
                     text.includes('not yet fully loaded') ||
                     text.includes('404 error') ||
                     text.length < 300;

    if (!isBlocked) {
      return res.json({
        jobText: text.slice(0, 4000),
        source: 'scraped'
      });
    }

    return res.json({
      jobText: null,
      source: 'blocked',
      message: 'This job site blocks scrapers. Please paste the job description instead.'
    });

  } catch {
    return res.json({
      jobText: null,
      source: 'blocked',
      message: 'Could not fetch job. Please paste the description instead.'
    });
  }
});

app.post('/upload-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    console.log('📄 Parsing PDF file:', req.file.originalname, `(${req.file.size} bytes)`);
    // Basic sanity check: PDF files should start with "%PDF"
    const header = req.file.buffer?.subarray?.(0, 4)?.toString?.('utf8');
    if (header !== '%PDF') {
      return res.status(400).json({
        error: 'Invalid PDF file',
        hint: 'This file does not look like a valid PDF. Try re-exporting your resume as a standard PDF.',
      });
    }

    const data = await pdfParse(req.file.buffer);
    
    if (!data.text || data.text.trim().length === 0) {
      console.warn('⚠️ PDF has no extractable text');
      return res.status(400).json({ error: 'PDF has no readable text. Please upload a different file.' });
    }
    
    console.log('✅ PDF parsed successfully, extracted', data.text.length, 'characters');
    res.json({ resumeText: data.text.slice(0, 5000) });
  } catch (err) {
    console.error('❌ PDF parsing error:', err.message);
    const msg = (err?.message || '').toLowerCase();
    const isXref = msg.includes('xref');
    res.status(500).json({ 
      error: 'Failed to parse PDF', 
      detail: err.message,
      hint: isXref
        ? 'Your PDF appears to be malformed (XRef table issue). Try: open it and "Print" → "Save as PDF", or export again from Google Docs/Word/Canva. Then re-upload.'
        : 'Make sure your PDF contains text (not just images). Try converting it or uploading a different resume.'
    });
  }
});

// ── AI: tailor resume + cover letter (Gemini) ──
app.post('/analyze', async (req, res) => {
  const { resumeText, jobText } = req.body;
  if (!resumeText || !jobText)
    return res.status(400).json({ error: 'resumeText and jobText required' });

  // Trim inputs to avoid token overflow
  const trimmedResume = resumeText.slice(0, 3000);
  const trimmedJob = jobText.slice(0, 2000);

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
}`;

  try {
    const qwenKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
    if (!qwenKey) {
      return res.status(500).json({ error: 'QWEN_API_KEY (or DASHSCOPE_API_KEY) not configured' });
    }

    console.log('📊 Sending analysis request to Qwen API...');
    const qwenBaseUrl = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    const qwenUrl = `${qwenBaseUrl.replace(/\/$/, '')}/chat/completions`;
    const qwenPayload = {
      model: process.env.QWEN_MODEL || 'qwen3.6-plus',
      messages: [
        { role: 'system', content: 'Return ONLY valid JSON. No markdown. No backticks. No extra text.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };

    // Retry on transient overloads (429/5xx/timeouts).
    const backoffs = [0, 800, 1600, 2500];
    let response;
    let lastErr;
    for (const wait of backoffs) {
      if (wait) await sleep(wait);
      try {
        response = await axios.post(qwenUrl, qwenPayload, {
          headers: {
            Authorization: `Bearer ${qwenKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const status = e?.response?.status;
        const msg = e?.response?.data?.error?.message || e?.message || '';
        const isOverload = status === 429 || status === 503 || status >= 500 || msg.toLowerCase().includes('timeout');
        if (!isOverload) break;
        console.warn('⚠️ Qwen overloaded, retrying...', { status, msg: msg.slice(0, 120) });
      }
    }

    let raw;
    if (response) {
      raw = response.data?.choices?.[0]?.message?.content || '';
    } else {
      console.warn('⚠️ Qwen still overloaded; falling back to Groq...');
      raw = await callGroq(prompt);
    }

    console.log('📦 Raw response received, length:', raw.length);
    const clean = raw.replace(/```json|```/g, '').trim();

    try {
      const result = JSON.parse(clean);
      const normalized = normalizeAnalyzeResult(result, { trimmedResume });
      console.log('✅ Successfully parsed AI response');
      console.log('   - matchScore:', normalized.matchScore);
      console.log('   - tailoredResume length:', normalized.tailoredResume?.length);
      console.log('   - coverLetter length:', normalized.coverLetter?.length);
      res.json(normalized);
    } catch (parseErr) {
      console.error('❌ JSON Parse Error:', parseErr.message);
      console.error('Raw response (first 500 chars):', raw.slice(0, 500));

      // Improved fallback extraction
      const scoreMatch = raw.match(/"matchScore"\s*:\s*(\d+)/);
      const labelMatch = raw.match(/"matchLabel"\s*:\s*"([^"]+)"/);
      const reasonMatch = raw.match(/"matchReason"\s*:\s*"([^"]*?)"/);
      const tailoredMatch = raw.match(/"tailoredResume"\s*:\s*"([\s\S]*?)(?<!\\)"\s*,/);
      const coverMatch = raw.match(/"coverLetter"\s*:\s*"([\s\S]*?)(?<!\\)"\s*,/);
      const changesMatch = raw.match(/"changes"\s*:\s*\[([\s\S]*?)\]/);
      const tipsMatch = raw.match(/"resumeTips"\s*:\s*\[([\s\S]*?)\]/);

      const extractArray = (str) => {
        if (!str) return [];
        return str.split(',').map(s => s.trim().replace(/^"|"$/g, '').slice(0, 200)).filter(s => s.length > 0);
      };

      const fallback = {
        matchScore: scoreMatch ? parseInt(scoreMatch[1]) : 75,
        matchLabel: labelMatch ? labelMatch[1] : 'Good Match',
        matchReason: reasonMatch ? reasonMatch[1] : 'Your experience aligns with key job requirements.',
        tailoredResume: tailoredMatch ? tailoredMatch[1].slice(0, 1000) : trimmedResume.slice(0, 800) + '\n\n[Your resume tailored for this role - key keywords and achievements highlighted to match job description]',
        changes: extractArray(changesMatch ? changesMatch[1] : 'Keywords optimized, Experience reordered, Skills highlighted, Impact statements added, Technical skills emphasized'),
        coverLetter: coverMatch ? coverMatch[1].slice(0, 600) : 'Dear Hiring Manager,\n\nI am excited to apply for this position. My background in [key skill] and experience with [relevant tech] make me a strong fit. I am confident I can contribute significantly to your team.\n\nBest regards',
        resumeTips: extractArray(tipsMatch ? tipsMatch[1] : 'Use exact job keywords, Quantify achievements, Lead with relevant experience, Highlight specific technologies, Show impact with metrics')
      };

      console.log('📋 Using fallback response');
      res.json(normalizeAnalyzeResult(fallback, { trimmedResume }));
    }
  } catch (err) {
    console.error('❌ Gemini API Error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'AI analysis failed', 
      detail: err.response?.data?.error?.message || err.message 
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ ApplyAI backend running on port ${PORT}`);
});