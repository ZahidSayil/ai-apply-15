import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function Upload() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleFile(file) {
    if (!file) return
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum 10MB.')
      return
    }

    setError('')
    setLoading(true)
    setFileName(file.name)

    const formData = new FormData()
    formData.append('resume', file)

    try {
      const res = await axios.post('/api/upload-resume', formData, { timeout: 30000 })
      localStorage.setItem('resumeText', res.data.resumeText)
      localStorage.setItem('resumeFileName', file.name)
      navigate('/job')
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Upload failed'
      const hint = err?.response?.data?.hint || ''
      setError(`${msg}${hint ? '\n' + hint : ''}`)
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Brand */}
        <div style={styles.brand}>
          apply<span style={styles.brandAccent}>ai</span>
        </div>

        <div style={styles.header}>
          <h1 style={styles.title}>Land your dream job</h1>
          <p style={styles.subtitle}>Upload your resume and we'll tailor it for any position</p>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorIcon}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div
          style={{ ...styles.uploadArea, ...(dragging ? styles.uploadAreaActive : {}), ...(loading ? styles.uploadAreaLoading : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => !loading && document.getElementById('fileInput').click()}
        >
          <input
            id="fileInput"
            type="file"
            accept=".pdf"
            onChange={e => handleFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
          {loading ? (
            <div style={styles.loadingContent}>
              <div style={styles.spinner} />
              <p style={styles.loadingText}>Parsing {fileName}...</p>
            </div>
          ) : (
            <div style={styles.uploadContent}>
              <div style={styles.uploadIconCircle}>📄</div>
              <p style={styles.uploadText}>Drop your resume here</p>
              <p style={styles.uploadSubtext}>or click to browse · PDF only · Max 10MB</p>
            </div>
          )}
        </div>

        <div style={styles.features}>
          {['AI-powered tailoring', 'Match scoring', 'Cover letter generation'].map((f, i) => (
            <div key={i} style={styles.feature}>
              <span style={styles.featureCheck}>✓</span>
              <span style={styles.featureText}>{f}</span>
            </div>
          ))}
        </div>

        <p style={styles.privacy}>🔒 Your resume stays private. Processed in memory, never stored.</p>
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
    maxWidth: '480px',
    animation: 'fadeIn 0.4s ease',
  },
  brand: {
    textAlign: 'center',
    fontSize: '24px',
    fontWeight: '800',
    color: '#111827',
    letterSpacing: '-1px',
    marginBottom: '32px',
  },
  brandAccent: { color: '#2563eb' },
  header: {
    marginBottom: '32px',
    textAlign: 'center',
  },
  title: {
    fontSize: '34px',
    fontWeight: '800',
    color: '#111827',
    margin: '0 0 10px 0',
    lineHeight: '1.15',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#6b7280',
    margin: '0',
    lineHeight: '1.5',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '10px',
    marginBottom: '16px',
    fontSize: '14px',
    color: '#991b1b',
  },
  errorIcon: { fontSize: '16px', flexShrink: 0 },
  uploadArea: {
    border: '2px dashed #d1d5db',
    borderRadius: '16px',
    padding: '48px 20px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginBottom: '24px',
    background: '#ffffff',
    textAlign: 'center',
  },
  uploadAreaActive: {
    borderColor: '#2563eb',
    background: '#eff6ff',
  },
  uploadAreaLoading: {
    cursor: 'default',
    borderColor: '#93c5fd',
    background: '#f0f7ff',
  },
  uploadContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  uploadIconCircle: {
    fontSize: '42px',
    marginBottom: '4px',
  },
  uploadText: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#111827',
    margin: '0',
  },
  uploadSubtext: {
    fontSize: '13px',
    color: '#9ca3af',
    margin: '0',
  },
  loadingContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: '15px',
    color: '#6b7280',
    margin: '0',
    fontWeight: '500',
  },
  features: {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  feature: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  featureCheck: {
    color: '#059669',
    fontWeight: '700',
    fontSize: '14px',
  },
  featureText: {
    fontSize: '13px',
    color: '#6b7280',
  },
  privacy: {
    fontSize: '12px',
    color: '#9ca3af',
    margin: '0',
    textAlign: 'center',
  },
}