import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function JobInput() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleAnalyze() {
    if (!url.trim()) return alert('Paste a job URL first')
    setLoading(true)
    try {
      const scrape = await axios.post('http://127.0.0.1:3001/scrape', { url })
      localStorage.setItem('jobText', scrape.data.jobText)
      localStorage.setItem('jobUrl', url)
      navigate('/loading')
    } catch (err) {
      alert('Could not fetch job. Try pasting the description instead.')
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.back} onClick={() => navigate('/')}>← Back</div>
        <div style={styles.logo}>apply<span style={styles.accent}>ai</span></div>
        <h1 style={styles.title}>Paste the job URL</h1>
        <p style={styles.sub}>We'll read the full job description automatically</p>

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
          {loading ? 'Fetching job...' : '⚡ Analyze & Tailor'}
        </button>

        <div style={styles.divider}><span>or</span></div>

        <textarea
          style={styles.textarea}
          placeholder="Paste the job description text here instead..."
          rows={5}
          onChange={e => {
            if (e.target.value.length > 100) {
              localStorage.setItem('jobText', e.target.value)
            }
          }}
        />
        <button style={styles.btnSecondary} onClick={() => {
          if (localStorage.getItem('jobText')) navigate('/loading')
          else alert('Paste some job description text first')
        }}>
          Use pasted text →
        </button>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  card: { width: '100%', maxWidth: '400px' },
  back: { color: '#555', fontSize: '14px', cursor: 'pointer', marginBottom: '24px' },
  logo: { fontFamily: 'system-ui', fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '20px', letterSpacing: '-1px' },
  accent: { color: '#7c6af7' },
  title: { fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '8px' },
  sub: { fontSize: '14px', color: '#888', marginBottom: '24px' },
  input: { width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1.5px solid #2a2a45', background: '#0f0f1a', color: '#fff', fontSize: '14px', marginBottom: '12px', outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '15px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #7c6af7, #c47af0)', color: '#fff', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '20px' },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  divider: { textAlign: 'center', color: '#333', fontSize: '13px', marginBottom: '16px', borderTop: '1px solid #1a1a2e', paddingTop: '16px' },
  textarea: { width: '100%', padding: '14px', borderRadius: '12px', border: '1.5px solid #2a2a45', background: '#0f0f1a', color: '#ccc', fontSize: '13px', marginBottom: '12px', outline: 'none', boxSizing: 'border-box', resize: 'none' },
  btnSecondary: { width: '100%', padding: '13px', borderRadius: '12px', border: '1.5px solid #2a2a45', background: 'transparent', color: '#888', fontSize: '14px', cursor: 'pointer' }
}