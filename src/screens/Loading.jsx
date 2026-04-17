import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const STEPS = [
  { label: 'Reading your resume and extracting key details', duration: 2000 },
  { label: 'Analyzing what the employer is looking for', duration: 3000 },
  { label: 'Matching your skills against job requirements', duration: 4000 },
  { label: 'Rewriting bullet points to highlight relevant experience', duration: 5000 },
  { label: 'Building your tailored resume and gap analysis', duration: 6000 },
]

export default function Loading() {
  const navigate = useNavigate()
  const didRun = useRef(false)
  const [activeStep, setActiveStep] = useState(0)
  const [error, setError] = useState('')

  // Animate steps
  useEffect(() => {
    const timers = STEPS.map((_, i) =>
      setTimeout(() => setActiveStep(i), STEPS[i].duration)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // Call API
  useEffect(() => {
    if (didRun.current) return
    didRun.current = true

    async function run() {
      const resumeText = localStorage.getItem('resumeText')
      const jobText = localStorage.getItem('jobText')
      const optionsRaw = localStorage.getItem('analysisOptions')
      const options = optionsRaw ? JSON.parse(optionsRaw) : { includeCoverLetter: false, depthMode: 'concise' }

      if (!resumeText || !jobText) {
        navigate('/')
        return
      }

      try {
        const res = await axios.post(
          '/api/analyze',
          { resumeText, jobText, options },
          { timeout: 60000 } // 60s timeout for AI
        )
        localStorage.setItem('results', JSON.stringify(res.data))
        navigate('/results')
      } catch (err) {
        const msg = err?.response?.data?.error || err?.message || 'Analysis failed'
        setError(msg)
      }
    }
    run()
  }, [navigate])

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.errorIcon}>😞</div>
          <h1 style={styles.errorTitle}>Analysis Failed</h1>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.retryBtn} onClick={() => { setError(''); didRun.current = false; window.location.reload() }}>
            🔄 Try Again
          </button>
          <button style={styles.backBtn} onClick={() => navigate('/job')}>
            ← Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.brand}>CV<span style={styles.brandAccent}>ibe</span></div>
        <div style={styles.step}>Step 3 of 3</div>
        <div style={styles.spinner} />
        <h1 style={styles.title}>Tailoring your resume...</h1>
        <p style={styles.subtitle}>Our AI is rewriting your resume to match this job. This usually takes 15–30 seconds.</p>

        <div style={styles.stepsList}>
          {STEPS.map((step, i) => {
            const isActive = i === activeStep
            const isDone = i < activeStep
            return (
              <div key={i} style={{
                ...styles.step,
                ...(isActive ? styles.stepActive : {}),
                ...(isDone ? styles.stepDone : {}),
              }}>
                <div style={{
                  ...styles.stepDot,
                  ...(isDone ? styles.stepDotDone : {}),
                  ...(isActive ? styles.stepDotActive : {}),
                }}>
                  {isDone ? '✓' : (i + 1)}
                </div>
                <span style={{
                  ...styles.stepText,
                  ...(isActive ? styles.stepTextActive : {}),
                  ...(isDone ? styles.stepTextDone : {}),
                }}>{step.label}</span>
              </div>
            )
          })}
        </div>
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
    maxWidth: '400px',
    textAlign: 'center',
    animation: 'fadeIn 0.5s ease',
  },
  brand: {
    fontSize: '22px',
    fontWeight: '800',
    color: '#111827',
    letterSpacing: '-1px',
    marginBottom: '32px',
  },
  brandAccent: { color: '#2563eb' },
  step: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: '700',
    color: '#2563eb',
    background: '#eff6ff',
    padding: '4px 12px',
    borderRadius: '20px',
    marginBottom: '20px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 32px auto',
  },
  title: {
    fontSize: '26px',
    fontWeight: '800',
    color: '#111827',
    margin: '0 0 8px 0',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#9ca3af',
    margin: '0 0 36px 0',
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    textAlign: 'left',
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: '#f9fafb',
    borderRadius: '10px',
    transition: 'all 0.3s ease',
  },
  stepActive: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
  },
  stepDone: {
    background: '#f0fdf4',
  },
  stepDot: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    background: '#e5e7eb',
    color: '#9ca3af',
    fontSize: '12px',
    fontWeight: '700',
    flexShrink: 0,
    transition: 'all 0.3s ease',
  },
  stepDotActive: {
    background: '#2563eb',
    color: '#fff',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  stepDotDone: {
    background: '#059669',
    color: '#fff',
  },
  stepText: {
    fontSize: '14px',
    color: '#9ca3af',
    fontWeight: '500',
    transition: 'all 0.3s ease',
  },
  stepTextActive: {
    color: '#1e40af',
    fontWeight: '600',
  },
  stepTextDone: {
    color: '#059669',
  },
  // Error state
  errorIcon: { fontSize: '48px', marginBottom: '16px' },
  errorTitle: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: '0 0 8px 0' },
  errorText: { fontSize: '14px', color: '#6b7280', marginBottom: '24px', lineHeight: '1.6' },
  retryBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '8px',
  },
  backBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #e5e7eb',
    background: 'transparent',
    color: '#6b7280',
    fontSize: '14px',
    cursor: 'pointer',
  },
}