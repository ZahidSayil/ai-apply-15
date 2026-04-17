import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const EMPTY_EXP = { role: '', company: '', duration: '', bullets: '' }
const EMPTY_EDU = { degree: '', institution: '', year: '' }

function formToResumeText(f) {
  const lines = []
  if (f.name) lines.push(f.name)
  const contacts = [f.email, f.phone, f.location, f.linkedin].filter(Boolean)
  if (contacts.length) lines.push(contacts.join(' | '))
  lines.push('')

  if (f.summary.trim()) {
    lines.push('PROFESSIONAL SUMMARY')
    lines.push(f.summary.trim())
    lines.push('')
  }

  if (f.experience.some(e => e.role || e.company)) {
    lines.push('EXPERIENCE')
    for (const exp of f.experience) {
      if (!exp.role && !exp.company) continue
      lines.push(`${exp.role}${exp.company ? ' — ' + exp.company : ''}${exp.duration ? ' (' + exp.duration + ')' : ''}`)
      if (exp.bullets.trim()) {
        for (const b of exp.bullets.split('\n').filter(Boolean)) {
          lines.push(`- ${b.replace(/^[-•*]\s*/, '')}`)
        }
      }
      lines.push('')
    }
  }

  if (f.education.some(e => e.degree || e.institution)) {
    lines.push('EDUCATION')
    for (const edu of f.education) {
      if (!edu.degree && !edu.institution) continue
      lines.push(`${edu.degree}${edu.institution ? ' — ' + edu.institution : ''}${edu.year ? ' (' + edu.year + ')' : ''}`)
    }
    lines.push('')
  }

  if (f.skills.trim()) {
    lines.push('SKILLS')
    lines.push(f.skills.trim())
    lines.push('')
  }

  if (f.languages.trim()) {
    lines.push('LANGUAGES')
    lines.push(f.languages.trim())
    lines.push('')
  }

  if (f.certifications.trim()) {
    lines.push('CERTIFICATIONS')
    lines.push(f.certifications.trim())
    lines.push('')
  }

  return lines.join('\n')
}

