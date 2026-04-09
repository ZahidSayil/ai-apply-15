import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function JobInput() {
  const [url, setUrl] = useState('')
  const [jobText, setJobText] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('url')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const resumeName = localStorage.getItem('resumeFileName') || 'your resume'

  async function handleScrape() {
    if (!url.trim()) return setError('Please paste a job URL first')
    setError('')
    setLoading(true)

    try {
      const res = await axios.post('/api/scrape', { url }, { timeout: 15000 })

      if (res.data.jobText) {
        localStorage.setItem('jobText', res.data.jobText)
        localStorage.setItem('jobUrl', url)
        navigate('/loading')
      } else {
        // Scraping was blocked — switch to paste tab
        setError(res.data.message || 'This site blocks scrapers. Please paste the job description instead.')
        setTab('text')
        setLoading(false)
      }
    } catch {
      setError('Could not fetch that URL. Try pasting the job description instead.')
      setTab('text')
      setLoading(false)
    }
  }

  function handlePastedText() {
    if (jobText.trim().length < 50) return setError('Please paste at least 50 characters of the job description')
    setError('')
    localStorage.setItem('jobText', jobText.trim())
    navigate('/loading')
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>
          ← Back
        </button>

        <div style={styles.header}>
          <h1 style={styles.title}>Enter job details</h1>
          <p style={styles.subtitle}>
            Using <strong>{resumeName}</strong> — paste the job URL or description
          </p>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'url' ? styles.tabActive : {}) }}
            onClick={() => { setTab('url'); setError('') }}
          >
            🔗 Paste URL
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'text' ? styles.tabActive : {}) }}
            onClick={() => { setTab('text'); setError('') }}
          >
            📝 Paste Text
          </button>
        </div>

        {/* URL Tab */}
        {tab === 'url' && (
          <div style={styles.tabPanel}>
            <input
              style={styles.input}
              type="url"
              placeholder="https://jobs.lever.co/company/role..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScrape()}
              disabled={loading}
            />
            <button
              style={{ ...styles.btn, ...(loading || !url.trim() ? styles.btnDisabled : {}) }}
              onClick={handleScrape}
              disabled={loading || !url.trim()}
            >
              {loading ? '⏳ Fetching job details...' : 'Analyze & Tailor →'}
            </button>
            <p style={styles.hint}>
              Works best with LinkedIn, Lever, Greenhouse, Workday, and Indeed
            </p>
          </div>
        )}

        {/* Paste Tab */}
        {tab === 'text' && (
          <div style={styles.tabPanel}>
            <textarea
              style={styles.textarea}
              placeholder="Paste the full job description here — include title, requirements, qualifications, responsibilities..."
              rows={10}
              value={jobText}
              onChange={e => setJobText(e.target.value)}
            />
            <div style={styles.charCount}>
              {jobText.length} characters {jobText.length < 50 ? `(${50 - jobText.length} more needed)` : '✓'}
            </div>
            <button
              style={{ ...styles.btn, ...(jobText.trim().length < 50 ? styles.btnDisabled : {}) }}
              onClick={handlePastedText}
              disabled={jobText.trim().length < 50}
            >
              Analyze & Tailor →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  container: {
    width: '100%',
    maxWidth: '520px',
    animation: 'fadeIn 0.4s ease',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    fontSize: '14px',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '0 0 20px 0',
    fontWeight: '500',
  },
  header: {
    marginBottom: '28px',
    textAlign: 'center',
  },
  title: {
    fontSize: '30px',
    fontWeight: '800',
    color: '#111827',
    margin: '0 0 10px 0',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#6b7280',
    margin: '0',
    lineHeight: '1.5',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '12px 16px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '10px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#991b1b',
    lineHeight: '1.5',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    background: '#f3f4f6',
    borderRadius: '10px',
    padding: '4px',
  },
  tab: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  tabActive: {
    background: '#ffffff',
    color: '#111827',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  tabPanel: {
    animation: 'fadeIn 0.3s ease',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#111827',
    fontSize: '15px',
    marginBottom: '12px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease',
  },
  textarea: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#111827',
    fontSize: '14px',
    marginBottom: '4px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
    lineHeight: '1.6',
  },
  charCount: {
    fontSize: '12px',
    color: '#9ca3af',
    marginBottom: '12px',
    textAlign: 'right',
  },
  btn: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  hint: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '12px',
    textAlign: 'center',
  },
}