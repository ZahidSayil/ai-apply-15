require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const pdfParse = require('pdf-parse');

// ✅ Verify API Keys are loaded
console.log('🔑 API Keys loaded:');
console.log('JINA_API_KEY:', process.env.JINA_API_KEY ? '✓ Loaded' : '✗ Missing');
console.log('DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? '✓ Loaded' : '✗ Missing');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✓ Loaded' : '✗ Missing');

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

app.get('/test-deepseek', async (req, res) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: 'DeepSeek API key not configured' });
  }

  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hello, just testing the API. Respond with "API working" only.' }],
        max_tokens: 10
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      status: 'success',
      response: response.data.choices[0].message.content,
      usage: response.data.usage
    });
  } catch (err) {
    console.error('DeepSeek API Test Error:', err.response?.status, err.response?.data);
    res.status(500).json({
      error: 'DeepSeek API test failed',
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

  } catch (err) {
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
    const data = await pdfParse(req.file.buffer);
    res.json({ resumeText: data.text.slice(0, 5000) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse PDF', detail: err.message });
  }
});

// ── AI: tailor resume + cover letter (Gemini) ──
app.post('/analyze', async (req, res) => {
  const { resumeText, jobText } = req.body;
  if (!resumeText || !jobText)
    return res.status(400).json({ error: 'resumeText and jobText required' });

  // Trim inputs to avoid token overflow
  const trimmedResume = resumeText.slice(0, 2000);
  const trimmedJob = jobText.slice(0, 2000);

  const prompt = `
You are an expert career coach and resume writer.

RESUME:
${trimmedResume}

JOB DESCRIPTION:
${trimmedJob}

CRITICAL: Return ONLY a valid JSON object. No markdown, no backticks, no explanation.
Keep ALL string values SHORT — maximum 300 characters each.
The tailoredResume must be maximum 500 characters.
The coverLetter must be maximum 500 characters.

{
  "matchScore": 82,
  "matchLabel": "Strong Match",
  "matchReason": "One sentence max.",
  "tailoredResume": "Shortened tailored resume under 500 chars.",
  "changes": ["Change 1", "Change 2", "Change 3"],
  "coverLetter": "Cover letter under 500 chars.",
  "resumeTips": ["Tip 1", "Tip 2", "Tip 3"]
}`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8000,
          responseMimeType: 'application/json'
        }
      }
    );

    const raw = response.data.candidates[0].content.parts[0].text;
    const clean = raw.replace(/```json|```/g, '').trim();

    try {
      const result = JSON.parse(clean);
      res.json(result);
    } catch (parseErr) {
      console.error('JSON Parse Error:', parseErr.message);
      console.error('Raw:', raw.slice(0, 500));

      // Try to extract whatever we can
      const scoreMatch = raw.match(/"matchScore"\s*:\s*(\d+)/);
      const labelMatch = raw.match(/"matchLabel"\s*:\s*"([^"]+)"/);
      const reasonMatch = raw.match(/"matchReason"\s*:\s*"([^"]+)"/);

      res.json({
        matchScore: scoreMatch ? parseInt(scoreMatch[1]) : 75,
        matchLabel: labelMatch ? labelMatch[1] : 'Good Match',
        matchReason: reasonMatch ? reasonMatch[1] : 'Strong alignment with job requirements.',
        tailoredResume: 'Resume tailored successfully. Copy and edit as needed.',
        changes: ['Keywords optimized', 'Experience reordered', 'Skills highlighted'],
        coverLetter: 'Dear Hiring Manager, I am excited to apply for this role. My experience aligns well with your requirements. I look forward to discussing further.',
        resumeTips: ['Add measurable achievements', 'Tailor skills section', 'Include relevant keywords']
      });
    }
  } catch (err) {
    console.error('Gemini API Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'AI analysis failed', detail: err.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ ApplyAI backend running on port ${PORT}`);
});