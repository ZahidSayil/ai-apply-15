# ApplyAI

ApplyAI is a React + Vite app with Vercel Serverless Functions that:

- Uploads a **PDF resume**, extracts text, and stores it in the browser
- Takes a **job URL** (scrape via Jina) or **pasted job description**
- Uses **Gemini** to generate a tailored resume + cover letter + match score
- Lets you **copy** results and **download** as PDF/TXT

## Local development

- **Frontend**:

```bash
npm install
npm run dev
```

- **Backend (legacy Express, optional)**:

```bash
npm run dev:backend
```

Note: the Vercel-style API lives in `api/` and is what production uses on Vercel.

## Deploy to Vercel (recommended)

This repo is ready to deploy as a **single Vercel project**:

- Static frontend (Vite build output in `dist/`)
- Backend endpoints as serverless functions under `api/`

### Vercel project settings

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### Environment variables (Vercel → Project → Settings → Environment Variables)

- **Required**:
  - `GEMINI_API_KEY`
- **Optional (for job URL scraping)**:
  - `JINA_API_KEY`
- **Optional (only for `/api/test-deepseek`)**:
  - `DEEPSEEK_API_KEY`

### Production endpoints

- `POST /api/upload-resume` (multipart form-data, field name: `resume`)
- `POST /api/scrape` `{ "url": "https://..." }`
- `POST /api/analyze` `{ "resumeText": "...", "jobText": "..." }`
- `GET /api/test-deepseek`
