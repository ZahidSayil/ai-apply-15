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
    } catch (err) {
      alert('Failed to parse PDF. Try again.')
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>apply<span style={styles.logoAccent}>ai</span></div>
        <h1 style={styles.title}>Land your dream job faster</h1>
        <p style={styles.sub}>Upload your resume once. We'll tailor it to every job.</p>

        <div
          style={{ ...styles.dropzone, ...(dragging ? styles.dropzoneActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById('fileInput').click()}
        >
          <div style={styles.uploadIcon}>📄</div>
          {loading
            ? <p style={styles.dropText}>Parsing <b>{fileName}</b>...</p>
            : <><p style={styles.dropText}>Drop your resume here</p>
               <p style={styles.dropSub}>or tap to browse · PDF only</p></>
          }
        </div>

        <input id="fileInput" type="file" accept=".pdf"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])} />

        <p style={styles.hint}>Your resume stays on your device. Never stored.</p>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  card: { width: '100%', maxWidth: '400px', textAlign: 'center' },
  logo: { fontFamily: 'system-ui', fontSize: '28px', fontWeight: '700', color: '#fff', marginBottom: '24px', letterSpacing: '-1px' },
  logoAccent: { color: '#7c6af7' },
  title: { fontSize: '24px', fontWeight: '700', color: '#fff', marginBottom: '8px', lineHeight: 1.2 },
  sub: { fontSize: '14px', color: '#888', marginBottom: '32px' },
  dropzone: { border: '2px dashed #2a2a45', borderRadius: '16px', padding: '40px 20px', cursor: 'pointer', transition: 'border-color 0.2s', marginBottom: '16px', background: '#0f0f1a' },
  dropzoneActive: { borderColor: '#7c6af7', background: '#1a1a2e' },
  uploadIcon: { fontSize: '40px', marginBottom: '12px' },
  dropText: { fontSize: '15px', color: '#fff', fontWeight: '500', marginBottom: '4px' },
  dropSub: { fontSize: '13px', color: '#555' },
  hint: { fontSize: '12px', color: '#444', marginTop: '8px' }
}