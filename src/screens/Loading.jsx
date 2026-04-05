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
        const res = await axios.post('http://127.0.0.1:3001/analyze', { resumeText, jobText })
        localStorage.setItem('results', JSON.stringify(res.data))
        navigate('/results')
      } catch (err) {
        alert('AI analysis failed. Check your API key.')
        navigate('/job')
      }
    }
    run()
  }, [])

  const steps = ['Reading your resume...', 'Analyzing job requirements...', 'Tailoring your resume...', 'Writing cover letter...']

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>apply<span style={styles.accent}>ai</span></div>
        <div style={styles.dots}>
          <span style={{ ...styles.dot, animationDelay: '0s' }} />
          <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
          <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
        </div>
        <p style={styles.title}>AI is working its magic</p>
        <div style={styles.stepList}>
          {steps.map((s, i) => (
            <div key={i} style={styles.stepRow}>
              <span style={styles.stepDot}>✦</span>
              <span style={styles.stepText}>{s}</span>
            </div>
          ))}
        </div>
        <p style={styles.sub}>Usually takes 10–15 seconds</p>
      </div>
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  card: { width: '100%', maxWidth: '360px', textAlign: 'center' },
  logo: { fontFamily: 'system-ui', fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '32px', letterSpacing: '-1px' },
  accent: { color: '#7c6af7' },
  dots: { display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '24px' },
  dot: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#7c6af7', animation: 'bounce 1.4s ease-in-out infinite' },
  title: { fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '24px' },
  stepList: { textAlign: 'left', background: '#0f0f1a', borderRadius: '12px', padding: '16px', marginBottom: '20px' },
  stepRow: { display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0' },
  stepDot: { color: '#7c6af7', fontSize: '10px' },
  stepText: { fontSize: '13px', color: '#888' },
  sub: { fontSize: '12px', color: '#444' }
}