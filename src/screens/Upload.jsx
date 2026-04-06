import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function Upload() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const navigate = useNavigate()

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
      alert('Please upload a PDF file')
      return
    }
    setLoading(true)
    setFileName(file.name)
    const formData = new FormData()
    formData.append('resume', file)
    try {
      const res = await axios.post('http://127.0.0.1:3001/upload-resume', formData)
      localStorage.setItem('resumeText', res.data.resumeText)
      localStorage.setItem('resumeFileName', file.name)
      navigate('/job')
    } catch {
      alert('Failed to parse PDF. Try again.')
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Land your dream job</h1>
          <p style={styles.subtitle}>Upload your resume to get started</p>
        </div>

        <div
          style={{ ...styles.uploadArea, ...(dragging ? styles.uploadAreaActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById('fileInput').click()}
        >
          <input
            id="fileInput"
            type="file"
            accept=".pdf"
            onChange={e => handleFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
          {loading ? (
            <div>
              <p style={styles.loadingText}>Parsing {fileName}...</p>
              <div style={styles.spinner} />
            </div>
          ) : (
            <div style={styles.uploadContent}>
              <p style={styles.uploadIcon}>📄</p>
              <p style={styles.uploadText}>Drop your resume here</p>
              <p style={styles.uploadSubtext}>or click to browse (PDF only)</p>
            </div>
          )}
        </div>

        <p style={styles.privacy}>Your resume stays private. Never stored on our servers.</p>
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
  header: { 
    marginBottom: '40px', 
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
  uploadArea: { 
    border: '2px dashed #e0e0e0', 
    borderRadius: '12px', 
    padding: '60px 20px', 
    cursor: 'pointer', 
    transition: 'all 0.3s ease',
    marginBottom: '24px', 
    background: '#f9f9f9',
    textAlign: 'center'
  },
  uploadAreaActive: { 
    borderColor: '#3b82f6', 
    background: '#eff6ff',
    borderWidth: '2px'
  },
  uploadContent: { 
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  uploadIcon: { 
    fontSize: '48px', 
    margin: '0'
  },
  uploadText: { 
    fontSize: '16px', 
    fontWeight: '600', 
    color: '#1a1a1a',
    margin: '0'
  },
  uploadSubtext: { 
    fontSize: '14px', 
    color: '#999',
    margin: '0'
  },
  loadingText: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 16px 0',
    fontWeight: '500'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #f0f0f0',
    borderTop: '3px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto'
  },
  privacy: { 
    fontSize: '13px', 
    color: '#999',
    margin: '0',
    textAlign: 'center'
  }
}

// Add spin animation
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`
document.head.appendChild(styleSheet)