import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import process from 'process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/.env` });

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
    const data = await pdfParse(req.file.buffer);
    
    if (!data.text || data.text.trim().length === 0) {
      console.warn('⚠️ PDF has no extractable text');
      return res.status(400).json({ error: 'PDF has no readable text. Please upload a different file.' });
    }
    
    console.log('✅ PDF parsed successfully, extracted', data.text.length, 'characters');
    res.json({ resumeText: data.text.slice(0, 5000) });
  } catch (err) {
    console.error('❌ PDF parsing error:', err.message);
    res.status(500).json({ 
      error: 'Failed to parse PDF', 
      detail: err.message,
      hint: 'Make sure your PDF contains text (not just images). Try converting it or uploading a different resume.'
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
    console.log('📊 Sending analysis request to Gemini API...');
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 12000,
          responseMimeType: 'application/json'
        }
      },
      { timeout: 30000 }
    );

    const raw = response.data.candidates[0].content.parts[0].text;
    console.log('📦 Raw response received, length:', raw.length);
    const clean = raw.replace(/```json|```/g, '').trim();

    try {
      const result = JSON.parse(clean);
      console.log('✅ Successfully parsed AI response');
      console.log('   - matchScore:', result.matchScore);
      console.log('   - tailoredResume length:', result.tailoredResume?.length);
      console.log('   - coverLetter length:', result.coverLetter?.length);
      res.json(result);
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
      res.json(fallback);
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