import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'

function matchScorePercent(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 70
  if (n > 0 && n <= 1) return Math.min(100, Math.round(n * 100))
  if (n > 1 && n <= 100) return Math.round(n)
  if (n > 100) return 100
  return 0
}

/* ──────────────────────────────────────────────
   EditableText — click-to-edit for any text field
   ────────────────────────────────────────────── */
function EditableText({ value, onChange, style, multiline, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef()

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])

  function save() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== value) onChange(trimmed)
  }

  if (editing) {
    const shared = {
      ref,
      value: draft,
      onChange: e => setDraft(e.target.value),
      onBlur: save,
      style: {
        ...style,
        background: '#fff',
        border: '1.5px solid #2563eb',
        borderRadius: '4px',
        outline: 'none',
        padding: '2px 6px',
        fontFamily: 'inherit',
        width: '100%',
        boxSizing: 'border-box',
        margin: 0,
      },
    }
    if (multiline) {
      return <textarea {...shared} rows={3} onKeyDown={e => { if (e.key === 'Escape') save() }} />
    }
    return <input {...shared} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') save() }} />
  }

  const display = value || placeholder || ''
  const isEmpty = !value
  return (
    <div
      className="editable-field"
      onClick={() => setEditing(true)}
      style={{ ...style, cursor: 'pointer', color: isEmpty ? '#9ca3af' : style?.color }}
    >
      {isEmpty ? (placeholder || 'Click to edit') : display}
    </div>
  )
}

/* ──────────────────────────────────────────────
   EditableTag — editable chip with remove
   ────────────────────────────────────────────── */
function EditableTag({ value, onChange, onRemove, style }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef()

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])

  function save() {
    setEditing(false)
    const trimmed = draft.trim()
    if (!trimmed) { onRemove(); return }
    if (trimmed !== value) onChange(trimmed)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') save() }}
        style={{
          ...style,
          border: '1.5px solid #2563eb',
          outline: 'none',
          minWidth: '80px',
          width: `${Math.max(80, draft.length * 8)}px`,
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    )
  }

  return (
    <span className="editable-field" style={{ ...style, cursor: 'pointer', position: 'relative', paddingRight: '28px' }} onClick={() => setEditing(true)}>
      {value}
      <span
        onClick={e => { e.stopPropagation(); onRemove() }}
        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontWeight: '700', fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}
      >
        ×
      </span>
    </span>
  )
}

/* ──────────────────────────────────────────────
   EditableCredentialRow — for certs/licenses/trainings
   ────────────────────────────────────────────── */
function EditableCredentialRow({ item, onChange, onRemove }) {
  return (
    <li style={{ ...es.rCompactItem, display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ flex: 1 }} className="editable-field">
        <EditableText
          value={item.name}
          onChange={v => onChange({ ...item, name: v })}
          style={{ fontSize: '12px', color: '#374151', display: 'inline' }}
          placeholder="Name"
        />
      </span>
      <button onClick={onRemove} style={es.removeX} title="Remove">×</button>
    </li>
  )
}

/* ══════════════════════════════════════════════
   Main Results Component
   ══════════════════════════════════════════════ */
function parseStoredResume() {
  try {
    const raw = localStorage.getItem('results')
    if (!raw) return null
    const d = JSON.parse(raw)
    const r = d.resume || {}
    return {
      name: r.name || '',
      title: r.title || '',
      email: r.email || '',
      phone: r.phone || '',
      location: r.location || '',
      linkedin: r.linkedin || '',
      summary: r.summary || '',
      experience: Array.isArray(r.experience) ? r.experience.map(e => ({
        role: e.role || '', company: e.company || '', duration: e.duration || '',
        bullets: Array.isArray(e.bullets) ? [...e.bullets] : [],
      })) : [],
      education: Array.isArray(r.education) ? r.education.map(e => ({
        degree: e.degree || '', institution: e.institution || '', year: e.year || '',
      })) : [],
      certifications: Array.isArray(r.certifications) ? r.certifications.map(c => ({ name: c.name || c || '', issuer: c.issuer || '', year: c.year || '' })) : [],
      licenses: Array.isArray(r.licenses) ? r.licenses.map(c => ({ name: c.name || c || '', issuer: c.issuer || '', year: c.year || '' })) : [],
      trainings: Array.isArray(r.trainings) ? r.trainings.map(c => ({ name: c.name || c || '', issuer: c.issuer || '', year: c.year || '' })) : [],
      skills: Array.isArray(r.skills) ? [...r.skills] : [],
      languages: Array.isArray(r.languages) ? [...r.languages] : [],
      computerSkills: Array.isArray(r.computerSkills) ? [...r.computerSkills] : [],
    }
  } catch { return null }
}

