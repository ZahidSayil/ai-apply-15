import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function JobInput() {
  const [url, setUrl] = useState('')
  const [jobText, setJobText] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('url')
  const navigate = useNavigate()

  async function handleAnalyze() {
    if (!url.trim()) return alert('Paste a job URL first')
    setLoading(true)
    try {
      const scrape = await axios.post('/api/scrape', { url })
      localStorage.setItem('jobText', scrape.data.jobText)
      localStorage.setItem('jobUrl', url)
      navigate('/loading')
    } catch {
      alert('Could not fetch job. Try pasting the description instead.')
      setLoading(false)
    }
  }

  function handlePastedText() {
    if (jobText.length < 50) return alert('Please paste at least 50 characters')
    localStorage.setItem('jobText', jobText)
    navigate('/loading')
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← Back</button>

        <div style={styles.header}>
          <h1 style={styles.title}>Enter job details</h1>
          <p style={styles.subtitle}>Paste the job URL or description to analyze</p>
        </div>

        <div style={styles.tabs}>
          <button 
            style={{ ...styles.tab, ...(tab === 'url' ? styles.tabActive : {}) }}
            onClick={() => setTab('url')}
          >
            URL
          </button>
          <button 
            style={{ ...styles.tab, ...(tab === 'text' ? styles.tabActive : {}) }}
            onClick={() => setTab('text')}
          >
            Paste Text
          </button>
        </div>

        {tab === 'url' ? (
          <div>
            <input
              style={styles.input}
              type="url"
              placeholder="https://jobs.lever.co/company/role"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
            />
            <button
              style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
              onClick={handleAnalyze}
              disabled={loading}
            >
              {loading ? 'Fetching...' : 'Analyze & Tailor'}
            </button>
          </div>
        ) : (
          <div>
            <textarea
              style={styles.textarea}
              placeholder="Paste the job description here..."
              rows={8}
              value={jobText}
              onChange={e => setJobText(e.target.value)}
            />
            <button 
              style={{ ...styles.btn, ...(jobText.length < 50 ? styles.btnDisabled : {}) }}
              onClick={handlePastedText}
              disabled={jobText.length < 50}
            >
              Continue with this text
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
    background: '#fff',
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  container: { 
    width: '100%', 
    maxWidth: '500px'
  },
  backBtn: {
    background: 'none',
    border: 'none',
    fontSize: '15px',
    color: '#666',
    cursor: 'pointer',
    padding: '0 0 24px 0',
    fontWeight: '500'
  },
  header: { 
    marginBottom: '32px', 
    textAlign: 'center'
  },
  title: { 
    fontSize: '32px', 
    fontWeight: '700', 
    color: '#1a1a1a', 
    margin: '0 0 12px 0',
    lineHeight: '1.2'
  },
  subtitle: { 
    fontSize: '16px', 
    color: '#666', 
    margin: '0'
  },
  tabs: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    borderBottom: '1px solid #e0e0e0'
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    padding: '12px 0',
    fontSize: '15px',
    fontWeight: '600',
    color: '#999',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  tabActive: {
    color: '#1a1a1a',
    borderBottomColor: '#3b82f6'
  },
  input: { 
    width: '100%', 
    padding: '12px 16px', 
    borderRadius: '8px', 
    border: '1px solid #e0e0e0', 
    background: '#fff', 
    color: '#1a1a1a', 
    fontSize: '15px',
    marginBottom: '16px', 
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.3s ease'
  },
  textarea: { 
    width: '100%', 
    padding: '12px 16px', 
    borderRadius: '8px', 
    border: '1px solid #e0e0e0', 
    background: '#fff', 
    color: '#1a1a1a', 
    fontSize: '15px',
    marginBottom: '16px', 
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  btn: { 
    width: '100%', 
    padding: '12px 16px', 
    borderRadius: '8px', 
    border: 'none', 
    background: '#3b82f6', 
    color: '#fff', 
    fontSize: '15px', 
    fontWeight: '600', 
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  btnDisabled: { 
    opacity: 0.5, 
    cursor: 'not-allowed' 
  }
}