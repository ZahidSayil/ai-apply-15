import { useNavigate } from 'react-router-dom'
import { useState, useRef } from 'react'
import axios from 'axios'

function matchScorePercent(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 70
  if (n > 0 && n <= 1) return Math.min(100, Math.round(n * 100))
  if (n > 1 && n <= 100) return Math.round(n)
  if (n > 100) return 100
  return 0
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

  const raw = localStorage.getItem('results')
  if (!raw) {
    navigate('/')
    return null
  }

  const data = JSON.parse(raw)
  const r = data.resume || {}
  const education = Array.isArray(r.education) ? r.education : []
  const certifications = Array.isArray(r.certifications) ? r.certifications : []
  const licenses = Array.isArray(r.licenses) ? r.licenses : []
  const trainings = Array.isArray(r.trainings) ? r.trainings : []
  const languages = Array.isArray(r.languages) ? r.languages : []
  const hasCoverLetter = Boolean(data.coverLetter && data.coverLetter.trim())
  const missingKeywords = data.keywordGaps?.missingKeywords || []
  const matchedKeywords = data.keywordGaps?.matchedKeywords || []
  const priorityActions = data.keywordGaps?.priorityActions || []
  const hasAtsContent =
    missingKeywords.length + matchedKeywords.length + priorityActions.length > 0

  const matchPct = matchScorePercent(data.matchScore)

  const scoreColor =
    matchPct >= 75 ? '#059669' :
    matchPct >= 50 ? '#d97706' : '#dc2626'

  const scoreBg =
    matchPct >= 75 ? '#f0fdf4' :
    matchPct >= 50 ? '#fffbeb' : '#fef2f2'

  async function downloadPDF() {
    setDownloading(true)
    try {
      const el = resumeRef.current
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          margin: 0,
          filename: `${(r.name || 'resume').replace(/\s+/g, '-')}-tailored.pdf`,
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
      const res = await axios.post(
        '/api/interview-prep',
        { resumeText, jobText },
        { timeout: 60000 }
      )
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

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        {/* Top Bar */}
        <div style={styles.topBar}>
          <div style={styles.logo}>CV<span style={styles.logoAccent}>ibe</span></div>
          <button style={styles.newBtn} onClick={() => {
            localStorage.removeItem('jobText')
            localStorage.removeItem('results')
            navigate('/job')
          }}>
            + New Job
          </button>
        </div>

        {/* Score Card */}
        <div style={{ ...styles.scoreCard, background: scoreBg }}>
          <div style={styles.scoreLeft}>
            <div style={{ ...styles.scoreBig, color: scoreColor }}>{matchPct}%</div>
            <div style={{ ...styles.scoreLabel, color: scoreColor }}>{data.matchLabel}</div>
          </div>
          <div style={styles.scoreRight}>
            <p style={styles.scoreReason}>{data.matchReason}</p>
          </div>
        </div>

        {/* Interview Prep CTA */}
        {!interviewQs && (
          <button
            style={{ ...styles.interviewCta, ...(interviewLoading ? { opacity: 0.7 } : {}) }}
            onClick={generateInterviewPrep}
            disabled={interviewLoading}
          >
            {interviewLoading ? 'Generating interview questions...' : 'Prepare for Interview →'}
          </button>
        )}
        {interviewError && (
          <p style={styles.interviewError}>{interviewError}</p>
        )}

        {/* Tabs */}
        <div style={styles.tabs}>
          {tabs.map(t => (
            <button
              key={t.id}
              style={{ ...styles.tab, ...(activeTab === t.id ? styles.tabActive : {}) }}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              {t.badge != null && <span style={styles.tabBadge}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* ─── Resume Tab ─── */}
        {activeTab === 'resume' && (
          <div style={styles.tabContent}>
            <button style={styles.actionBtn} onClick={downloadPDF} disabled={downloading}>
              {downloading ? 'Generating PDF...' : 'Download as PDF'}
            </button>

            <div ref={resumeRef} style={styles.resumeDoc}>
              <div style={styles.rHeader}>
                <div style={styles.rName}>{r.name || 'Your Name'}</div>
                {r.title && <div style={styles.rHeadline}>{r.title}</div>}
                <div style={styles.rContacts}>
                  {[r.email, r.phone, r.location, r.linkedin].filter(Boolean).map((c, i) => (
                    <span key={i} style={styles.rContact}>
                      {i > 0 && <span style={styles.rContactDot}>•</span>}
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              {r.summary && (
                <div style={styles.rSection}>
                  <div style={styles.rSectionTitle}>Professional Summary</div>
                  <div style={styles.rDivider} />
                  <p style={styles.rText}>{r.summary}</p>
                </div>
              )}

              {r.experience?.length > 0 && (
                <div style={styles.rSection}>
                  <div style={styles.rSectionTitle}>Experience</div>
                  <div style={styles.rDivider} />
                  {r.experience.map((exp, i) => (
                    <div key={i} style={styles.rBlock}>
                      <div style={styles.rBlockHead}>
                        <div>
                          <div style={styles.rRole}>{exp.role}</div>
                          <div style={styles.rCompany}>{exp.company}</div>
                        </div>
                        <div style={styles.rDuration}>{exp.duration}</div>
                      </div>
                      {exp.bullets?.length > 0 && (
                        <ul style={styles.rBullets}>
                          {exp.bullets.map((b, j) => (
                            <li key={j} style={styles.rBullet}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={styles.rSection}>
                <div style={styles.rSectionTitle}>Education</div>
                <div style={styles.rDivider} />
                {education.length === 0 ? (
                  <p style={styles.sectionEmpty}>No education entries found in the source resume.</p>
                ) : (
                  education.map((edu, i) => (
                    <div key={i} style={styles.rBlock}>
                      <div style={styles.rBlockHead}>
                        <div>
                          <div style={styles.rRole}>{edu.degree}</div>
                          <div style={styles.rCompany}>{edu.institution}</div>
                        </div>
                        <div style={styles.rDuration}>{edu.year}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {certifications.length > 0 && (
                <div style={styles.rSection}>
                  <div style={styles.rSectionTitle}>Certifications</div>
                  <div style={styles.rDivider} />
                  <ul style={styles.rCompactList}>
                    {certifications.map((cert, i) => (
                      <li key={i} style={styles.rCompactItem}>
                        {cert.name}{cert.issuer ? ` — ${cert.issuer}` : ''}{cert.year ? ` (${cert.year})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {licenses.length > 0 && (
                <div style={styles.rSection}>
                  <div style={styles.rSectionTitle}>Licenses</div>
                  <div style={styles.rDivider} />
                  <ul style={styles.rCompactList}>
                    {licenses.map((row, i) => (
                      <li key={i} style={styles.rCompactItem}>
                        {row.name}{row.issuer ? ` — ${row.issuer}` : ''}{row.year ? ` (${row.year})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {trainings.length > 0 && (
                <div style={styles.rSection}>
                  <div style={styles.rSectionTitle}>Trainings & workshops</div>
                  <div style={styles.rDivider} />
                  <ul style={styles.rCompactList}>
                    {trainings.map((row, i) => (
                      <li key={i} style={styles.rCompactItem}>
                        {row.name}{row.issuer ? ` — ${row.issuer}` : ''}{row.year ? ` (${row.year})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {r.skills?.length > 0 && (
                <div style={styles.rSection}>
                  <div style={styles.rSectionTitle}>Skills</div>
                  <div style={styles.rDivider} />
                  <div style={styles.rSkills}>
                    {r.skills.map((s, i) => (
                      <span key={i} style={styles.rSkill}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {languages.length > 0 && (
                <div style={styles.rSection}>
                  <div style={styles.rSectionTitle}>Languages</div>
                  <div style={styles.rDivider} />
                  <div style={styles.rSkills}>
                    {languages.map((lang, i) => (
                      <span key={i} style={styles.rSkill}>{lang}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.computerSkills?.length > 0 && (
                <div style={styles.rSection}>
                  <div style={styles.rSectionTitle}>Computer & tools</div>
                  <div style={styles.rDivider} />
                  <div style={styles.rSkills}>
                    {r.computerSkills.map((s, i) => (
                      <span key={i} style={styles.rSkill}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── ATS Insights Tab ─── */}
        {activeTab === 'ats' && (
          <div style={styles.tabContent}>
            {!hasAtsContent ? (
              <div style={styles.atsEmptyBox}>
                <p style={styles.sectionEmpty}>No keyword analysis returned. Try pasting the full job description and re-running.</p>
              </div>
            ) : (
              <>
                {matchedKeywords.length > 0 && (
                  <div style={styles.atsSection}>
                    <p style={styles.atsSectionTitle}>Skills you already have</p>
                    <div style={styles.atsChips}>
                      {matchedKeywords.map((k, i) => (
                        <span key={i} style={styles.atsChipGreen}>{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                {missingKeywords.length > 0 && (
                  <div style={styles.atsSection}>
                    <p style={styles.atsSectionTitle}>Skills to add or highlight</p>
                    <div style={styles.atsChips}>
                      {missingKeywords.map((k, i) => (
                        <span key={i} style={styles.atsChipRed}>{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                {priorityActions.length > 0 && (
                  <div style={styles.atsSection}>
                    <p style={styles.atsSectionTitle}>What to do next</p>
                    {priorityActions.map((a, i) => (
                      <div key={i} style={styles.listItem}>
                        <span style={styles.listIcon}>{i + 1}.</span>
                        <span style={styles.listText}>{a}</span>
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
          <div style={styles.tabContent}>
            <button style={styles.actionBtn} onClick={copyLetter}>
              {copied ? 'Copied!' : 'Copy Cover Letter'}
            </button>
            <div style={styles.letterDoc}>
              <p style={styles.letterText}>{data.coverLetter}</p>
            </div>
          </div>
        )}

        {/* ─── Interview Prep Tab ─── */}
        {activeTab === 'interview' && interviewQs && (
          <div style={styles.tabContent}>
            <button style={styles.actionBtn} onClick={copyInterviewQs}>
              {copied ? 'Copied!' : 'Copy All Questions'}
            </button>
            <p style={styles.tabIntro}>
              {interviewQs.length} likely questions based on this job + your resume
            </p>
            {interviewQs.map((q, i) => (
              <div key={i} style={styles.iqCard}>
                <div style={styles.iqHeader}>
                  <span style={styles.iqNumber}>Q{i + 1}</span>
                  <span style={styles.iqQuestion}>{q.question}</span>
                </div>
                <div style={styles.iqWhy}>{q.why}</div>
                <div style={styles.iqHintLabel}>Your talking points:</div>
                <div style={styles.iqHint}>
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
        <div style={styles.footer}>
          <button style={styles.startOverBtn} onClick={() => { localStorage.clear(); navigate('/') }}>
            Start over with new resume
          </button>
          {data._model && (
            <p style={styles.modelTag}>{data._model}</p>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    padding: '20px',
    display: 'flex',
    justifyContent: 'center',
  },
  wrapper: {
    width: '100%',
    maxWidth: '620px',
    paddingBottom: '40px',
    animation: 'fadeIn 0.4s ease',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    padding: '8px 0',
  },
  logo: {
    fontSize: '22px',
    fontWeight: '800',
    color: '#111827',
    letterSpacing: '-1px',
  },
  logoAccent: { color: '#2563eb' },
  newBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    background: '#ffffff',
    color: '#374151',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },

  scoreCard: {
    borderRadius: '16px',
    padding: '20px 24px',
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    marginBottom: '12px',
    border: '1px solid #e5e7eb',
  },
  scoreLeft: { textAlign: 'center', minWidth: '80px' },
  scoreBig: { fontSize: '44px', fontWeight: '800', lineHeight: 1 },
  scoreLabel: { fontSize: '13px', fontWeight: '600', marginTop: '4px' },
  scoreRight: { flex: 1 },
  scoreReason: { fontSize: '14px', color: '#374151', lineHeight: 1.6, margin: 0 },

  interviewCta: {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: '2px solid #7c3aed',
    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    marginBottom: '16px',
    transition: 'all 0.2s ease',
    letterSpacing: '0.3px',
  },
  interviewError: {
    fontSize: '13px',
    color: '#dc2626',
    marginBottom: '12px',
    textAlign: 'center',
  },

  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '16px',
    background: '#f3f4f6',
    borderRadius: '10px',
    padding: '4px',
    overflowX: 'auto',
  },
  tab: {
    flex: 1,
    padding: '10px 8px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  tabActive: {
    background: '#ffffff',
    color: '#111827',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  tabBadge: {
    background: '#fecaca',
    color: '#dc2626',
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '10px',
    fontWeight: '700',
  },

  tabContent: { animation: 'fadeIn 0.3s ease' },
  tabIntro: { fontSize: '14px', color: '#6b7280', marginBottom: '16px' },

  actionBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    marginBottom: '16px',
    transition: 'all 0.2s ease',
  },

  resumeDoc: {
    background: '#ffffff',
    borderRadius: '12px',
    padding: '40px 36px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  rHeader: {
    borderBottom: '2px solid #2563eb',
    paddingBottom: '16px',
    marginBottom: '20px',
    textAlign: 'center',
  },
  rName: { fontSize: '28px', fontWeight: '800', color: '#111827', letterSpacing: '-0.5px', marginBottom: '4px' },
  rHeadline: { fontSize: '13px', color: '#4b5563', fontWeight: '500', marginBottom: '10px', letterSpacing: '0.3px' },
  rContacts: { display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' },
  rContact: { fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' },
  rContactDot: { color: '#d1d5db', fontSize: '10px' },
  rSection: { marginBottom: '18px' },
  rSectionTitle: { fontSize: '11px', fontWeight: '700', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' },
  rDivider: { height: '1px', background: '#e5e7eb', marginBottom: '12px' },
  rText: { fontSize: '13px', color: '#374151', lineHeight: 1.7, margin: 0 },
  rBlock: { marginBottom: '14px' },
  rBlockHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' },
  rRole: { fontSize: '14px', fontWeight: '700', color: '#111827' },
  rCompany: { fontSize: '13px', color: '#6b7280' },
  rDuration: { fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap', marginLeft: '12px' },
  rBullets: { paddingLeft: '16px', margin: 0 },
  rBullet: { fontSize: '13px', color: '#374151', lineHeight: 1.6, marginBottom: '3px' },
  rCompactList: { paddingLeft: '16px', margin: 0, listStyle: 'disc' },
  rCompactItem: { fontSize: '12px', color: '#374151', lineHeight: 1.7, marginBottom: '2px' },
  rSkills: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  rSkill: { padding: '5px 14px', borderRadius: '20px', background: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: '500' },
  sectionEmpty: { fontSize: '13px', color: '#6b7280', lineHeight: 1.6, margin: '0 0 4px 0' },

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

  iqCard: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '18px',
    marginBottom: '12px',
  },
  iqHeader: { display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '10px' },
  iqNumber: {
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '800',
    padding: '4px 10px',
    borderRadius: '16px',
    flexShrink: 0,
  },
  iqQuestion: { fontSize: '15px', fontWeight: '700', color: '#111827', lineHeight: 1.5 },
  iqWhy: { fontSize: '13px', color: '#6b7280', lineHeight: 1.5, marginBottom: '12px', fontStyle: 'italic' },
  iqHintLabel: { fontSize: '12px', fontWeight: '700', color: '#4f46e5', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  iqHint: { fontSize: '13px', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e5e7eb' },

  footer: { marginTop: '24px', textAlign: 'center' },
  startOverBtn: { width: '100%', padding: '13px', borderRadius: '10px', border: '1px solid #e5e7eb', background: 'transparent', color: '#6b7280', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  modelTag: { fontSize: '11px', color: '#d1d5db', marginTop: '12px' },
}
