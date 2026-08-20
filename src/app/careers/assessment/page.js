// src/app/careers/assessment/page.js
'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Clock, ChevronRight, ChevronLeft, Send, AlertTriangle,
  CheckCircle, Loader2, User, Phone, Mail, MapPin, FileText,
  ArrowLeft, Shield, Lock, ClipboardList,
} from 'lucide-react'

const AUTOSAVE_INTERVAL = 30_000

export default function AssessmentPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0a1628 0%,#1e3a8a 60%,#1e40af 100%)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Loader2 size={32} style={{ animation:'spin 1s linear infinite', color:'#60a5fa' }} />
      </div>
    }>
      <AssessmentContent />
    </Suspense>
  )
}

function AssessmentContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const assessmentId = searchParams.get('id')

  // Auth
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Data
  const [assessment, setAssessment] = useState(null)
  const [sections, setSections] = useState([])
  const [invitation, setInvitation] = useState(null)
  const [availableAssessments, setAvailableAssessments] = useState([])

  // Access
  const [accessError, setAccessError] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)

  // Phase: 'landing' | 'assessment' | 'submitted'
  const [phase, setPhase] = useState('landing')

  // Candidate info
  const [candidate, setCandidate] = useState({
    full_name: '', id_number: '', phone: '', email: '', territory: '',
  })
  const [errors, setErrors] = useState({})

  // Assessment state
  const [answers, setAnswers] = useState({})
  const [currentSection, setCurrentSection] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [submissionId, setSubmissionId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [showTimeWarning, setShowTimeWarning] = useState(false)

  const timerRef = useRef(null)
  const autosaveRef = useRef(null)
  const answersRef = useRef(answers)
  answersRef.current = answers

  // ── Auth check ──
  useEffect(() => {
    const check = async () => {
      const { data: { session: s } } = await supabase.auth.getSession()
      if (!s) {
        const redirect = assessmentId
          ? `/careers/assessment?id=${assessmentId}`
          : '/careers/assessment'
        router.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`)
        return
      }
      setSession(s)

      // Pre-fill from profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, phone')
        .eq('id', s.user.id)
        .single()

      if (profile) {
        setCandidate(prev => ({
          ...prev,
          full_name: prev.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' '),
          phone: prev.phone || profile.phone || '',
          email: prev.email || s.user.email || '',
        }))
      } else {
        setCandidate(prev => ({ ...prev, email: prev.email || s.user.email || '' }))
      }

      setAuthLoading(false)
    }
    check()
  }, [])

  // ── Load assessment data & check invitation ──
  useEffect(() => {
    if (authLoading || !session) return

    const loadData = async () => {
      setDataLoading(true)

      // No assessment ID → load available assessments for this user
      if (!assessmentId) {
        // Find invitations for this user's email
        const { data: invites } = await supabase
          .from('assessment_invitations')
          .select('*, assessments:assessment_id(id, name, description, status, time_limit_secs, total_marks)')
          .or(`user_id.eq.${session.user.id},email.eq.${session.user.email}`)
          .in('status', ['sent', 'pending', 'accepted'])

        // Also load open (non-invite-only) assessments
        const { data: openAssessments } = await supabase
          .from('assessments')
          .select('id, name, description, status, time_limit_secs, total_marks, require_invite')
          .eq('status', 'active')
          .eq('require_invite', false)

        const inviteList = (invites || [])
          .filter(i => i.assessments?.status === 'active')
          .map(i => ({ ...i.assessments, invitation_id: i.id, invited: true }))

        const openList = (openAssessments || [])
          .filter(a => !inviteList.some(i => i.id === a.id))
          .map(a => ({ ...a, invited: false }))

        setAvailableAssessments([...inviteList, ...openList])
        setDataLoading(false)
        return
      }

      // Load assessment
      const { data: aData, error: aError } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', assessmentId)
        .eq('status', 'active')
        .single()

      if (aError || !aData) {
        setAccessError('Assessment not found or no longer available.')
        setDataLoading(false)
        return
      }

      // Check availability window
      const now = new Date()
      if (aData.opens_at && new Date(aData.opens_at) > now) {
        const opensDate = new Date(aData.opens_at).toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short' })
        setAccessError(`This assessment is not yet open. It opens on ${opensDate}. Please come back then.`)
        setDataLoading(false)
        return
      }
      if (aData.closes_at && new Date(aData.closes_at) < now) {
        const closedDate = new Date(aData.closes_at).toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short' })
        setAccessError(`This assessment closed on ${closedDate}. It is no longer accepting submissions.`)
        setDataLoading(false)
        return
      }

      setAssessment(aData)
      setTimeLeft(aData.time_limit_secs)

      // Check invitation if required
      if (aData.require_invite) {
        const { data: inv } = await supabase
          .from('assessment_invitations')
          .select('*')
          .eq('assessment_id', assessmentId)
          .or(`user_id.eq.${session.user.id},email.eq.${session.user.email}`)
          .in('status', ['sent', 'pending', 'accepted'])
          .single()

        if (!inv) {
          setAccessError('You have not been invited to this assessment. Please contact the administrator.')
          setDataLoading(false)
          return
        }

        setInvitation(inv)

        // Mark invitation as accepted
        if (inv.status !== 'accepted') {
          await supabase
            .from('assessment_invitations')
            .update({ status: 'accepted', accepted_at: new Date().toISOString(), user_id: session.user.id })
            .eq('id', inv.id)
        }
      }

      // Check for existing in-progress submission (resume)
      const { data: existing } = await supabase
        .from('assessment_submissions')
        .select('*')
        .eq('assessment_id', assessmentId)
        .eq('user_id', session.user.id)
        .eq('status', 'in_progress')
        .single()

      if (existing) {
        // Resume
        setSubmissionId(existing.id)
        setAnswers(existing.answers || {})
        setCandidate({
          full_name: existing.full_name,
          id_number: existing.id_number || '',
          phone: existing.phone,
          email: existing.email || '',
          territory: existing.territory || '',
        })
        // Calculate remaining time
        const elapsed = Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000)
        const remaining = Math.max(0, aData.time_limit_secs - elapsed)
        setTimeLeft(remaining)

        if (remaining <= 0) {
          // Time expired while away — auto submit
          await supabase.from('assessment_submissions')
            .update({ status: 'submitted', submitted_at: new Date().toISOString(), time_used_secs: aData.time_limit_secs })
            .eq('id', existing.id)
          setPhase('submitted')
        } else {
          setPhase('assessment')
        }
      }

      // Check for already-submitted
      const { data: submitted } = await supabase
        .from('assessment_submissions')
        .select('id')
        .eq('assessment_id', assessmentId)
        .eq('user_id', session.user.id)
        .eq('status', 'submitted')
        .single()

      if (submitted) {
        setAccessError('You have already submitted this assessment.')
        setDataLoading(false)
        return
      }

      // Load sections & questions
      const { data: secData } = await supabase
        .from('assessment_sections')
        .select('*, assessment_questions(*)')
        .eq('assessment_id', assessmentId)
        .order('sort_order')

      const sorted = (secData || []).map(s => ({
        ...s,
        assessment_questions: (s.assessment_questions || []).sort((a, b) => a.sort_order - b.sort_order),
      }))
      setSections(sorted)
      setDataLoading(false)
    }

    loadData()
  }, [authLoading, session, assessmentId])

  // ── Timer ──
  useEffect(() => {
    if (phase !== 'assessment') return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); handleAutoSubmit(); return 0 }
        if (prev === 300) setShowTimeWarning(true)
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  // ── Auto-save ──
  useEffect(() => {
    if (phase !== 'assessment' || !submissionId) return
    autosaveRef.current = setInterval(() => saveProgress(false), AUTOSAVE_INTERVAL)
    return () => clearInterval(autosaveRef.current)
  }, [phase, submissionId])

  // ── Helpers ──
  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  }
  const timeColor = timeLeft <= 300 ? '#ef4444' : timeLeft <= 600 ? '#f59e0b' : '#34d399'

  const allQuestions = sections.flatMap(s => s.assessment_questions || [])
  const answeredCount = allQuestions.filter(q => answers[q.id]?.trim()).length
  const progress = allQuestions.length > 0 ? Math.round((answeredCount / allQuestions.length) * 100) : 0

  const validateCandidate = () => {
    const e = {}
    if (!candidate.full_name.trim()) e.full_name = 'Required'
    if (!candidate.phone.trim()) e.phone = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Start assessment ──
  const handleStart = async () => {
    if (!validateCandidate()) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('assessment_submissions')
        .insert({
          assessment_id: assessmentId,
          invitation_id: invitation?.id || null,
          user_id: session.user.id,
          full_name: candidate.full_name.trim(),
          id_number: candidate.id_number.trim() || null,
          phone: candidate.phone.trim(),
          email: candidate.email.trim() || null,
          territory: candidate.territory.trim() || null,
          answers: {},
          status: 'in_progress',
          time_limit_secs: assessment.time_limit_secs,
          max_score: assessment.total_marks,
        })
        .select('id')
        .single()

      if (error) throw error
      setSubmissionId(data.id)
      setPhase('assessment')
    } catch (err) {
      console.error('Failed to start:', err)
      alert('Failed to start. Please check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Save ──
  const saveProgress = useCallback(async (showIndicator = true) => {
    if (!submissionId) return
    if (showIndicator) setSaving(true)
    try {
      await supabase.from('assessment_submissions')
        .update({ answers: answersRef.current, time_used_secs: (assessment?.time_limit_secs || 0) - timeLeft })
        .eq('id', submissionId)
    } catch (e) { console.error('Auto-save failed:', e) }
    finally { if (showIndicator) setTimeout(() => setSaving(false), 800) }
  }, [submissionId, timeLeft, assessment])

  // ── Submit ──
  const handleSubmit = async () => {
    setSubmitting(true); setShowSubmitConfirm(false)
    clearInterval(timerRef.current); clearInterval(autosaveRef.current)
    try {
      await supabase.from('assessment_submissions')
        .update({
          answers: answersRef.current,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          time_used_secs: (assessment?.time_limit_secs || 0) - timeLeft,
        })
        .eq('id', submissionId)
      setPhase('submitted')
    } catch (e) { console.error('Submit failed:', e); alert('Submission failed. Please try again.') }
    finally { setSubmitting(false) }
  }

  const handleAutoSubmit = async () => {
    clearInterval(timerRef.current); clearInterval(autosaveRef.current)
    try {
      await supabase.from('assessment_submissions')
        .update({
          answers: answersRef.current,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          time_used_secs: assessment?.time_limit_secs || 0,
        })
        .eq('id', submissionId)
    } catch (e) { console.error(e) }
    setPhase('submitted')
  }

  const setAnswer = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  /* ═══════════ STYLES ═══════════ */
  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
    .asmnt-root { font-family: 'DM Sans', sans-serif; }
    .asmnt-display { font-family: 'Syne', sans-serif; }
    .asmnt-glass { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.10); border-radius: 16px; backdrop-filter: blur(12px); }
    .asmnt-input { width:100%; padding:12px 14px 12px 42px; border:1px solid rgba(255,255,255,0.15); border-radius:12px; font-size:14px; background:rgba(0,0,0,0.2); color:#fff; outline:none; font-family:'DM Sans',sans-serif; transition:border-color 0.2s; }
    .asmnt-input::placeholder { color:rgba(255,255,255,0.35); }
    .asmnt-input:focus { border-color:rgba(96,165,250,0.5); }
    .asmnt-input-error { border-color:#ef4444 !important; }
    .asmnt-textarea { width:100%; min-height:160px; padding:14px 16px; border:1px solid rgba(255,255,255,0.12); border-radius:14px; font-size:14px; line-height:1.7; background:rgba(0,0,0,0.2); color:#fff; outline:none; resize:vertical; font-family:'DM Sans',sans-serif; transition:border-color 0.2s; }
    .asmnt-textarea::placeholder { color:rgba(255,255,255,0.3); }
    .asmnt-textarea:focus { border-color:rgba(96,165,250,0.5); }
    .asmnt-btn { display:inline-flex; align-items:center; gap:8px; padding:12px 28px; border-radius:12px; font-size:14px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; border:none; }
    .asmnt-btn-primary { background:linear-gradient(135deg,#2563eb,#1d4ed8); color:#fff; box-shadow:0 4px 16px rgba(37,99,235,0.3); }
    .asmnt-btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(37,99,235,0.4); }
    .asmnt-btn-secondary { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.7); border:1px solid rgba(255,255,255,0.12); }
    .asmnt-btn-secondary:hover { background:rgba(255,255,255,0.14); color:#fff; }
    .asmnt-section-tab { padding:8px 14px; border-radius:10px; font-size:12px; font-weight:500; cursor:pointer; border:1px solid transparent; background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.4); transition:all 0.15s; font-family:'DM Sans',sans-serif; white-space:nowrap; }
    .asmnt-section-tab:hover { color:rgba(255,255,255,0.7); }
    .asmnt-section-tab-active { background:rgba(96,165,250,0.2) !important; border-color:rgba(96,165,250,0.3) !important; color:#93c5fd !important; font-weight:600; }
    .asmnt-section-tab-done { background:rgba(52,211,153,0.1); color:rgba(52,211,153,0.7); }
    @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    .fade-up { animation: fadeUp 0.5s ease both; }
    @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.5;} }
    .pulse { animation: pulse 1.5s ease-in-out infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media(max-width:640px) { .asmnt-container{padding:16px !important;} .asmnt-hero{padding:56px 16px 0 !important;} }
  `

  const bgStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 60%, #1e40af 100%)',
    color: '#fff', position: 'relative', overflow: 'hidden',
  }

  const glowA = { position:'absolute', top:'-200px', right:'-100px', width:'500px', height:'500px', background:'radial-gradient(circle, rgba(37,99,235,0.3) 0%, transparent 70%)', pointerEvents:'none' }

  /* ═══════════ LOADING ═══════════ */
  if (authLoading || (assessmentId && dataLoading)) {
    return (
      <><style>{styles}</style>
        <div className="asmnt-root" style={{ ...bgStyle, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ textAlign:'center' }}>
            <Loader2 size={32} style={{ animation:'spin 1s linear infinite', color:'#60a5fa', margin:'0 auto 14px' }} />
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)' }}>{authLoading ? 'Checking authentication…' : 'Loading assessment…'}</p>
          </div>
        </div>
      </>
    )
  }

  /* ═══════════ ACCESS ERROR ═══════════ */
  if (accessError) {
    return (
      <><style>{styles}</style>
        <div className="asmnt-root" style={{ ...bgStyle, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div className="fade-up" style={{ textAlign:'center', maxWidth:440 }}>
            <div style={{ width:72, height:72, borderRadius:20, margin:'0 auto 20px', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Lock size={36} style={{ color:'#f87171' }} />
            </div>
            <h1 className="asmnt-display" style={{ fontSize:22, fontWeight:800, marginBottom:10 }}>Access Denied</h1>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.6)', lineHeight:1.7, marginBottom:24 }}>{accessError}</p>
            <a href="/" className="asmnt-btn asmnt-btn-secondary" style={{ textDecoration:'none' }}><ArrowLeft size={15} /> Back to Home</a>
          </div>
        </div>
      </>
    )
  }

  /* ═══════════ ASSESSMENT LIST (no id selected) ═══════════ */
  if (!assessmentId) {
    return (
      <><style>{styles}</style>
        <div className="asmnt-root" style={bgStyle}>
          <div style={glowA} />
          <div className="asmnt-hero" style={{ maxWidth:640, margin:'0 auto', padding:'80px 32px 40px', position:'relative', zIndex:1 }}>
            <div className="fade-up" style={{ textAlign:'center', marginBottom:32 }}>
              <img src="/logo.png" alt="" style={{ width:48, height:48, objectFit:'contain', margin:'0 auto 14px', opacity:0.9 }} />
              <h1 className="asmnt-display" style={{ fontSize:'clamp(24px,5vw,32px)', fontWeight:800, letterSpacing:'-0.03em', marginBottom:10 }}>
                Your <span style={{ color:'#60a5fa' }}>Assessments</span>
              </h1>
              <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)' }}>Select an assessment to begin or continue.</p>
            </div>

            {dataLoading ? (
              <div style={{ textAlign:'center', padding:'40px 0' }}><Loader2 size={28} style={{ animation:'spin 1s linear infinite', color:'#60a5fa' }} /></div>
            ) : availableAssessments.length === 0 ? (
              <div className="asmnt-glass fade-up" style={{ padding:32, textAlign:'center' }}>
                <ClipboardList size={36} style={{ color:'rgba(255,255,255,0.2)', margin:'0 auto 12px' }} />
                <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)' }}>No assessments available for you at this time.</p>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginTop:6 }}>If you've been invited, make sure you're logged in with the correct email address.</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {availableAssessments.map(a => (
                  <button key={a.id} onClick={() => router.push(`/careers/assessment?id=${a.id}`)}
                    className="fade-up asmnt-glass" style={{ padding:20, textAlign:'left', cursor:'pointer', transition:'all 0.2s', border:'1px solid rgba(255,255,255,0.10)' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                      <div>
                        <h3 className="asmnt-display" style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>{a.name}</h3>
                        {a.description && <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.6, marginBottom:8 }}>{a.description}</p>}
                        <div style={{ display:'flex', gap:12, fontSize:11, color:'rgba(255,255,255,0.4)', flexWrap:'wrap' }}>
                          <span><Clock size={10} style={{ display:'inline', verticalAlign:'-1px' }} /> {Math.round(a.time_limit_secs / 60)} min</span>
                          <span>{a.total_marks} marks</span>
                          {a.invited && <span style={{ color:'#60a5fa' }}>✉ Invited</span>}
                          {(() => {
                            const now = new Date()
                            if (a.closes_at && new Date(a.closes_at) < now) return <span style={{ color:'#f87171' }}>🔴 Closed</span>
                            if (a.opens_at && new Date(a.opens_at) > now) return <span style={{ color:'#fbbf24' }}>🕐 Opens {new Date(a.opens_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                            if (a.closes_at) return <span style={{ color:'#34d399' }}>⏳ Closes {new Date(a.closes_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                            return null
                          })()}
                        </div>
                      </div>
                      <ChevronRight size={18} style={{ color:'rgba(255,255,255,0.3)', flexShrink:0, marginTop:4 }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  /* ═══════════ SUBMITTED ═══════════ */
  if (phase === 'submitted') {
    const timeUsed = (assessment?.time_limit_secs || 0) - timeLeft
    return (
      <><style>{styles}</style>
        <div className="asmnt-root" style={{ ...bgStyle, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div className="fade-up" style={{ textAlign:'center', maxWidth:480 }}>
            <div style={{ width:80, height:80, borderRadius:24, margin:'0 auto 24px', background:'rgba(52,211,153,0.15)', border:'1px solid rgba(52,211,153,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <CheckCircle size={40} style={{ color:'#34d399' }} />
            </div>
            <h1 className="asmnt-display" style={{ fontSize:28, fontWeight:800, marginBottom:12 }}>Assessment Submitted</h1>
            <p style={{ fontSize:15, color:'rgba(255,255,255,0.6)', lineHeight:1.7, marginBottom:8 }}>
              Thank you, <strong style={{ color:'#fff' }}>{candidate.full_name}</strong>. Your assessment has been received.
            </p>
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', marginBottom:24 }}>
              {answeredCount} of {allQuestions.length} questions answered · Time used: {formatTime(timeUsed)}
            </p>
            <div className="asmnt-glass" style={{ padding:20, marginBottom:32, textAlign:'left' }}>
              <h3 style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>What happens next</h3>
              {['Our team will review and score your assessment.','If shortlisted, you will be contacted for the next stage.','Results are typically communicated within 5–7 business days.'].map((t,i) => (
                <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:8 }}>
                  <span style={{ color:'#60a5fa', fontWeight:700, fontSize:13, flexShrink:0 }}>{i+1}.</span>
                  <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.6 }}>{t}</p>
                </div>
              ))}
            </div>
            <a href="/" className="asmnt-btn asmnt-btn-secondary" style={{ textDecoration:'none' }}><ArrowLeft size={15} /> Back to Carfix-Connect</a>
          </div>
        </div>
      </>
    )
  }

  /* ═══════════ LANDING (fill candidate info & start) ═══════════ */
  if (phase === 'landing' && assessment) {
    const instrLines = (assessment.instructions || '').split('\n').filter(Boolean)
    return (
      <><style>{styles}</style>
        <div className="asmnt-root" style={bgStyle}>
          <div style={glowA} />
          <div className="asmnt-hero" style={{ maxWidth:640, margin:'0 auto', padding:'80px 32px 40px', position:'relative', zIndex:1 }}>
            <div className="fade-up" style={{ textAlign:'center', marginBottom:32 }}>
              <img src="/logo.png" alt="" style={{ width:56, height:56, objectFit:'contain', margin:'0 auto 16px', opacity:0.9 }} />
              <h1 className="asmnt-display" style={{ fontSize:'clamp(24px,5vw,34px)', fontWeight:800, letterSpacing:'-0.03em', marginBottom:10 }}>
                {assessment.name}
              </h1>
              {assessment.description && <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', lineHeight:1.7, maxWidth:480, margin:'0 auto' }}>{assessment.description}</p>}
            </div>

            {/* Info cards */}
            <div className="fade-up asmnt-glass" style={{ padding:24, marginBottom:24 }}>
              <h3 style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>Before you begin</h3>
              {[
                { icon:<Clock size={14}/>, text:`You have ${Math.round(assessment.time_limit_secs/60)} minutes to complete this assessment.` },
                { icon:<FileText size={14}/>, text:`${sections.reduce((t,s)=>t+(s.assessment_questions?.length||0),0)} questions across ${sections.length} sections, totalling ${assessment.total_marks} marks.` },
                { icon:<Shield size={14}/>, text:'Your answers auto-save every 30 seconds. If time runs out, your work is submitted automatically.' },
                { icon:<AlertTriangle size={14}/>, text:'Once you start, the timer cannot be paused. Make sure you are ready.' },
                ...(instrLines.length > 0 ? instrLines.map(l => ({ icon:<ChevronRight size={14}/>, text:l })) : []),
              ].map((item,i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                  <div style={{ marginTop:2, color:'#60a5fa', flexShrink:0 }}>{item.icon}</div>
                  <p style={{ fontSize:13, color:'rgba(255,255,255,0.65)', lineHeight:1.6 }}>{item.text}</p>
                </div>
              ))}
            </div>

            {/* Candidate form */}
            <div className="fade-up asmnt-glass" style={{ padding:24, marginBottom:24 }}>
              <h3 style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:16 }}>Your details</h3>
              {[
                { key:'full_name', label:'Full Name *', icon:<User size={15}/>, placeholder:'Enter your full name', type:'text' },
                { key:'id_number', label:'ID / Passport No', icon:<FileText size={15}/>, placeholder:'Optional', type:'text' },
                { key:'phone', label:'Phone Number *', icon:<Phone size={15}/>, placeholder:'+254 7XX XXX XXX', type:'tel' },
                { key:'email', label:'Email Address', icon:<Mail size={15}/>, placeholder:'Optional', type:'email' },
                { key:'territory', label:'Location / Territory Applied For', icon:<MapPin size={15}/>, placeholder:'e.g. Nairobi CBD', type:'text' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom:14 }}>
                  <label style={{ display:'block', fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:6, fontWeight:500 }}>{f.label}</label>
                  <div style={{ position:'relative' }}>
                    <div style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.3)', pointerEvents:'none' }}>{f.icon}</div>
                    <input type={f.type} value={candidate[f.key]} onChange={e => { setCandidate(p=>({...p,[f.key]:e.target.value})); setErrors(p=>({...p,[f.key]:undefined})) }}
                      placeholder={f.placeholder} className={`asmnt-input ${errors[f.key] ? 'asmnt-input-error' : ''}`} />
                  </div>
                  {errors[f.key] && <p style={{ fontSize:11, color:'#f87171', marginTop:4 }}>{errors[f.key]}</p>}
                </div>
              ))}
            </div>

            <button onClick={handleStart} disabled={saving} className="asmnt-btn asmnt-btn-primary fade-up"
              style={{ width:'100%', justifyContent:'center', fontSize:15, padding:'14px 28px' }}>
              {saving ? <Loader2 size={18} style={{ animation:'spin 1s linear infinite' }} /> : <Clock size={18} />}
              {saving ? 'Starting…' : `Start Assessment (${Math.round(assessment.time_limit_secs/60)} min)`}
            </button>
            <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:16 }}>By starting, you confirm that all answers are your own work.</p>
          </div>
        </div>
      </>
    )
  }

  /* ═══════════ ASSESSMENT (timed test) ═══════════ */
  if (phase === 'assessment' && sections.length > 0) {
    const sec = sections[currentSection]
    const sectionQuestions = sec?.assessment_questions || []
    const sectionAnswered = sectionQuestions.filter(q => answers[q.id]?.trim()).length

    return (
      <><style>{styles}</style>

        {/* Time warning modal */}
        {showTimeWarning && (
          <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', padding:16 }}>
            <div className="asmnt-glass" style={{ maxWidth:400, padding:28, textAlign:'center', border:'1px solid rgba(239,68,68,0.3)' }}>
              <AlertTriangle size={40} style={{ color:'#f59e0b', margin:'0 auto 14px' }} />
              <h2 className="asmnt-display" style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>5 Minutes Remaining</h2>
              <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.7, marginBottom:20 }}>Your assessment will be auto-submitted when time runs out.</p>
              <button onClick={() => setShowTimeWarning(false)} className="asmnt-btn asmnt-btn-primary" style={{ width:'100%', justifyContent:'center' }}>Continue Working</button>
            </div>
          </div>
        )}

        {/* Submit confirmation */}
        {showSubmitConfirm && (
          <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', padding:16 }}>
            <div className="asmnt-glass" style={{ maxWidth:420, padding:28, border:'1px solid rgba(255,255,255,0.12)' }}>
              <h2 className="asmnt-display" style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Submit Assessment?</h2>
              <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.7, marginBottom:6 }}>
                You have answered <strong style={{ color:'#fff' }}>{answeredCount}</strong> of <strong style={{ color:'#fff' }}>{allQuestions.length}</strong> questions.
                {answeredCount < allQuestions.length && <span style={{ color:'#f59e0b' }}> {allQuestions.length - answeredCount} still blank.</span>}
              </p>
              <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>Time remaining: <strong style={{ color:timeColor }}>{formatTime(timeLeft)}</strong></p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:20 }}>Once submitted, you cannot make changes.</p>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setShowSubmitConfirm(false)} className="asmnt-btn asmnt-btn-secondary" style={{ flex:1, justifyContent:'center' }}>Go Back</button>
                <button onClick={handleSubmit} disabled={submitting} className="asmnt-btn asmnt-btn-primary" style={{ flex:1, justifyContent:'center' }}>
                  {submitting ? <Loader2 size={16} style={{ animation:'spin 1s linear infinite' }} /> : <Send size={16} />} {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="asmnt-root" style={bgStyle}>
          {/* Top bar */}
          <div style={{ position:'sticky', top:0, zIndex:100, background:'rgba(10,22,40,0.85)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'10px 24px' }}>
            <div style={{ maxWidth:900, margin:'0 auto', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
              <span className="asmnt-display" style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.4)', flexShrink:0, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {assessment.name}
              </span>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:10, background:timeLeft<=300?'rgba(239,68,68,0.15)':'rgba(255,255,255,0.06)', border:`1px solid ${timeLeft<=300?'rgba(239,68,68,0.3)':'rgba(255,255,255,0.1)'}`, flexShrink:0 }}>
                <Clock size={13} style={{ color:timeColor }} className={timeLeft <= 300 ? 'pulse' : ''} />
                <span style={{ fontSize:14, fontWeight:700, color:timeColor, fontVariantNumeric:'tabular-nums' }}>{formatTime(timeLeft)}</span>
              </div>
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, minWidth:100 }}>
                <div style={{ flex:1, height:6, borderRadius:99, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:99, background:'#60a5fa', width:`${progress}%`, transition:'width 0.3s' }} />
                </div>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{answeredCount}/{allQuestions.length}</span>
              </div>
              {saving && <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)', display:'flex', alignItems:'center', gap:4 }}><Loader2 size={10} style={{ animation:'spin 1s linear infinite' }} /> Saving…</span>}
              <button onClick={() => setShowSubmitConfirm(true)} className="asmnt-btn asmnt-btn-primary" style={{ padding:'8px 18px', fontSize:13 }}><Send size={13} /> Submit</button>
            </div>
          </div>

          {/* Section tabs */}
          <div style={{ maxWidth:900, margin:'0 auto', padding:'16px 24px 0' }}>
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8 }}>
              {sections.map((s, i) => {
                const qs = s.assessment_questions || []
                const done = qs.length > 0 && qs.every(q => answers[q.id]?.trim())
                const partial = qs.some(q => answers[q.id]?.trim())
                return (
                  <button key={s.id} onClick={() => setCurrentSection(i)}
                    className={`asmnt-section-tab ${i === currentSection ? 'asmnt-section-tab-active' : ''} ${done ? 'asmnt-section-tab-done' : ''}`}>
                    {String.fromCharCode(65 + i)}
                    {done && <CheckCircle size={10} style={{ marginLeft:4, verticalAlign:'-1px' }} />}
                    {!done && partial && <span style={{ marginLeft:4, width:5, height:5, borderRadius:99, background:'#f59e0b', display:'inline-block', verticalAlign:'1px' }} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section content */}
          <div className="asmnt-container" style={{ maxWidth:900, margin:'0 auto', padding:'0 24px 60px' }}>
            <div className="fade-up" style={{ marginBottom:24, marginTop:8 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, padding:'14px 20px', borderRadius:14, background:'rgba(37,99,235,0.15)', border:'1px solid rgba(37,99,235,0.25)' }}>
                <div>
                  <h2 className="asmnt-display" style={{ fontSize:17, fontWeight:700, marginBottom:2 }}>
                    Section {String.fromCharCode(65 + currentSection)} — {sec.title}
                  </h2>
                  {sec.description && <p style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{sec.description}</p>}
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <span style={{ fontSize:20, fontWeight:700, color:'#60a5fa' }}>{sec.marks}</span>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}> marks</span>
                  <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{sectionAnswered}/{sectionQuestions.length} answered</p>
                </div>
              </div>
            </div>

            {sectionQuestions.map((q, i) => (
              <div key={q.id} className="fade-up asmnt-glass" style={{ padding:22, marginBottom:16, animationDelay:`${i*0.05}s` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12 }}>
                  <div style={{ display:'flex', gap:8, flex:1 }}>
                    <span style={{
                      display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:8, flexShrink:0, fontSize:12, fontWeight:700,
                      background: answers[q.id]?.trim() ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)',
                      color: answers[q.id]?.trim() ? '#34d399' : 'rgba(255,255,255,0.4)',
                      border: `1px solid ${answers[q.id]?.trim() ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.08)'}`,
                    }}>{i + 1}</span>
                    <p style={{ fontSize:14, color:'rgba(255,255,255,0.85)', lineHeight:1.65, whiteSpace:'pre-line' }}>{q.question_text}</p>
                  </div>
                  <span style={{ fontSize:11, fontWeight:600, color:'#60a5fa', flexShrink:0, padding:'3px 10px', borderRadius:8, background:'rgba(96,165,250,0.1)', border:'1px solid rgba(96,165,250,0.15)' }}>
                    {q.marks} mk{q.marks > 1 ? 's' : ''}
                  </span>
                </div>
                <textarea className="asmnt-textarea" value={answers[q.id] || ''} onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder="Type your answer here…" style={{ minHeight: q.marks >= 10 ? 240 : q.marks >= 7 ? 200 : 140 }} />
                {answers[q.id]?.trim() && (
                  <p style={{ fontSize:10, color:'rgba(255,255,255,0.25)', textAlign:'right', marginTop:4 }}>
                    {answers[q.id].trim().split(/\s+/).length} words
                  </p>
                )}
              </div>
            ))}

            {/* Section nav */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:24, gap:12, flexWrap:'wrap' }}>
              <button onClick={() => { setCurrentSection(p=>Math.max(0,p-1)); window.scrollTo(0,0) }} disabled={currentSection===0}
                className="asmnt-btn asmnt-btn-secondary" style={{ opacity:currentSection===0?0.3:1 }}>
                <ChevronLeft size={15} /> Previous
              </button>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>Section {currentSection+1} of {sections.length}</span>
              {currentSection < sections.length - 1 ? (
                <button onClick={() => { setCurrentSection(p=>Math.min(sections.length-1,p+1)); window.scrollTo(0,0) }} className="asmnt-btn asmnt-btn-secondary">
                  Next <ChevronRight size={15} />
                </button>
              ) : (
                <button onClick={() => setShowSubmitConfirm(true)} className="asmnt-btn asmnt-btn-primary"><Send size={15} /> Submit Assessment</button>
              )}
            </div>
          </div>
        </div>
      </>
    )
  }

  return null
}