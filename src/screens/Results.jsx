import { useNavigate } from 'react-router-dom'

export default function Results() {
  const navigate = useNavigate()
  const raw = localStorage.getItem('results')
  if (!raw) { navigate('/'); return null }
  const data = JSON.parse(raw)

  function copyText(text, label) {
    navigator.clipboard.writeText(text)
    alert(`${label} copied to clipboard!`)
  }

  const scoreColor = data.matchScore >= 75 ? '#5cba8a' : data.matchScore >= 50 ? '#f5a623' : '#e05c5c'

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>apply<span style={styles.accent}>ai</span></div>

        {/* Match Score */}
        <div style={styles.scoreBox}>
          <div style={{ ...styles.scoreBig, color: scoreColor }}>{data.matchScore}%</div>
          <div style={styles.scoreLabel}>{data.matchLabel}</div>
          <div style={styles.scoreReason}>{data.matchReason}</div>
        </div>

        {/* Changes made */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>✏️ Resume changes made</div>
          {data.changes?.map((c, i) => (
            <div key={i} style={styles.changeRow}>
              <span style={styles.changeDot}>→</span>
              <span style={styles.changeText}>{c}</span>
            </div>
          ))}
        </div>

        {/* Tailored Resume */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>📄 Tailored resume</div>
          <div style={styles.previewBox}>{data.tailoredResume?.slice(0, 300)}...</div>
          <button style={styles.copyBtn} onClick={() => copyText(data.tailoredResume, 'Tailored resume')}>
            Copy full resume
          </button>
        </div>

        {/* Cover Letter */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>✉️ Cover letter</div>
          <div style={styles.previewBox}>{data.coverLetter?.slice(0, 300)}...</div>
          <button style={styles.copyBtn} onClick={() => copyText(data.coverLetter, 'Cover letter')}>
            Copy cover letter
          </button>
        </div>

        {/* Tips */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>💡 Resume tips</div>
          {data.resumeTips?.map((t, i) => (
            <div key={i} style={styles.changeRow}>
              <span style={styles.changeDot}>•</span>
              <span style={styles.changeText}>{t}</span>
            </div>
          ))}
        </div>

        <button style={styles.resetBtn} onClick={() => { localStorage.clear(); navigate('/') }}>
          Apply to another job
        </button>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#0a0a0f', padding: '20px', display: 'flex', justifyContent: 'center' },
  card: { width: '100%', maxWidth: '420px' },
  logo: { fontFamily: 'system-ui', fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '20px', letterSpacing: '-1px' },
  accent: { color: '#7c6af7' },
  scoreBox: { background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: '16px', padding: '24px', textAlign: 'center', marginBottom: '16px' },
  scoreBig: { fontSize: '52px', fontWeight: '800', lineHeight: 1 },
  scoreLabel: { fontSize: '16px', fontWeight: '600', color: '#fff', margin: '8px 0 4px' },
  scoreReason: { fontSize: '13px', color: '#888', lineHeight: 1.5 },
  section: { background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: '16px', padding: '16px', marginBottom: '12px' },
  sectionTitle: { fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '12px' },
  changeRow: { display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'flex-start' },
  changeDot: { color: '#7c6af7', fontWeight: '700', flexShrink: 0 },
  changeText: { fontSize: '13px', color: '#aaa', lineHeight: 1.5 },
  previewBox: { fontSize: '12px', color: '#666', lineHeight: 1.6, marginBottom: '10px', maxHeight: '80px', overflow: 'hidden' },
  copyBtn: { width: '100%', padding: '11px', borderRadius: '10px', border: '1px solid #2a2a45', background: '#1a1a2e', color: '#a99af7', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  resetBtn: { width: '100%', padding: '15px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #7c6af7, #c47af0)', color: '#fff', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginTop: '8px', marginBottom: '40px' }
}