export default function Results() {
  const navigate = useNavigate()
  const resumeRef = useRef()
  const [activeTab, setActiveTab] = useState('resume')
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [interviewQs, setInterviewQs] = useState(null)
  const [interviewLoading, setInterviewLoading] = useState(false)
  const [interviewError, setInterviewError] = useState('')
  const [editHint, setEditHint] = useState(true)
  const [resume, setResume] = useState(parseStoredResume)

  const persistResume = useCallback((r) => {
    try {
      const current = JSON.parse(localStorage.getItem('results') || '{}')
      current.resume = r
      localStorage.setItem('results', JSON.stringify(current))
    } catch { /* ignore */ }
  }, [])

  const raw = localStorage.getItem('results')
  if (!raw || !resume) {
    navigate('/')
    return null
  }

  const data = JSON.parse(raw)

  function updateResume(field, value) {
    setResume(prev => {
      const next = { ...prev, [field]: value }
      persistResume(next)
      return next
    })
  }

  function updateExp(i, field, value) {
    setResume(prev => {
      const experience = prev.experience.map((e, j) => j === i ? { ...e, [field]: value } : e)
      const next = { ...prev, experience }
      persistResume(next)
      return next
    })
  }

  function updateBullet(expIdx, bulletIdx, value) {
    setResume(prev => {
      const experience = prev.experience.map((e, j) => {
        if (j !== expIdx) return e
        const bullets = e.bullets.map((b, k) => k === bulletIdx ? value : b)
        return { ...e, bullets }
      })
      const next = { ...prev, experience }
      persistResume(next)
      return next
    })
  }

  function removeBullet(expIdx, bulletIdx) {
    setResume(prev => {
      const experience = prev.experience.map((e, j) => {
        if (j !== expIdx) return e
        return { ...e, bullets: e.bullets.filter((_, k) => k !== bulletIdx) }
      })
      const next = { ...prev, experience }
      persistResume(next)
      return next
    })
  }

  function addBullet(expIdx) {
    setResume(prev => {
      const experience = prev.experience.map((e, j) => {
        if (j !== expIdx) return e
        return { ...e, bullets: [...e.bullets, 'New bullet point — click to edit'] }
      })
      const next = { ...prev, experience }
      persistResume(next)
      return next
    })
  }

  function addExperience() {
    setResume(prev => {
      const next = { ...prev, experience: [...prev.experience, { role: '', company: '', duration: '', bullets: [''] }] }
      persistResume(next)
      return next
    })
  }

  function removeExperience(i) {
    setResume(prev => {
      const next = { ...prev, experience: prev.experience.filter((_, j) => j !== i) }
      persistResume(next)
      return next
    })
  }

  function updateEdu(i, field, value) {
    setResume(prev => {
      const education = prev.education.map((e, j) => j === i ? { ...e, [field]: value } : e)
      const next = { ...prev, education }
      persistResume(next)
      return next
    })
  }

  function addEducation() {
    setResume(prev => {
      const next = { ...prev, education: [...prev.education, { degree: '', institution: '', year: '' }] }
      persistResume(next)
      return next
    })
  }

  function removeEducation(i) {
    setResume(prev => {
      const next = { ...prev, education: prev.education.filter((_, j) => j !== i) }
      persistResume(next)
      return next
    })
  }

  function updateListItem(field, i, value) {
    setResume(prev => {
      const arr = [...prev[field]]
      arr[i] = value
      const next = { ...prev, [field]: arr }
      persistResume(next)
      return next
    })
  }

  function removeListItem(field, i) {
    setResume(prev => {
      const next = { ...prev, [field]: prev[field].filter((_, j) => j !== i) }
      persistResume(next)
      return next
    })
  }

  function addListItem(field, defaultValue) {
    setResume(prev => {
      const next = { ...prev, [field]: [...prev[field], defaultValue] }
      persistResume(next)
      return next
    })
  }

  function updateCredential(field, i, value) {
    setResume(prev => {
      const arr = [...prev[field]]
      arr[i] = value
      const next = { ...prev, [field]: arr }
      persistResume(next)
      return next
    })
  }

  function removeCredential(field, i) {
    setResume(prev => {
      const next = { ...prev, [field]: prev[field].filter((_, j) => j !== i) }
      persistResume(next)
      return next
    })
  }

  function addCredential(field) {
    setResume(prev => {
      const next = { ...prev, [field]: [...prev[field], { name: '', issuer: '', year: '' }] }
      persistResume(next)
      return next
    })
  }

  const missingKeywords = data.keywordGaps?.missingKeywords || []
  const matchedKeywords = data.keywordGaps?.matchedKeywords || []
  const priorityActions = data.keywordGaps?.priorityActions || []
  const hasAtsContent = missingKeywords.length + matchedKeywords.length + priorityActions.length > 0
  const hasCoverLetter = Boolean(data.coverLetter && data.coverLetter.trim())
  const matchPct = matchScorePercent(data.matchScore)
  const scoreColor = matchPct >= 75 ? '#059669' : matchPct >= 50 ? '#d97706' : '#dc2626'
  const scoreBg = matchPct >= 75 ? '#f0fdf4' : matchPct >= 50 ? '#fffbeb' : '#fef2f2'

  async function downloadPDF() {
    document.activeElement?.blur()
    setDownloading(true)
    try {
      const el = resumeRef.current
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          margin: 0,
          filename: `${(resume.name || 'resume').replace(/\s+/g, '-')}-tailored.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(el)
        .save()
    } catch (err) {
      console.error('PDF download failed:', err)
      alert('PDF download failed. Try again.')
    }
    setDownloading(false)
  }

  function copyLetter() {
    navigator.clipboard.writeText(data.coverLetter || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function generateInterviewPrep() {
    setInterviewLoading(true)
    setInterviewError('')
    try {
      const resumeText = localStorage.getItem('resumeText') || ''
      const jobText = localStorage.getItem('jobText') || ''
      const res = await axios.post('/api/interview-prep', { resumeText, jobText }, { timeout: 60000 })
      setInterviewQs(res.data.questions || [])
      setActiveTab('interview')
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to generate'
      setInterviewError(msg)
    }
    setInterviewLoading(false)
  }

  function copyInterviewQs() {
    if (!interviewQs) return
    const text = interviewQs.map((q, i) =>
      `${i + 1}. ${q.question}\n   Why: ${q.why}\n   Answer hints:\n${(q.answerHint || '').split?.('\n')?.map(h => `   - ${h}`)?.join('\n') || `   - ${q.answerHint}`}`
    ).join('\n\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tabs = [
    { id: 'resume', label: 'Resume' },
    { id: 'ats', label: 'Skill / Education Gaps', badge: missingKeywords.length || null },
    { id: 'cover', label: 'Cover Letter', hidden: !hasCoverLetter },
    { id: 'interview', label: 'Interview Prep', hidden: !interviewQs },
  ].filter(t => !t.hidden)

  const contacts = [resume.email, resume.phone, resume.location, resume.linkedin].filter(Boolean)

  return (
    <div style={es.page}>
      {/* Inject hover styles for editable fields */}
      <style>{`
        .editable-field { transition: outline 0.15s ease; border-radius: 3px; }
        .editable-field:hover { outline: 1.5px dashed #93c5fd; outline-offset: 2px; }
        .resume-add-btn { transition: all 0.15s ease; }
        .resume-add-btn:hover { background: #eff6ff !important; border-color: #93c5fd !important; }
        .remove-x:hover { color: #dc2626 !important; }
      `}</style>

      <div style={es.wrapper}>
        <div style={es.topBar}>
          <div style={es.logo}>CV<span style={es.logoAccent}>ibe</span></div>
          <button style={es.newBtn} onClick={() => {
            localStorage.removeItem('jobText')
            localStorage.removeItem('results')
            navigate('/job')
          }}>
            + New Job
          </button>
        </div>

        {/* Score Card */}
        <div style={{ ...es.scoreCard, background: scoreBg }}>
          <div style={es.scoreLeft}>
            <div style={{ ...es.scoreBig, color: scoreColor }}>{matchPct}%</div>
            <div style={{ ...es.scoreLabel, color: scoreColor }}>{data.matchLabel}</div>
          </div>
          <div style={es.scoreRight}>
            <p style={es.scoreReason}>{data.matchReason}</p>
            <p style={es.scoreHint}>This score shows how closely your resume matches the job requirements.</p>
          </div>
        </div>

        {/* Interview Prep CTA */}
        {!interviewQs && (
          <button
            style={{ ...es.interviewCta, ...(interviewLoading ? { opacity: 0.7 } : {}) }}
            onClick={generateInterviewPrep}
            disabled={interviewLoading}
          >
            {interviewLoading ? 'Generating interview questions...' : 'Prepare for Interview →'}
          </button>
        )}
        {interviewError && <p style={es.interviewError}>{interviewError}</p>}

        {/* Tabs */}
        <div style={es.tabs}>
          {tabs.map(t => (
            <button
              key={t.id}
              style={{ ...es.tab, ...(activeTab === t.id ? es.tabActive : {}) }}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              {t.badge != null && <span style={es.tabBadge}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* ─── Resume Tab ─── */}
        {activeTab === 'resume' && (
          <div style={es.tabContent}>
            <p style={es.tabDesc}>
              Your resume has been tailored to this job. Click any section to edit it directly,
              then download the final version as PDF.
            </p>
            <button style={es.actionBtn} onClick={downloadPDF} disabled={downloading}>
              {downloading ? 'Generating PDF...' : 'Download as PDF'}
            </button>

            {editHint && (
              <div style={es.editHint}>
                <span>✏️ Click any text in the resume below to edit it</span>
                <button onClick={() => setEditHint(false)} style={es.editHintClose}>×</button>
              </div>
            )}

            <div ref={resumeRef} style={es.resumeDoc}>
              {/* Header */}
              <div style={es.rHeader}>
                <EditableText value={resume.name} onChange={v => updateResume('name', v)} style={es.rName} placeholder="Your Name" />
                <EditableText value={resume.title} onChange={v => updateResume('title', v)} style={es.rHeadline} placeholder="Job title / headline" />
                <div style={es.rContacts}>
                  {['email', 'phone', 'location', 'linkedin'].map((field) => (
                    <EditableText
                      key={field}
                      value={resume[field]}
                      onChange={v => updateResume(field, v)}
                      style={es.rContact}
                      placeholder={field}
                    />
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div style={es.rSection}>
                <div style={es.rSectionTitle}>Professional Summary</div>
                <div style={es.rDivider} />
                <EditableText value={resume.summary} onChange={v => updateResume('summary', v)} style={es.rText} multiline placeholder="Write a 2-3 sentence professional summary..." />
              </div>

              {/* Experience */}
              <div style={es.rSection}>
                <div style={es.rSectionTitle}>Experience</div>
                <div style={es.rDivider} />
                {resume.experience.map((exp, i) => (
                  <div key={i} style={es.rBlock}>
                    <div style={es.rBlockHead}>
                      <div style={{ flex: 1 }}>
                        <EditableText value={exp.role} onChange={v => updateExp(i, 'role', v)} style={es.rRole} placeholder="Job title" />
                        <EditableText value={exp.company} onChange={v => updateExp(i, 'company', v)} style={es.rCompany} placeholder="Company" />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <EditableText value={exp.duration} onChange={v => updateExp(i, 'duration', v)} style={es.rDuration} placeholder="Duration" />
                        {resume.experience.length > 1 && (
                          <button className="remove-x" onClick={() => removeExperience(i)} style={es.removeX} title="Remove position">×</button>
                        )}
                      </div>
                    </div>
                    <ul style={es.rBullets}>
                      {exp.bullets.map((b, j) => (
                        <li key={j} style={{ ...es.rBullet, display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                          <EditableText value={b} onChange={v => updateBullet(i, j, v)} style={{ flex: 1, fontSize: '13px', color: '#374151', lineHeight: 1.6 }} placeholder="Describe an accomplishment..." />
                          <button className="remove-x" onClick={() => removeBullet(i, j)} style={{ ...es.removeX, fontSize: '12px', marginTop: '2px' }} title="Remove bullet">×</button>
                        </li>
                      ))}
                    </ul>
                    <button className="resume-add-btn" onClick={() => addBullet(i)} style={es.addSmall}>+ Add bullet</button>
                  </div>
                ))}
                <button className="resume-add-btn" onClick={addExperience} style={es.addBtn}>+ Add position</button>
              </div>

              {/* Education */}
              <div style={es.rSection}>
                <div style={es.rSectionTitle}>Education</div>
                <div style={es.rDivider} />
                {resume.education.length === 0 ? (
                  <p style={es.sectionEmpty}>No education entries yet.</p>
                ) : (
                  resume.education.map((edu, i) => (
                    <div key={i} style={es.rBlock}>
                      <div style={es.rBlockHead}>
                        <div style={{ flex: 1 }}>
                          <EditableText value={edu.degree} onChange={v => updateEdu(i, 'degree', v)} style={es.rRole} placeholder="Degree / Diploma" />
                          <EditableText value={edu.institution} onChange={v => updateEdu(i, 'institution', v)} style={es.rCompany} placeholder="School / University" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <EditableText value={edu.year} onChange={v => updateEdu(i, 'year', v)} style={es.rDuration} placeholder="Year" />
                          <button className="remove-x" onClick={() => removeEducation(i)} style={es.removeX} title="Remove">×</button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <button className="resume-add-btn" onClick={addEducation} style={es.addBtn}>+ Add education</button>
              </div>

              {/* Certifications */}
              <div style={es.rSection}>
                <div style={es.rSectionTitle}>Certifications</div>
                <div style={es.rDivider} />
                {resume.certifications.length > 0 && (
                  <ul style={es.rCompactList}>
                    {resume.certifications.map((cert, i) => (
                      <EditableCredentialRow key={i} item={cert} onChange={v => updateCredential('certifications', i, v)} onRemove={() => removeCredential('certifications', i)} />
                    ))}
                  </ul>
                )}
                <button className="resume-add-btn" onClick={() => addCredential('certifications')} style={es.addSmall}>+ Add certification</button>
              </div>

              {/* Licenses */}
              {resume.licenses.length > 0 && (
                <div style={es.rSection}>
                  <div style={es.rSectionTitle}>Licenses</div>
                  <div style={es.rDivider} />
                  <ul style={es.rCompactList}>
                    {resume.licenses.map((row, i) => (
                      <EditableCredentialRow key={i} item={row} onChange={v => updateCredential('licenses', i, v)} onRemove={() => removeCredential('licenses', i)} />
                    ))}
                  </ul>
                  <button className="resume-add-btn" onClick={() => addCredential('licenses')} style={es.addSmall}>+ Add license</button>
                </div>
              )}

              {/* Trainings */}
              {resume.trainings.length > 0 && (
                <div style={es.rSection}>
                  <div style={es.rSectionTitle}>Trainings & workshops</div>
                  <div style={es.rDivider} />
                  <ul style={es.rCompactList}>
                    {resume.trainings.map((row, i) => (
                      <EditableCredentialRow key={i} item={row} onChange={v => updateCredential('trainings', i, v)} onRemove={() => removeCredential('trainings', i)} />
                    ))}
                  </ul>
                  <button className="resume-add-btn" onClick={() => addCredential('trainings')} style={es.addSmall}>+ Add training</button>
                </div>
              )}

              {/* Skills */}
              <div style={es.rSection}>
                <div style={es.rSectionTitle}>Skills</div>
                <div style={es.rDivider} />
                <div style={es.rSkills}>
                  {resume.skills.map((s, i) => (
                    <EditableTag key={i} value={s} onChange={v => updateListItem('skills', i, v)} onRemove={() => removeListItem('skills', i)} style={es.rSkill} />
                  ))}
                  <button className="resume-add-btn" onClick={() => addListItem('skills', 'New skill')} style={es.addChip}>+</button>
                </div>
              </div>

              {/* Languages */}
              <div style={es.rSection}>
                <div style={es.rSectionTitle}>Languages</div>
                <div style={es.rDivider} />
                <div style={es.rSkills}>
                  {resume.languages.map((lang, i) => (
                    <EditableTag key={i} value={lang} onChange={v => updateListItem('languages', i, v)} onRemove={() => removeListItem('languages', i)} style={es.rSkill} />
                  ))}
                  <button className="resume-add-btn" onClick={() => addListItem('languages', 'Language')} style={es.addChip}>+</button>
                </div>
              </div>

              {/* Computer & tools */}
              {resume.computerSkills.length > 0 && (
                <div style={es.rSection}>
                  <div style={es.rSectionTitle}>Computer & tools</div>
                  <div style={es.rDivider} />
                  <div style={es.rSkills}>
                    {resume.computerSkills.map((s, i) => (
                      <EditableTag key={i} value={s} onChange={v => updateListItem('computerSkills', i, v)} onRemove={() => removeListItem('computerSkills', i)} style={es.rSkill} />
                    ))}
                    <button className="resume-add-btn" onClick={() => addListItem('computerSkills', 'Tool')} style={es.addChip}>+</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Skill / Education Gaps Tab ─── */}
        {activeTab === 'ats' && (
          <div style={es.tabContent}>
            <p style={es.tabDesc}>
              We compared your resume against the job description. Green keywords are already in
              your resume. Red ones are missing — consider adding them to improve your chances.
            </p>
            {!hasAtsContent ? (
              <div style={es.atsEmptyBox}>
                <p style={es.sectionEmpty}>No keyword analysis returned. Try pasting the full job description and re-running.</p>
              </div>
            ) : (
              <>
                {matchedKeywords.length > 0 && (
                  <div style={es.atsSection}>
                    <p style={es.atsSectionTitle}>Skills you already have</p>
                    <div style={es.atsChips}>
                      {matchedKeywords.map((k, i) => <span key={i} style={es.atsChipGreen}>{k}</span>)}
                    </div>
                  </div>
                )}
                {missingKeywords.length > 0 && (
                  <div style={es.atsSection}>
                    <p style={es.atsSectionTitle}>Skills to add or highlight</p>
                    <div style={es.atsChips}>
                      {missingKeywords.map((k, i) => <span key={i} style={es.atsChipRed}>{k}</span>)}
                    </div>
                  </div>
                )}
                {priorityActions.length > 0 && (
                  <div style={es.atsSection}>
                    <p style={es.atsSectionTitle}>What to do next</p>
                    {priorityActions.map((a, i) => (
                      <div key={i} style={es.listItem}>
                        <span style={es.listIcon}>{i + 1}.</span>
                        <span style={es.listText}>{a}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── Cover Letter Tab ─── */}
        {activeTab === 'cover' && (
          <div style={es.tabContent}>
            <p style={es.tabDesc}>
              A personalized cover letter based on your experience and this specific job.
              Copy it, tweak the tone if needed, and submit it with your application.
            </p>
            <button style={es.actionBtn} onClick={copyLetter}>
              {copied ? 'Copied!' : 'Copy Cover Letter'}
            </button>
            <div style={es.letterDoc}>
              <p style={es.letterText}>{data.coverLetter}</p>
            </div>
          </div>
        )}

        {/* ─── Interview Prep Tab ─── */}
        {activeTab === 'interview' && interviewQs && (
          <div style={es.tabContent}>
            <p style={es.tabDesc}>
              These are the questions you're most likely to be asked in an interview for this role.
              Each one includes why the interviewer would ask it and specific talking points from your experience.
            </p>
            <button style={es.actionBtn} onClick={copyInterviewQs}>
              {copied ? 'Copied!' : 'Copy All Questions'}
            </button>
            {interviewQs.map((q, i) => (
              <div key={i} style={es.iqCard}>
                <div style={es.iqHeader}>
                  <span style={es.iqNumber}>Q{i + 1}</span>
                  <span style={es.iqQuestion}>{q.question}</span>
                </div>
                <div style={es.iqWhy}>{q.why}</div>
                <div style={es.iqHintLabel}>Your talking points:</div>
                <div style={es.iqHint}>
                  {typeof q.answerHint === 'string'
                    ? q.answerHint
                    : Array.isArray(q.answerHint)
                      ? q.answerHint.join('\n')
                      : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={es.footer}>
          <button style={es.startOverBtn} onClick={() => { localStorage.clear(); navigate('/') }}>
            Start over with new resume
          </button>
          {data._model && <p style={es.modelTag}>{data._model}</p>}
        </div>
      </div>
    </div>
  )
}

const es = {
  page: { minHeight: '100vh', background: '#f8fafc', padding: '20px', display: 'flex', justifyContent: 'center' },
  wrapper: { width: '100%', maxWidth: '620px', paddingBottom: '40px', animation: 'fadeIn 0.4s ease' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '8px 0' },
  logo: { fontSize: '22px', fontWeight: '800', color: '#111827', letterSpacing: '-1px' },
  logoAccent: { color: '#2563eb' },
  newBtn: { padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#ffffff', color: '#374151', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },

  scoreCard: { borderRadius: '16px', padding: '20px 24px', display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '12px', border: '1px solid #e5e7eb' },
  scoreLeft: { textAlign: 'center', minWidth: '80px' },
  scoreBig: { fontSize: '44px', fontWeight: '800', lineHeight: 1 },
  scoreLabel: { fontSize: '13px', fontWeight: '600', marginTop: '4px' },
  scoreRight: { flex: 1 },
  scoreReason: { fontSize: '14px', color: '#374151', lineHeight: 1.6, margin: '0 0 6px 0' },
  scoreHint: { fontSize: '12px', color: '#9ca3af', margin: 0, lineHeight: 1.4 },

  interviewCta: { width: '100%', padding: '14px', borderRadius: '10px', border: '2px solid #7c3aed', background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', color: '#fff', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '16px', transition: 'all 0.2s ease', letterSpacing: '0.3px' },
  interviewError: { fontSize: '13px', color: '#dc2626', marginBottom: '12px', textAlign: 'center' },

  tabs: { display: 'flex', gap: '4px', marginBottom: '16px', background: '#f3f4f6', borderRadius: '10px', padding: '4px', overflowX: 'auto' },
  tab: { flex: 1, padding: '10px 8px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s ease', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  tabActive: { background: '#ffffff', color: '#111827', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  tabBadge: { background: '#fecaca', color: '#dc2626', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: '700' },

  tabContent: { animation: 'fadeIn 0.3s ease' },
  tabDesc: { fontSize: '14px', color: '#6b7280', lineHeight: 1.6, marginBottom: '16px', background: '#f9fafb', padding: '12px 16px', borderRadius: '10px', border: '1px solid #f3f4f6' },

  actionBtn: { width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginBottom: '16px', transition: 'all 0.2s ease' },

  editHint: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px 16px', marginBottom: '12px', fontSize: '13px', color: '#1e40af', fontWeight: '500' },
  editHintClose: { background: 'none', border: 'none', fontSize: '18px', color: '#93c5fd', cursor: 'pointer', padding: '0 0 0 12px', lineHeight: 1 },

  resumeDoc: { background: '#ffffff', borderRadius: '12px', padding: '40px 36px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  rHeader: { borderBottom: '2px solid #2563eb', paddingBottom: '16px', marginBottom: '20px', textAlign: 'center' },
  rName: { fontSize: '28px', fontWeight: '800', color: '#111827', letterSpacing: '-0.5px', marginBottom: '4px' },
  rHeadline: { fontSize: '13px', color: '#4b5563', fontWeight: '500', marginBottom: '10px', letterSpacing: '0.3px' },
  rContacts: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' },
  rContact: { fontSize: '12px', color: '#6b7280' },
  rSection: { marginBottom: '18px' },
  rSectionTitle: { fontSize: '11px', fontWeight: '700', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' },
  rDivider: { height: '1px', background: '#e5e7eb', marginBottom: '12px' },
  rText: { fontSize: '13px', color: '#374151', lineHeight: 1.7, margin: 0 },
  rBlock: { marginBottom: '14px' },
  rBlockHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' },
  rRole: { fontSize: '14px', fontWeight: '700', color: '#111827' },
  rCompany: { fontSize: '13px', color: '#6b7280' },
  rDuration: { fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' },
  rBullets: { paddingLeft: '16px', margin: 0 },
  rBullet: { fontSize: '13px', color: '#374151', lineHeight: 1.6, marginBottom: '3px' },
  rCompactList: { paddingLeft: '16px', margin: 0, listStyle: 'disc' },
  rCompactItem: { fontSize: '12px', color: '#374151', lineHeight: 1.7, marginBottom: '2px' },
  rSkills: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' },
  rSkill: { padding: '5px 14px', borderRadius: '20px', background: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: '500' },
  sectionEmpty: { fontSize: '13px', color: '#6b7280', lineHeight: 1.6, margin: '0 0 4px 0' },

  removeX: { background: 'none', border: 'none', fontSize: '16px', color: '#d1d5db', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontWeight: '700', flexShrink: 0 },
  addBtn: { width: '100%', padding: '8px', borderRadius: '8px', border: '1px dashed #d1d5db', background: 'transparent', color: '#2563eb', fontSize: '12px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' },
  addSmall: { display: 'inline-block', padding: '4px 10px', borderRadius: '6px', border: '1px dashed #d1d5db', background: 'transparent', color: '#2563eb', fontSize: '11px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' },
  addChip: { width: '30px', height: '30px', borderRadius: '50%', border: '1px dashed #d1d5db', background: 'transparent', color: '#2563eb', fontSize: '16px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  atsSection: { marginBottom: '20px' },
  atsSectionTitle: { fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '10px', margin: '0 0 10px 0' },
  atsChips: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  atsChipGreen: { padding: '5px 12px', borderRadius: '20px', background: '#f0fdf4', color: '#059669', fontSize: '12px', fontWeight: '600', border: '1px solid #bbf7d0' },
  atsChipRed: { padding: '5px 12px', borderRadius: '20px', background: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: '600', border: '1px solid #fecaca' },
  atsEmptyBox: { background: '#fefce8', border: '1px solid #fde047', borderRadius: '12px', padding: '16px' },

  letterDoc: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' },
  letterText: { fontSize: '14px', color: '#374151', lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 },

  listItem: { display: 'flex', gap: '12px', alignItems: 'flex-start', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px' },
  listIcon: { color: '#2563eb', fontWeight: '700', flexShrink: 0, fontSize: '14px' },
  listText: { fontSize: '14px', color: '#374151', lineHeight: 1.6 },

  iqCard: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', marginBottom: '12px' },
  iqHeader: { display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '10px' },
  iqNumber: { background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff', fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '16px', flexShrink: 0 },
  iqQuestion: { fontSize: '15px', fontWeight: '700', color: '#111827', lineHeight: 1.5 },
  iqWhy: { fontSize: '13px', color: '#6b7280', lineHeight: 1.5, marginBottom: '12px', fontStyle: 'italic' },
  iqHintLabel: { fontSize: '12px', fontWeight: '700', color: '#4f46e5', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  iqHint: { fontSize: '13px', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e5e7eb' },

  footer: { marginTop: '24px', textAlign: 'center' },
  startOverBtn: { width: '100%', padding: '13px', borderRadius: '10px', border: '1px solid #e5e7eb', background: 'transparent', color: '#6b7280', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  modelTag: { fontSize: '11px', color: '#d1d5db', marginTop: '12px' },
}
