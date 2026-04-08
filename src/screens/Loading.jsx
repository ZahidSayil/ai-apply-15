import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function Loading() {
  const navigate = useNavigate()

  useEffect(() => {
    async function run() {
      const resumeText = localStorage.getItem('resumeText')
      const jobText = localStorage.getItem('jobText')
      if (!resumeText || !jobText) { navigate('/'); return }
      try {
        const res = await axios.post('/api/analyze', { resumeText, jobText })
        localStorage.setItem('results', JSON.stringify(res.data))
        navigate('/results')
      } catch {
        alert('AI analysis failed. Check your API key.')
        navigate('/job')
      }
    }
    run()
  }, [navigate])

  const steps = [
    'Reading your resume',
    'Analyzing job requirements', 
    'Tailoring your resume',
    'Writing cover letter'
  ]

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.loaderWrapper}>
          <div style={styles.spinner} />
        </div>
        <h1 style={styles.title}>Analyzing your profile...</h1>
        <p style={styles.subtitle}>This usually takes 10-15 seconds</p>
        
        <div style={styles.stepsList}>
          {steps.map((step, i) => (
            <div key={i} style={styles.step}>
              <div style={{ ...styles.stepIcon, ...{ animation: `slide-in 0.4s ease ${i * 0.1}s both` } }}>
                ✓
              </div>
              <span style={styles.stepText}>{step}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  container: {
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
    padding: '20px'
  },
  loaderWrapper: {
    marginBottom: '40px'
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '3px solid #f0f0f0',
    borderTop: '3px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 8px 0'
  },
  subtitle: {
    fontSize: '14px',
    color: '#999',
    margin: '0 0 40px 0'
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: '#f5f5f5',
    borderRadius: '8px'
  },
  stepIcon: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#3b82f6',
    color: '#fff',
    borderRadius: '50%',
    fontSize: '12px',
    fontWeight: '600',
    flexShrink: 0
  },
  stepText: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500'
  }
}