import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import html2pdf from 'html2pdf.js'

export default function Results() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('resume')
  const [copied, setCopied] = useState('')
  const [showFormats, setShowFormats] = useState(null)
  
  const raw = localStorage.getItem('results')
  if (!raw) { navigate('/'); return null }
  const data = JSON.parse(raw)

  const toText = (v) => {
    if (typeof v === 'string') return v
    if (v == null) return ''
    if (typeof v === 'object') return JSON.stringify(v, null, 2)
    return String(v)
  }

  const resumeText = toText(data.tailoredResume)
  const coverText = toText(data.coverLetter)

  function copyText(text, label) {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadPDF(text, filename) {
    try {
      const element = document.createElement('div')
      element.innerHTML = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; color: #333;">
          <div style="white-space: pre-wrap; word-wrap: break-word; font-size: 11px;">
            ${text.split('\n').map(line => `<p style="margin: 5px 0;">${escapeHtml(line)}</p>`).join('')}
          </div>
        </div>
      `

      const options = {
        margin: 10,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
      }

      html2pdf().set(options).from(element).save()
    } catch {
      console.error('PDF generation error')
      alert('Error generating PDF. Falling back to TXT.')
      downloadText(text, filename.replace('.pdf', '.txt'))
    }
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }
    return text.replace(/[&<>"']/g, m => map[m])
  }

  const scoreColor = data.matchScore >= 75 ? '#10b981' : data.matchScore >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← Back</button>

        <div style={styles.header}>
          <h1 style={styles.title}>Your Results</h1>
          <p style={styles.subtitle}>Ready to apply? Here's your tailored profile</p>
        </div>

        <div style={styles.scoreCard}>
          <div style={styles.scoreCircle}>
            <div style={{ ...styles.scoreBig, color: scoreColor }}>{data.matchScore}%</div>
          </div>
          <div>
            <h3 style={styles.scoreTitle}>{data.matchLabel}</h3>
            <p style={styles.scoreDesc}>{data.matchReason}</p>
          </div>
        </div>

        <div style={styles.tabs}>
          {[
            { id: 'resume', label: 'Resume', icon: '📄' },
            { id: 'cover', label: 'Cover Letter', icon: '✉️' },
            { id: 'changes', label: 'Changes', icon: '✏️' },
            { id: 'tips', label: 'Tips', icon: '💡' }
          ].map(tab => (
            <button
              key={tab.id}
              style={{ ...styles.tab, ...(activeTab === tab.id ? styles.tabActive : {}) }}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={styles.tabIcon}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Resume Tab */}
        {activeTab === 'resume' && (
          <div style={styles.tabContent}>
            <div style={styles.textBox}>{resumeText}</div>
            <div style={styles.btnRow}>
              <button style={styles.copyBtn} onClick={() => copyText(resumeText, 'resume')}>
                {copied === 'resume' ? '✓ Copied' : '📋 Copy'}
              </button>
              <div style={styles.downloadMenu}>
                <button style={styles.downloadBtn} onClick={() => setShowFormats(showFormats === 'resume' ? null : 'resume')}>
                  ⬇️ Download
                </button>
                {showFormats === 'resume' && (
                  <div style={styles.formatOptions}>
                    <button style={styles.formatBtn} onClick={() => { downloadPDF(resumeText, 'tailored-resume.pdf'); setShowFormats(null); }}>PDF</button>
                    <button style={styles.formatBtn} onClick={() => { downloadText(resumeText, 'tailored-resume.txt'); setShowFormats(null); }}>TXT</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cover Letter Tab */}
        {activeTab === 'cover' && (
          <div style={styles.tabContent}>
            <div style={styles.textBox}>{coverText}</div>
            <div style={styles.btnRow}>
              <button style={styles.copyBtn} onClick={() => copyText(coverText, 'cover')}>
                {copied === 'cover' ? '✓ Copied' : '📋 Copy'}
              </button>
              <div style={styles.downloadMenu}>
                <button style={styles.downloadBtn} onClick={() => setShowFormats(showFormats === 'cover' ? null : 'cover')}>
                  ⬇️ Download
                </button>
                {showFormats === 'cover' && (
                  <div style={styles.formatOptions}>
                    <button style={styles.formatBtn} onClick={() => { downloadPDF(coverText, 'cover-letter.pdf'); setShowFormats(null); }}>PDF</button>
                    <button style={styles.formatBtn} onClick={() => { downloadText(coverText, 'cover-letter.txt'); setShowFormats(null); }}>TXT</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Changes Tab */}
        {activeTab === 'changes' && (
          <div style={styles.tabContent}>
            {data.changes?.map((c, i) => (
              <div key={i} style={styles.listItem}>
                <span style={styles.listIcon}>→</span>
                <span style={styles.listText}>{c}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tips Tab */}
        {activeTab === 'tips' && (
          <div style={styles.tabContent}>
            {data.resumeTips?.map((t, i) => (
              <div key={i} style={styles.listItem}>
                <span style={{ ...styles.listIcon, color: '#f5a623' }}>{i + 1}.</span>
                <span style={styles.listText}>{t}</span>
              </div>
            ))}
          </div>
        )}

        {/* Apply Again */}
        <button style={styles.primaryBtn} onClick={() => {
          localStorage.removeItem('jobText')
          localStorage.removeItem('jobUrl')
          localStorage.removeItem('results')
          navigate('/job')
        }}>
          Apply to another job
        </button>

        <button style={styles.secondaryBtn} onClick={() => {
          localStorage.clear()
          navigate('/')
        }}>
          Start over with new resume
        </button>

      </div>
    </div>
  )
}

const styles = {
  page: { 
    minHeight: '100vh', 
    background: '#fff',
    padding: '20px',
    display: 'flex', 
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  container: { 
    width: '100%', 
    maxWidth: '600px'
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
    marginBottom: '32px'
  },
  title: { 
    fontSize: '32px', 
    fontWeight: '700', 
    color: '#1a1a1a', 
    margin: '0 0 8px 0'
  },
  subtitle: { 
    fontSize: '16px', 
    color: '#666', 
    margin: '0'
  },
  scoreCard: {
    display: 'flex',
    gap: '24px',
    alignItems: 'center',
    background: '#f9f9f9',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '32px'
  },
  scoreCircle: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    background: '#f0f9ff',
    border: '2px solid #e0f2fe',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  scoreBig: { 
    fontSize: '48px', 
    fontWeight: '800',
    margin: '0'
  },
  scoreTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0'
  },
  scoreDesc: {
    fontSize: '14px',
    color: '#666',
    margin: '8px 0 0 0'
  },
  tabs: { 
    display: 'flex', 
    gap: '8px', 
    marginBottom: '24px',
    borderBottom: '1px solid #e5e7eb',
    overflowX: 'auto',
    paddingBottom: '0'
  },
  tab: { 
    padding: '12px 16px', 
    borderRadius: '0',
    border: 'none', 
    borderBottom: '3px solid transparent',
    background: 'none',
    color: '#999', 
    fontSize: '14px', 
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.3s ease'
  },
  tabIcon: {
    marginRight: '6px'
  },
  tabActive: { 
    color: '#1a1a1a',
    borderBottom: '3px solid #3b82f6'
  },
  tabContent: { 
    background: '#f9f9f9', 
    border: '1px solid #e5e7eb', 
    borderRadius: '12px', 
    padding: '20px', 
    marginBottom: '20px'
  },
  textBox: { 
    fontSize: '14px', 
    color: '#333', 
    lineHeight: '1.7',
    whiteSpace: 'pre-wrap', 
    wordBreak: 'break-word', 
    maxHeight: '500px', 
    overflowY: 'auto', 
    marginBottom: '16px',
    background: '#fff',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb'
  },
  btnRow: { 
    display: 'flex', 
    gap: '12px'
  },
  downloadMenu: { 
    position: 'relative'
  },
  copyBtn: { 
    flex: 1, 
    padding: '12px', 
    borderRadius: '8px', 
    border: 'none', 
    background: '#3b82f6', 
    color: '#fff', 
    fontSize: '14px', 
    fontWeight: '600', 
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  downloadBtn: { 
    padding: '12px 16px', 
    borderRadius: '8px', 
    border: '1px solid #e5e7eb', 
    background: '#fff', 
    color: '#666', 
    fontSize: '14px', 
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  formatOptions: { 
    position: 'absolute', 
    top: '100%', 
    right: 0, 
    background: '#fff', 
    border: '1px solid #e5e7eb', 
    borderRadius: '8px', 
    padding: '8px', 
    zIndex: 10, 
    minWidth: '120px', 
    marginTop: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
  },
  formatBtn: { 
    display: 'block', 
    width: '100%', 
    padding: '10px 12px', 
    borderRadius: '6px', 
    border: 'none', 
    background: 'transparent', 
    color: '#666', 
    fontSize: '13px', 
    cursor: 'pointer', 
    textAlign: 'left',
    transition: 'all 0.2s'
  },
  listItem: { 
    display: 'flex', 
    gap: '12px', 
    marginBottom: '12px', 
    alignItems: 'flex-start'
  },
  listIcon: { 
    color: '#3b82f6', 
    fontWeight: '700', 
    flexShrink: 0, 
    marginTop: '2px'
  },
  listText: { 
    fontSize: '14px', 
    color: '#333', 
    lineHeight: '1.6'
  },
  primaryBtn: { 
    width: '100%', 
    padding: '14px', 
    borderRadius: '8px', 
    border: 'none', 
    background: '#3b82f6', 
    color: '#fff', 
    fontSize: '15px', 
    fontWeight: '600', 
    cursor: 'pointer',
    marginBottom: '12px',
    transition: 'all 0.3s ease'
  },
  secondaryBtn: { 
    width: '100%', 
    padding: '14px', 
    borderRadius: '8px', 
    border: '1px solid #e5e7eb', 
    background: '#fff', 
    color: '#666', 
    fontSize: '15px', 
    fontWeight: '600', 
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  }
}