export default function Upload() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState('upload')
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '', email: '', phone: '', location: '', linkedin: '',
    summary: '',
    experience: [{ ...EMPTY_EXP }],
    education: [{ ...EMPTY_EDU }],
    skills: '',
    languages: '',
    certifications: '',
  })

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function updateExp(i, field, value) {
    setForm(prev => {
      const experience = [...prev.experience]
      experience[i] = { ...experience[i], [field]: value }
      return { ...prev, experience }
    })
  }

  function updateEdu(i, field, value) {
    setForm(prev => {
      const education = [...prev.education]
      education[i] = { ...education[i], [field]: value }
      return { ...prev, education }
    })
  }

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

  function handleBuildSubmit() {
    if (!form.name.trim()) {
      setError('Please enter your full name')
      return
    }
    const hasExp = form.experience.some(e => e.role.trim() || e.company.trim())
    const hasEdu = form.education.some(e => e.degree.trim() || e.institution.trim())
    if (!hasExp && !hasEdu && !form.skills.trim()) {
      setError('Please fill in at least your experience, education, or skills')
      return
    }
    setError('')
    const text = formToResumeText(form)
    localStorage.setItem('resumeText', text)
    localStorage.setItem('resumeFileName', `${form.name.trim()}'s resume`)
    navigate('/job')
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.brand}>
          CV<span style={styles.brandAccent}>ibe</span>
        </div>

        <div style={styles.header}>
          <div style={styles.step}>Step 1 of 3</div>
          <h1 style={styles.title}>Tailor your resume in seconds</h1>
          <p style={styles.subtitle}>
            Upload your existing resume, or build one from scratch by filling in your details.
            Our AI will rewrite it to match any job description.
          </p>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorIcon}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tabBtn, ...(tab === 'upload' ? styles.tabBtnActive : {}) }}
            onClick={() => { setTab('upload'); setError('') }}
          >
            📄 I have a resume
          </button>
          <button
            style={{ ...styles.tabBtn, ...(tab === 'build' ? styles.tabBtnActive : {}) }}
            onClick={() => { setTab('build'); setError('') }}
          >
            ✏️ Build from scratch
          </button>
        </div>

        {/* ─── Upload Tab ─── */}
        {tab === 'upload' && (
          <>
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
                  <p style={styles.loadingText}>Reading {fileName}...</p>
                  <p style={styles.loadingSub}>Extracting text from your resume</p>
                </div>
              ) : (
                <div style={styles.uploadContent}>
                  <div style={styles.uploadIconCircle}>📄</div>
                  <p style={styles.uploadText}>Drop your resume here</p>
                  <p style={styles.uploadSubtext}>or click to browse · PDF only · Max 10MB</p>
                </div>
              )}
            </div>

            <div style={styles.howItWorks}>
              <p style={styles.howTitle}>How it works</p>
              <div style={styles.howSteps}>
                {[
                  ['Add your resume', 'Upload a PDF or build one from scratch'],
                  ['Add the job', 'Paste a job URL or description you want to apply for'],
                  ['Get results', 'Tailored resume, skill gap report, and interview prep'],
                ].map(([title, desc], i) => (
                  <div key={i} style={styles.howStep}>
                    <div style={styles.howNum}>{i + 1}</div>
                    <div>
                      <div style={styles.howStepTitle}>{title}</div>
                      <div style={styles.howStepDesc}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── Build Tab ─── */}
        {tab === 'build' && (
          <div style={styles.buildForm}>
            <p style={styles.buildIntro}>
              Fill in what you can — even partial information helps. The AI will
              use whatever you provide to build a professional resume.
            </p>

            {/* Personal Info */}
            <div style={styles.formSection}>
              <div style={styles.formSectionTitle}>Personal information</div>
              <input style={styles.input} placeholder="Full name *" value={form.name} onChange={e => updateForm('name', e.target.value)} />
              <div style={styles.inputRow}>
                <input style={styles.input} placeholder="Email" value={form.email} onChange={e => updateForm('email', e.target.value)} />
                <input style={styles.input} placeholder="Phone" value={form.phone} onChange={e => updateForm('phone', e.target.value)} />
              </div>
              <div style={styles.inputRow}>
                <input style={styles.input} placeholder="City / Country" value={form.location} onChange={e => updateForm('location', e.target.value)} />
                <input style={styles.input} placeholder="LinkedIn URL (optional)" value={form.linkedin} onChange={e => updateForm('linkedin', e.target.value)} />
              </div>
            </div>

            {/* Summary */}
            <div style={styles.formSection}>
              <div style={styles.formSectionTitle}>Professional summary <span style={styles.optional}>(optional)</span></div>
              <textarea
                style={styles.textarea}
                placeholder="A brief 2-3 sentence overview of your background and what you're looking for..."
                rows={3}
                value={form.summary}
                onChange={e => updateForm('summary', e.target.value)}
              />
            </div>

            {/* Experience */}
            <div style={styles.formSection}>
              <div style={styles.formSectionTitle}>Work experience</div>
              {form.experience.map((exp, i) => (
                <div key={i} style={styles.expCard}>
                  {form.experience.length > 1 && (
                    <div style={styles.expCardHeader}>
                      <span style={styles.expCardLabel}>Position {i + 1}</span>
                      <button style={styles.removeBtn} onClick={() => setForm(prev => ({
                        ...prev,
                        experience: prev.experience.filter((_, j) => j !== i)
                      }))}>Remove</button>
                    </div>
                  )}
                  <input style={styles.input} placeholder="Job title (e.g. Project Manager)" value={exp.role} onChange={e => updateExp(i, 'role', e.target.value)} />
                  <div style={styles.inputRow}>
                    <input style={styles.input} placeholder="Company / Organization" value={exp.company} onChange={e => updateExp(i, 'company', e.target.value)} />
                    <input style={styles.input} placeholder="Duration (e.g. 2020 - 2023)" value={exp.duration} onChange={e => updateExp(i, 'duration', e.target.value)} />
                  </div>
                  <textarea
                    style={styles.textarea}
                    placeholder="What did you do? One accomplishment per line, e.g.&#10;Managed a team of 12 staff across 3 provinces&#10;Trained 200+ teachers on new curriculum"
                    rows={4}
                    value={exp.bullets}
                    onChange={e => updateExp(i, 'bullets', e.target.value)}
                  />
                </div>
              ))}
              <button style={styles.addBtn} onClick={() => setForm(prev => ({
                ...prev,
                experience: [...prev.experience, { ...EMPTY_EXP }]
              }))}>
                + Add another position
              </button>
            </div>

            {/* Education */}
            <div style={styles.formSection}>
              <div style={styles.formSectionTitle}>Education</div>
              {form.education.map((edu, i) => (
                <div key={i} style={styles.expCard}>
                  {form.education.length > 1 && (
                    <div style={styles.expCardHeader}>
                      <span style={styles.expCardLabel}>Education {i + 1}</span>
                      <button style={styles.removeBtn} onClick={() => setForm(prev => ({
                        ...prev,
                        education: prev.education.filter((_, j) => j !== i)
                      }))}>Remove</button>
                    </div>
                  )}
                  <input style={styles.input} placeholder="Degree / Diploma (e.g. Bachelor of Education)" value={edu.degree} onChange={e => updateEdu(i, 'degree', e.target.value)} />
                  <div style={styles.inputRow}>
                    <input style={styles.input} placeholder="School / University" value={edu.institution} onChange={e => updateEdu(i, 'institution', e.target.value)} />
                    <input style={{...styles.input, maxWidth: '140px'}} placeholder="Year (e.g. 2018)" value={edu.year} onChange={e => updateEdu(i, 'year', e.target.value)} />
                  </div>
                </div>
              ))}
              <button style={styles.addBtn} onClick={() => setForm(prev => ({
                ...prev,
                education: [...prev.education, { ...EMPTY_EDU }]
              }))}>
                + Add another education
              </button>
            </div>

            {/* Skills */}
            <div style={styles.formSection}>
              <div style={styles.formSectionTitle}>Skills</div>
              <textarea
                style={styles.textarea}
                placeholder="List your skills, separated by commas. e.g.&#10;Project management, Microsoft Office, Data analysis, Report writing, Team leadership"
                rows={3}
                value={form.skills}
                onChange={e => updateForm('skills', e.target.value)}
              />
            </div>

            {/* Languages */}
            <div style={styles.formSection}>
              <div style={styles.formSectionTitle}>Languages <span style={styles.optional}>(optional)</span></div>
              <input
                style={styles.input}
                placeholder="e.g. English (Fluent), Dari (Native), Pashto (Intermediate)"
                value={form.languages}
                onChange={e => updateForm('languages', e.target.value)}
              />
            </div>

            {/* Certifications */}
            <div style={styles.formSection}>
              <div style={styles.formSectionTitle}>Certifications & trainings <span style={styles.optional}>(optional)</span></div>
              <textarea
                style={styles.textarea}
                placeholder="One per line, e.g.&#10;PMP Certification — PMI (2022)&#10;First Aid Training — Red Cross (2021)"
                rows={3}
                value={form.certifications}
                onChange={e => updateForm('certifications', e.target.value)}
              />
            </div>

            <button style={styles.submitBtn} onClick={handleBuildSubmit}>
              Continue to job details →
            </button>
          </div>
        )}

        <p style={styles.privacy}>🔒 Your data stays private — processed in memory, never stored on our servers.</p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 50%)',
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 20px 40px',
  },
  container: {
    width: '100%',
    maxWidth: '560px',
    animation: 'fadeIn 0.4s ease',
    marginTop: '40px',
  },
  brand: {
    textAlign: 'center',
    fontSize: '24px',
    fontWeight: '800',
    color: '#111827',
    letterSpacing: '-1px',
    marginBottom: '28px',
  },
  brandAccent: { color: '#2563eb' },
  header: {
    marginBottom: '28px',
    textAlign: 'center',
  },
  step: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: '700',
    color: '#2563eb',
    background: '#eff6ff',
    padding: '4px 12px',
    borderRadius: '20px',
    marginBottom: '14px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: '32px',
    fontWeight: '800',
    color: '#111827',
    margin: '0 0 12px 0',
    lineHeight: '1.15',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#6b7280',
    margin: '0',
    lineHeight: '1.6',
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

  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    background: '#f3f4f6',
    borderRadius: '10px',
    padding: '4px',
  },
  tabBtn: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  tabBtnActive: {
    background: '#ffffff',
    color: '#111827',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },

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
  uploadAreaActive: { borderColor: '#2563eb', background: '#eff6ff' },
  uploadAreaLoading: { cursor: 'default', borderColor: '#93c5fd', background: '#f0f7ff' },
  uploadContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  uploadIconCircle: { fontSize: '42px', marginBottom: '4px' },
  uploadText: { fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0' },
  uploadSubtext: { fontSize: '13px', color: '#9ca3af', margin: '0' },
  loadingContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  spinner: {
    width: '36px', height: '36px',
    border: '3px solid #e5e7eb', borderTop: '3px solid #2563eb',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '8px',
  },
  loadingText: { fontSize: '15px', color: '#111827', margin: '0', fontWeight: '600' },
  loadingSub: { fontSize: '13px', color: '#9ca3af', margin: '0' },

  howItWorks: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '20px',
  },
  howTitle: { fontSize: '13px', fontWeight: '700', color: '#374151', margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.5px' },
  howSteps: { display: 'flex', flexDirection: 'column', gap: '14px' },
  howStep: { display: 'flex', gap: '12px', alignItems: 'flex-start' },
  howNum: {
    width: '28px', height: '28px', borderRadius: '50%',
    background: '#eff6ff', color: '#2563eb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '13px', fontWeight: '700', flexShrink: 0,
  },
  howStepTitle: { fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '2px' },
  howStepDesc: { fontSize: '13px', color: '#6b7280', lineHeight: '1.4' },

  /* ─── Build Form ─── */
  buildForm: { animation: 'fadeIn 0.3s ease' },
  buildIntro: {
    fontSize: '14px', color: '#6b7280', lineHeight: 1.6,
    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
    padding: '12px 16px', marginBottom: '20px',
  },
  formSection: { marginBottom: '20px' },
  formSectionTitle: {
    fontSize: '14px', fontWeight: '700', color: '#111827',
    marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px',
  },
  optional: { fontSize: '12px', fontWeight: '400', color: '#9ca3af' },
  input: {
    width: '100%', padding: '11px 14px', borderRadius: '10px',
    border: '1px solid #d1d5db', background: '#ffffff', color: '#111827',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
    marginBottom: '8px', fontFamily: 'inherit',
  },
  inputRow: { display: 'flex', gap: '8px' },
  textarea: {
    width: '100%', padding: '11px 14px', borderRadius: '10px',
    border: '1px solid #d1d5db', background: '#ffffff', color: '#111827',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', resize: 'vertical', lineHeight: '1.6', marginBottom: '8px',
  },
  expCard: {
    background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px',
    padding: '14px', marginBottom: '10px',
  },
  expCardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px',
  },
  expCardLabel: { fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' },
  removeBtn: {
    background: 'none', border: 'none', fontSize: '12px',
    color: '#dc2626', cursor: 'pointer', fontWeight: '600',
  },
  addBtn: {
    width: '100%', padding: '10px', borderRadius: '10px',
    border: '1px dashed #d1d5db', background: 'transparent',
    color: '#2563eb', fontSize: '13px', fontWeight: '600',
    cursor: 'pointer',
  },
  submitBtn: {
    width: '100%', padding: '16px', borderRadius: '12px',
    border: 'none', background: '#2563eb', color: '#fff',
    fontSize: '16px', fontWeight: '700', cursor: 'pointer',
    transition: 'all 0.2s ease', marginTop: '8px', marginBottom: '20px',
  },

  privacy: { fontSize: '12px', color: '#9ca3af', margin: '0', textAlign: 'center' },
}
