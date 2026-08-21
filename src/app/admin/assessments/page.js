// src/app/admin/assessments/page.js
'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, Plus, Edit3, Trash2, Send, Users, BarChart3, Upload, Search,
  Clock, CheckCircle, XCircle, AlertTriangle, Eye, ChevronDown, ChevronUp,
  Loader2, Copy, ExternalLink, Mail, Save, GripVertical, X, Archive,
} from 'lucide-react'

const TAB_ITEMS = [
  { id:'assessments', label:'Assessments', icon: FileText },
  { id:'questions',   label:'Questions',   icon: Edit3 },
  { id:'invitations', label:'Invitations', icon: Send },
  { id:'submissions', label:'Submissions', icon: BarChart3 },
  { id:'upload',      label:'Upload / Add', icon: Upload },
]

export default function AdminAssessmentsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState('assessments')
  const [assessments, setAssessments] = useState([])
  const [selectedAssessment, setSelectedAssessment] = useState(null)
  const [loading, setLoading] = useState(true)

  const [setupError, setSetupError] = useState(null)
  const [debugInfo, setDebugInfo] = useState(null)

  // ── Load assessments ──
  const loadAssessments = useCallback(async () => {
    setLoading(true)
    setSetupError(null)
    setDebugInfo(null)

    const debug = { steps: [], timestamp: new Date().toISOString() }

    try {
      // Step 1: Check auth
      debug.steps.push('1. Checking auth...')
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) {
        debug.steps.push(`❌ Auth error: ${JSON.stringify(authError)}`)
        debug.authError = authError
        setDebugInfo(debug)
        setSetupError('error')
        setLoading(false)
        return
      }
      debug.steps.push(`✅ Auth OK — user: ${authData.user?.email}`)
      debug.userId = authData.user?.id
      debug.userEmail = authData.user?.email

      // Step 2: Check if assessments table exists (simple count)
      debug.steps.push('2. Testing assessments table (SELECT count)...')
      const { count, error: countError } = await supabase
        .from('assessments')
        .select('*', { count: 'exact', head: true })

      if (countError) {
        debug.steps.push(`❌ Table query failed: ${JSON.stringify(countError)}`)
        debug.tableError = countError
        setDebugInfo(debug)
        setSetupError('tables_missing')
        setLoading(false)
        return
      }
      debug.steps.push(`✅ assessments table exists — ${count} rows`)

      // Step 3: Full query with joins
      debug.steps.push('3. Loading assessments with sections + questions...')
      const { data, error, status, statusText } = await supabase
        .from('assessments')
        .select('*, assessment_sections(id, title, marks, sort_order, assessment_questions(id))')
        .order('created_at', { ascending: false })

      debug.queryStatus = status
      debug.queryStatusText = statusText

      if (error) {
        debug.steps.push(`❌ Query error: code=${error.code}, message=${error.message}, details=${error.details}, hint=${error.hint}`)
        debug.queryError = error
        setDebugInfo(debug)
        setSetupError('error')
        setLoading(false)
        return
      }

      debug.steps.push(`✅ Loaded ${data?.length || 0} assessments`)
      debug.assessmentCount = data?.length || 0

      if (data?.length > 0) {
        debug.steps.push(`   First: "${data[0].name}" (${data[0].status}) — ${data[0].assessment_sections?.length || 0} sections`)
      }

      setDebugInfo(debug)
      setAssessments(data || [])
      if (data?.length && !selectedAssessment) setSelectedAssessment(data[0])

    } catch (err) {
      debug.steps.push(`❌ Uncaught exception: ${err?.message || err}`)
      debug.exception = { message: err?.message, stack: err?.stack, name: err?.name }
      console.error('Assessment load crash:', err)
      setDebugInfo(debug)
      setSetupError('error')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAssessments() }, [loadAssessments])

  const currentAssessment = selectedAssessment
  const assessmentOptions = assessments.map(a => ({ id: a.id, name: a.name, status: a.status }))

  // ── Setup error screen ──
  if (setupError) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="bg-white border border-orange-200 rounded-xl p-8">
          <div className="text-center mb-6">
            <AlertTriangle size={40} className="text-orange-400 mx-auto mb-4" />
            <h1 className="text-lg font-bold text-gray-900 mb-2">
              {setupError === 'tables_missing' ? 'Database Setup Required' : 'Failed to Load Assessments'}
            </h1>
            <p className="text-sm text-gray-500">See debug details below to identify the issue.</p>
          </div>

          {/* Debug output */}
          {debugInfo && (
            <div className="bg-gray-900 rounded-lg p-4 text-xs font-mono text-gray-300 mb-6 overflow-x-auto max-h-96 overflow-y-auto">
              <p className="text-gray-500 mb-2">── Debug Log ({debugInfo.timestamp}) ──</p>
              {debugInfo.steps.map((step, i) => (
                <p key={i} className={`mb-0.5 ${step.startsWith('❌') ? 'text-red-400' : step.startsWith('✅') ? 'text-green-400' : 'text-gray-400'}`}>
                  {step}
                </p>
              ))}
              {debugInfo.tableError && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-yellow-400 mb-1">Table Error Details:</p>
                  <pre className="text-red-300 whitespace-pre-wrap">{JSON.stringify(debugInfo.tableError, null, 2)}</pre>
                </div>
              )}
              {debugInfo.queryError && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-yellow-400 mb-1">Query Error Details:</p>
                  <pre className="text-red-300 whitespace-pre-wrap">{JSON.stringify(debugInfo.queryError, null, 2)}</pre>
                </div>
              )}
              {debugInfo.authError && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-yellow-400 mb-1">Auth Error:</p>
                  <pre className="text-red-300 whitespace-pre-wrap">{JSON.stringify(debugInfo.authError, null, 2)}</pre>
                </div>
              )}
              {debugInfo.exception && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-yellow-400 mb-1">Exception:</p>
                  <pre className="text-red-300 whitespace-pre-wrap">{JSON.stringify(debugInfo.exception, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button onClick={() => { setSetupError(null); setDebugInfo(null); loadAssessments() }}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              Retry
            </button>
            {debugInfo && (
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2)); alert('Debug info copied to clipboard') }}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 flex items-center gap-1.5">
                <Copy size={14} /> Copy Debug Info
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Assessment Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{assessments.length} assessment{assessments.length !== 1 ? 's' : ''}</p>
        </div>
        {/* Assessment selector */}
        {assessments.length > 0 && (
          <select
            value={selectedAssessment?.id || ''}
            onChange={e => setSelectedAssessment(assessments.find(a => a.id === e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[200px]"
          >
            {assessments.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.status})</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TAB_ITEMS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'assessments' && <AssessmentsTab supabase={supabase} assessments={assessments} reload={loadAssessments} onSelect={a => { setSelectedAssessment(a); setTab('questions') }} />}
      {tab === 'questions' && currentAssessment && <QuestionsTab supabase={supabase} assessment={currentAssessment} reload={loadAssessments} />}
      {tab === 'invitations' && currentAssessment && <InvitationsTab supabase={supabase} assessment={currentAssessment} />}
      {tab === 'submissions' && currentAssessment && <SubmissionsTab supabase={supabase} assessment={currentAssessment} />}
      {tab === 'upload' && currentAssessment && <UploadTab supabase={supabase} assessment={currentAssessment} reload={loadAssessments} />}
      {!currentAssessment && tab !== 'assessments' && (
        <div className="text-center py-16 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>Create an assessment first to manage its content.</p>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB: ASSESSMENTS — List, Create, Edit, Archive
   ═══════════════════════════════════════════════════════════════ */
function AssessmentsTab({ supabase, assessments, reload, onSelect }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name:'', description:'', instructions:'', time_limit_mins:120, passing_pct:50, require_invite:true, opens_at:'', closes_at:'' })

  const resetForm = () => { setForm({ name:'', description:'', instructions:'', time_limit_mins:120, passing_pct:50, require_invite:true, opens_at:'', closes_at:'' }); setEditing(null); setShowForm(false) }

  // Convert ISO to datetime-local input format
  const toLocalInput = (iso) => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset()*60000).toISOString().slice(0,16) : ''

  const openEdit = (a) => {
    setForm({ name:a.name, description:a.description||'', instructions:a.instructions||'', time_limit_mins: Math.round(a.time_limit_secs/60), passing_pct: a.passing_pct||50, require_invite: a.require_invite !== false, opens_at: toLocalInput(a.opens_at), closes_at: toLocalInput(a.closes_at) })
    setEditing(a.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    const slug = form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const payload = {
      name: form.name.trim(),
      slug: slug + (editing ? '' : '-' + Date.now().toString(36)),
      description: form.description.trim() || null,
      instructions: form.instructions.trim() || null,
      time_limit_secs: (form.time_limit_mins || 120) * 60,
      passing_pct: form.passing_pct || 50,
      require_invite: form.require_invite,
      opens_at: form.opens_at ? new Date(form.opens_at).toISOString() : null,
      closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
    }

    if (editing) {
      await supabase.from('assessments').update(payload).eq('id', editing)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      payload.created_by = user.id
      payload.status = 'draft'
      await supabase.from('assessments').insert(payload)
    }
    resetForm()
    await reload()
    setSaving(false)
  }

  const toggleStatus = async (a) => {
    const next = a.status === 'active' ? 'archived' : 'active'
    await supabase.from('assessments').update({ status: next }).eq('id', a.id)
    reload()
  }

  const deleteAssessment = async (id) => {
    if (!confirm('Delete this assessment and ALL its questions, invitations, and submissions? This cannot be undone.')) return
    await supabase.from('assessments').delete().eq('id', id)
    reload()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">All Assessments</h2>
        <button onClick={() => { resetForm(); setShowForm(true) }} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          <Plus size={14} /> New Assessment
        </button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-sm text-blue-800 mb-3">{editing ? 'Edit Assessment' : 'Create New Assessment'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Assessment Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="e.g. Field Sales Agent Assessment"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Time Limit (mins)</label>
                <input type="number" value={form.time_limit_mins} onChange={e => setForm(p => ({...p, time_limit_mins: +e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Pass % </label>
                <input type="number" value={form.passing_pct} onChange={e => setForm(p => ({...p, passing_pct: +e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Brief description of this assessment..." />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Instructions (shown to candidates)</label>
            <textarea value={form.instructions} onChange={e => setForm(p => ({...p, instructions: e.target.value}))} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Read each question carefully..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Opens At <span className="text-gray-300">(leave blank = immediately)</span></label>
              <input type="datetime-local" value={form.opens_at} onChange={e => setForm(p => ({...p, opens_at: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Closes At <span className="text-gray-300">(leave blank = no deadline)</span></label>
              <input type="datetime-local" value={form.closes_at} onChange={e => setForm(p => ({...p, closes_at: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          {form.opens_at && form.closes_at && new Date(form.closes_at) <= new Date(form.opens_at) && (
            <p className="text-xs text-red-500 mb-3">⚠ Closing date must be after opening date.</p>
          )}
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.require_invite} onChange={e => setForm(p => ({...p, require_invite: e.target.checked}))} className="accent-blue-600" />
              Require invitation (only invited users can take this assessment)
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editing ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {assessments.map(a => {
          const qCount = a.assessment_sections?.reduce((t, s) => t + (s.assessment_questions?.length || 0), 0) || 0
          const sCount = a.assessment_sections?.length || 0
          return (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4 hover:border-gray-300 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 text-sm">{a.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                    a.status === 'active' ? 'bg-green-100 text-green-700' :
                    a.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{a.status}</span>
                </div>
                {a.description && <p className="text-xs text-gray-400 mb-1.5 line-clamp-1">{a.description}</p>}
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>{sCount} sections · {qCount} questions</span>
                  <span>{a.total_marks} marks</span>
                  <span><Clock size={10} className="inline -mt-0.5" /> {Math.round(a.time_limit_secs/60)} min</span>
                  <span>{a.require_invite ? '🔒 Invite only' : '🌐 Open'}</span>
                  {a.opens_at && <span>Opens: {new Date(a.opens_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>}
                  {a.closes_at && (
                    <span style={{ color: new Date(a.closes_at) < new Date() ? '#ef4444' : undefined }}>
                      {new Date(a.closes_at) < new Date() ? '🔴 Closed' : `Closes: ${new Date(a.closes_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}`}
                    </span>
                  )}
                  {!a.opens_at && !a.closes_at && <span>📅 Always open</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => onSelect(a)} title="Edit questions" className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Edit3 size={14} /></button>
                <button onClick={() => openEdit(a)} title="Edit settings" className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"><FileText size={14} /></button>
                <button onClick={() => toggleStatus(a)} title={a.status === 'active' ? 'Archive' : 'Activate'}
                  className={`p-1.5 rounded-md ${a.status === 'active' ? 'text-green-500 hover:text-orange-500 hover:bg-orange-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}>
                  {a.status === 'active' ? <Archive size={14} /> : <CheckCircle size={14} />}
                </button>
                <button onClick={() => deleteAssessment(a.id)} title="Delete" className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
              </div>
            </div>
          )
        })}
        {assessments.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <FileText size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No assessments yet. Create your first one above.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB: QUESTIONS — Manage sections & questions
   ═══════════════════════════════════════════════════════════════ */
function QuestionsTab({ supabase, assessment, reload }) {
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingSection, setEditingSection] = useState(null)
  const [sectionForm, setSectionForm] = useState({ title:'', description:'' })
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [questionForm, setQuestionForm] = useState({ question_text:'', marks:5 })
  const [expandedSections, setExpandedSections] = useState({})
  const [saving, setSaving] = useState(false)

  const loadSections = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('assessment_sections')
      .select('*, assessment_questions(*)')
      .eq('assessment_id', assessment.id)
      .order('sort_order')
    // Sort questions within each section
    const sorted = (data || []).map(s => ({
      ...s,
      assessment_questions: (s.assessment_questions || []).sort((a, b) => a.sort_order - b.sort_order)
    }))
    setSections(sorted)
    // Auto-expand all
    const exp = {}; sorted.forEach(s => exp[s.id] = true)
    setExpandedSections(exp)
    setLoading(false)
  }, [assessment.id])

  useEffect(() => { loadSections() }, [loadSections])

  const addSection = async () => {
    if (!sectionForm.title.trim()) return
    setSaving(true)
    await supabase.from('assessment_sections').insert({
      assessment_id: assessment.id,
      title: sectionForm.title.trim(),
      description: sectionForm.description.trim() || null,
      sort_order: sections.length,
    })
    setSectionForm({ title:'', description:'' })
    setEditingSection(null)
    await loadSections(); await reload()
    setSaving(false)
  }

  const updateSection = async (id) => {
    setSaving(true)
    await supabase.from('assessment_sections').update({
      title: sectionForm.title.trim(),
      description: sectionForm.description.trim() || null,
    }).eq('id', id)
    setEditingSection(null)
    await loadSections(); await reload()
    setSaving(false)
  }

  const deleteSection = async (id) => {
    if (!confirm('Delete this section and all its questions?')) return
    await supabase.from('assessment_sections').delete().eq('id', id)
    await loadSections(); await reload()
  }

  const addQuestion = async (sectionId) => {
    if (!questionForm.question_text.trim()) return
    setSaving(true)
    const sec = sections.find(s => s.id === sectionId)
    const { error } = await supabase.from('assessment_questions').insert({
      section_id: sectionId,
      question_text: questionForm.question_text.trim(),
      marks: questionForm.marks || 5,
      sort_order: sec?.assessment_questions?.length || 0,
    })
    if (error) {
      alert(`Failed to add question: ${error.message}`)
      setSaving(false)
      return
    }
    setQuestionForm({ question_text:'', marks:5 })
    setEditingQuestion(null)
    await loadSections(); await reload()
    setSaving(false)
  }

  const updateQuestion = async (id, sectionId) => {
    setSaving(true)
    await supabase.from('assessment_questions').update({
      question_text: questionForm.question_text.trim(),
      marks: questionForm.marks || 5,
    }).eq('id', id)
    setEditingQuestion(null)
    await loadSections(); await reload()
    setSaving(false)
  }

  const deleteQuestion = async (id) => {
    await supabase.from('assessment_questions').delete().eq('id', id)
    await loadSections(); await reload()
  }

  const toggleSection = (id) => setExpandedSections(p => ({ ...p, [id]: !p[id] }))

  const totalQ = sections.reduce((t, s) => t + (s.assessment_questions?.length || 0), 0)

  if (loading) return <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">{assessment.name}</h2>
          <p className="text-xs text-gray-400">{sections.length} sections · {totalQ} questions · {assessment.total_marks} marks</p>
        </div>
      </div>

      {/* Sections */}
      {sections.map((s, si) => (
        <div key={s.id} className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden">
          {/* Section header */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 cursor-pointer" onClick={() => toggleSection(s.id)}>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{String.fromCharCode(65 + si)}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-gray-800">{s.title}</h3>
              {s.description && <p className="text-xs text-gray-400 truncate">{s.description}</p>}
            </div>
            <span className="text-xs text-gray-400">{s.assessment_questions?.length || 0}q · {s.marks}mk</span>
            <button onClick={e => { e.stopPropagation(); setEditingSection(s.id); setSectionForm({ title:s.title, description:s.description||'' }) }} className="p-1 text-gray-400 hover:text-blue-600"><Edit3 size={12} /></button>
            <button onClick={e => { e.stopPropagation(); deleteSection(s.id) }} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
            {expandedSections[s.id] ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>

          {/* Edit section inline */}
          {editingSection === s.id && (
            <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 flex gap-2 items-end">
              <input value={sectionForm.title} onChange={e => setSectionForm(p => ({...p, title:e.target.value}))} placeholder="Section title" className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm" />
              <input value={sectionForm.description} onChange={e => setSectionForm(p => ({...p, description:e.target.value}))} placeholder="Description (optional)" className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm" />
              <button onClick={() => updateSection(s.id)} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50">Save</button>
              <button onClick={() => setEditingSection(null)} className="px-2 py-1.5 text-xs text-gray-500">Cancel</button>
            </div>
          )}

          {/* Questions */}
          {expandedSections[s.id] && (
            <div className="p-3 space-y-2">
              {s.assessment_questions?.map((q, qi) => (
                <div key={q.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100 group">
                  {editingQuestion === q.id ? (
                    <div className="flex-1 space-y-2">
                      <textarea value={questionForm.question_text} onChange={e => setQuestionForm(p => ({...p, question_text:e.target.value}))} rows={3} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
                      <div className="flex gap-2 items-center">
                        <label className="text-xs text-gray-500">Marks:</label>
                        <input type="number" value={questionForm.marks} onChange={e => setQuestionForm(p => ({...p, marks:+e.target.value}))} className="w-16 border border-gray-200 rounded px-2 py-1 text-sm" />
                        <button onClick={() => updateQuestion(q.id, s.id)} disabled={saving} className="px-3 py-1 bg-blue-600 text-white text-xs rounded">Save</button>
                        <button onClick={() => setEditingQuestion(null)} className="text-xs text-gray-500">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="text-[10px] font-bold text-gray-400 bg-white border px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">{qi+1}</span>
                      <p className="flex-1 text-sm text-gray-700 leading-relaxed whitespace-pre-line">{q.question_text}</p>
                      <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">{q.marks}mk</span>
                      <button onClick={() => { setEditingQuestion(q.id); setQuestionForm({ question_text:q.question_text, marks:q.marks }) }}
                        className="p-1 text-gray-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"><Edit3 size={11} /></button>
                      <button onClick={() => deleteQuestion(q.id)}
                        className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={11} /></button>
                    </>
                  )}
                </div>
              ))}

              {/* Add question form */}
              {editingQuestion === `new-${s.id}` ? (
                <div className="p-2.5 rounded-lg border-2 border-dashed border-blue-200 bg-blue-50 space-y-2">
                  <textarea value={questionForm.question_text} onChange={e => setQuestionForm(p => ({...p, question_text:e.target.value}))} rows={3} placeholder="Enter question text..." className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-gray-500">Marks:</label>
                    <input type="number" value={questionForm.marks} onChange={e => setQuestionForm(p => ({...p, marks:+e.target.value}))} className="w-16 border border-gray-200 rounded px-2 py-1 text-sm" />
                    <button onClick={() => addQuestion(s.id)} disabled={saving || !questionForm.question_text.trim()} className="px-3 py-1 bg-blue-600 text-white text-xs rounded disabled:opacity-50">Add</button>
                    <button onClick={() => { setEditingQuestion(null); setQuestionForm({ question_text:'', marks:5 }) }} className="text-xs text-gray-500">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setEditingQuestion(`new-${s.id}`); setQuestionForm({ question_text:'', marks:5 }) }}
                  className="w-full py-2 text-xs text-blue-500 border-2 border-dashed border-blue-100 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                  <Plus size={12} className="inline -mt-0.5" /> Add Question
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add section */}
      {editingSection === 'new' ? (
        <div className="bg-blue-50 border-2 border-dashed border-blue-200 rounded-xl p-4 flex gap-2 items-end">
          <input value={sectionForm.title} onChange={e => setSectionForm(p => ({...p, title:e.target.value}))} placeholder="Section title *" className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm" />
          <input value={sectionForm.description} onChange={e => setSectionForm(p => ({...p, description:e.target.value}))} placeholder="Description (optional)" className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm" />
          <button onClick={addSection} disabled={saving || !sectionForm.title.trim()} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50">Add Section</button>
          <button onClick={() => { setEditingSection(null); setSectionForm({ title:'', description:'' }) }} className="text-xs text-gray-500 px-2">Cancel</button>
        </div>
      ) : (
        <button onClick={() => { setEditingSection('new'); setSectionForm({ title:'', description:'' }) }}
          className="w-full py-3 text-sm text-blue-500 border-2 border-dashed border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors">
          <Plus size={14} className="inline -mt-0.5" /> Add Section
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB: INVITATIONS — Invite by email, manage invites
   ═══════════════════════════════════════════════════════════════ */
function InvitationsTab({ supabase, assessment }) {
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [emails, setEmails] = useState('')
  const [emailSubject, setEmailSubject] = useState(`You're invited to take the ${assessment.name}`)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com'
  const assessmentLink = `${baseUrl}/careers/assessment?id=${assessment.id}`
  const timeMins = Math.round((assessment.time_limit_secs || 0) / 60)
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-KE', { weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) : null
  const opensAt = fmtDate(assessment.opens_at)
  const closesAt = fmtDate(assessment.closes_at)

  const buildEmailBody = () => {
    let body = `Hello,\n\nYou have been invited to complete the "${assessment.name}" assessment on Carfix-Connect.`
    if (assessment.description) body += `\n\n${assessment.description}`
    if (opensAt || closesAt) {
      body += '\n\nSchedule:'
      if (opensAt) body += `\n  Opens: ${opensAt}`
      if (closesAt) body += `\n  Closes: ${closesAt}`
    }
    body += `\n\nDuration: ${timeMins} minutes`
    body += `\n\nTo begin, click the link below or copy it into your browser:\n${assessmentLink}`
    body += `\n\nIf you don't have a Carfix-Connect account yet, please register at:\n${baseUrl}/auth/signup\nUse this same email address when signing up so your invitation is linked automatically.`
    body += '\n\nGood luck!'
    return body
  }

  const [emailBody, setEmailBody] = useState(buildEmailBody())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const loadInvitations = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('assessment_invitations_secure')
      .select('*')
      .eq('assessment_id', assessment.id)
      .order('created_at', { ascending: false })
    setInvitations(data || [])
    setLoading(false)
  }, [assessment.id])

  useEffect(() => { loadInvitations() }, [loadInvitations])

  const handleSendInvites = async () => {
    const emailList = emails.split(/[,;\n]+/).map(e => e.trim().toLowerCase()).filter(e => e.includes('@'))
    if (emailList.length === 0) return
    setSending(true); setResult(null)

    try {
      const res = await fetch('/api/admin/assessment-invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: emailList,
          assessmentId: assessment.id,
          assessmentName: assessment.name,
          description: assessment.description || '',
          timeLimitMins: Math.round((assessment.time_limit_secs || 0) / 60),
          opensAt: assessment.opens_at || null,
          closesAt: assessment.closes_at || null,
          emailSubject,
          emailBody,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setResult({ sent: 0, skipped: 0, failed: 0, total: emailList.length, error: data.error || 'Request failed' })
      } else {
        setResult(data)
        setEmails('')
      }
      await loadInvitations()
    } catch (err) {
      console.error('Send invites error:', err)
      setResult({ sent: 0, skipped: 0, failed: 0, total: 0, error: err?.message || 'Network error' })
    }
    setSending(false)
  }

  const revokeInvite = async (id) => {
    await supabase.from('assessment_invitations').update({ status: 'revoked' }).eq('id', id)
    loadInvitations()
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Invite Candidates — {assessment.name}</h2>

      {/* Invite form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Email Addresses (comma, semicolon, or newline separated)</label>
          <textarea value={emails} onChange={e => setEmails(e.target.value)} rows={3} placeholder="john@example.com, jane@example.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Email Subject</label>
          <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Email Body</label>
          <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        {result && (
          <div className={`mb-3 p-3 rounded-lg text-sm ${result.error ? 'bg-red-50 text-red-700' : result.sent > 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
            {result.error
              ? `Failed: ${result.error}${result.sent > 0 ? ` (${result.sent} sent before error)` : ''}`
              : `${result.sent} invitation${result.sent !== 1 ? 's' : ''} sent${result.skipped > 0 ? `, ${result.skipped} already invited` : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}`
            }
          </div>
        )}

        <button onClick={handleSendInvites} disabled={sending || !emails.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {sending ? 'Sending…' : 'Send Invitations'}
        </button>
      </div>

      {/* Invitation list */}
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Sent Invitations ({invitations.length})</h3>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Email</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Sent</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invitations.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-800">{inv.email}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    inv.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                    inv.status === 'accepted' ? 'bg-green-100 text-green-700' :
                    inv.status === 'revoked' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>{inv.status}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{inv.sent_at ? new Date(inv.sent_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  {inv.status === 'sent' && (
                    <button onClick={() => revokeInvite(inv.id)} className="text-xs text-red-400 hover:text-red-600">Revoke</button>
                  )}
                </td>
              </tr>
            ))}
            {invitations.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">No invitations sent yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB: SUBMISSIONS — Review and score
   ═══════════════════════════════════════════════════════════════ */
function SubmissionsTab({ supabase, assessment }) {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null)
  const [sections, setSections] = useState([])
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: subs } = await supabase
      .from('assessment_submissions_secure')
      .select('*')
      .eq('assessment_id', assessment.id)
      .order('submitted_at', { ascending: false })
    setSubmissions(subs || [])

    const { data: secs } = await supabase
      .from('assessment_sections')
      .select('*, assessment_questions(*)')
      .eq('assessment_id', assessment.id)
      .order('sort_order')
    setSections((secs || []).map(s => ({
      ...s, assessment_questions: (s.assessment_questions || []).sort((a, b) => a.sort_order - b.sort_order)
    })))
    setLoading(false)
  }, [assessment.id])

  useEffect(() => { load() }, [load])

  const updateResult = async (subId, result) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('assessment_submissions').update({
      result,
      scored_by: user.id,
      scored_at: new Date().toISOString(),
      status: 'scored',
    }).eq('id', subId)
    load()
  }

  const filtered = filter === 'all' ? submissions : submissions.filter(s => s.status === filter || s.result === filter)

  if (loading) return <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-blue-500 mx-auto" /></div>

  // View detail
  if (viewing) {
    const sub = submissions.find(s => s.id === viewing)
    if (!sub) return null
    const answers = sub.answers || {}
    const answeredCount = Object.values(answers).filter(a => a?.trim()).length
    const totalQ = sections.reduce((t, s) => t + (s.assessment_questions?.length || 0), 0)

    return (
      <div>
        <button onClick={() => setViewing(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4">← Back to list</button>
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">{sub.full_name}</h3>
              <p className="text-xs text-gray-400">{sub.email} · {sub.phone} · {sub.territory || '—'}</p>
            </div>
            <div className="flex items-center gap-2">
              {['pass', 'shortlist', 'fail'].map(r => (
                <button key={r} onClick={() => updateResult(sub.id, r)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    sub.result === r
                      ? r === 'pass' ? 'bg-green-600 text-white border-green-600'
                      : r === 'shortlist' ? 'bg-yellow-500 text-white border-yellow-500'
                      : 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-4 text-xs text-gray-400">
            <span>{answeredCount}/{totalQ} answered</span>
            <span>Time: {sub.time_used_secs ? `${Math.floor(sub.time_used_secs/60)}m ${sub.time_used_secs%60}s` : '—'}</span>
            <span>Submitted: {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : 'In progress'}</span>
          </div>
        </div>

        {/* Answers by section */}
        {sections.map((s, si) => (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 flex items-center gap-2">
              <span className="text-xs font-bold text-blue-600">{String.fromCharCode(65+si)}</span>
              <span className="text-sm font-semibold text-gray-700">{s.title}</span>
              <span className="text-xs text-gray-400 ml-auto">{s.marks} marks</span>
            </div>
            <div className="p-4 space-y-4">
              {s.assessment_questions?.map((q, qi) => {
                const answer = answers[q.id] || ''
                return (
                  <div key={q.id}>
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-[10px] font-bold text-gray-400 mt-0.5">{qi+1}</span>
                      <p className="text-sm text-gray-600 flex-1">{q.question_text}</p>
                      <span className="text-[10px] text-blue-500 font-semibold flex-shrink-0">{q.marks}mk</span>
                    </div>
                    <div className={`ml-4 p-3 rounded-lg text-sm leading-relaxed whitespace-pre-line ${
                      answer.trim() ? 'bg-gray-50 text-gray-800 border border-gray-100' : 'bg-red-50 text-red-300 border border-red-100 italic'
                    }`}>
                      {answer.trim() || 'No answer provided'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // List
  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-gray-700">Submissions — {assessment.name} ({submissions.length})</h2>
        <div className="flex gap-1">
          {['all','submitted','scored','pass','shortlist','fail'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-lg ${filter === f ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-400 hover:text-gray-600'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Candidate</th>
              <th className="text-left px-4 py-2.5">Territory</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Result</th>
              <th className="text-left px-4 py-2.5">Submitted</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(sub => (
              <tr key={sub.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setViewing(sub.id)}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-800">{sub.full_name}</p>
                  <p className="text-xs text-gray-400">{sub.email || sub.phone}</p>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{sub.territory || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    sub.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                    sub.status === 'scored' ? 'bg-green-100 text-green-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{sub.status}</span>
                </td>
                <td className="px-4 py-2.5">
                  {sub.result ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      sub.result === 'pass' ? 'bg-green-100 text-green-700' :
                      sub.result === 'shortlist' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-600'
                    }`}>{sub.result}</span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2.5"><Eye size={14} className="text-gray-300" /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No submissions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB: UPLOAD — Bulk add questions from text or paste
   ═══════════════════════════════════════════════════════════════ */
function UploadTab({ supabase, assessment, reload }) {
  const [mode, setMode] = useState('manual') // 'manual' | 'paste'
  const [pasteText, setPasteText] = useState('')
  const [sectionTitle, setSectionTitle] = useState('')
  const [questions, setQuestions] = useState([{ text:'', marks:5 }])
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  const addRow = () => setQuestions(p => [...p, { text:'', marks:5 }])
  const removeRow = (i) => setQuestions(p => p.filter((_, idx) => idx !== i))
  const updateRow = (i, field, val) => setQuestions(p => p.map((q, idx) => idx === i ? { ...q, [field]: val } : q))

  const handleManualSave = async () => {
    if (!sectionTitle.trim() || questions.every(q => !q.text.trim())) return
    setSaving(true)
    const { data: sec } = await supabase.from('assessment_sections').insert({
      assessment_id: assessment.id,
      title: sectionTitle.trim(),
      sort_order: 999,
    }).select('id').single()

    if (sec) {
      const qs = questions.filter(q => q.text.trim()).map((q, i) => ({
        section_id: sec.id,
        question_text: q.text.trim(),
        marks: q.marks || 5,
        sort_order: i,
      }))
      const { error: qError } = await supabase.from('assessment_questions').insert(qs)
      if (qError) {
        setResult({ type:'error', msg:`Section created but questions failed: ${qError.message}` })
        await reload()
        setSaving(false)
        return
      }
    }

    setResult({ type:'success', msg:`Added section "${sectionTitle}" with ${questions.filter(q=>q.text.trim()).length} questions` })
    setSectionTitle(''); setQuestions([{ text:'', marks:5 }])
    await reload()
    setSaving(false)
  }

  // Parse pasted text: expects lines like "Q1. question text [5 marks]" grouped under section headers
  const handlePasteSave = async () => {
    if (!pasteText.trim()) return
    setSaving(true)
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean)
    let currentSection = null
    let questionsToInsert = []
    let sectionsCreated = 0

    for (const line of lines) {
      // Detect section headers (lines starting with "Section" or all-caps or ending with "(X marks)")
      const sectionMatch = line.match(/^(?:SECTION\s+[A-Z]\s*[—–-]\s*)?(.+?)(?:\s*\(\d+\s*marks?\))?$/i)
      const questionMatch = line.match(/^Q?(\d+)[.)]\s*(.+?)(?:\s*\[(\d+)\s*marks?\])?$/i)

      if (questionMatch && currentSection) {
        questionsToInsert.push({
          section_id: currentSection,
          question_text: questionMatch[2].trim(),
          marks: parseInt(questionMatch[3]) || 5,
          sort_order: questionsToInsert.filter(q => q.section_id === currentSection).length,
        })
      } else if (!questionMatch && line.length < 120 && !line.startsWith('Q')) {
        // Treat as section header
        const { data: sec } = await supabase.from('assessment_sections').insert({
          assessment_id: assessment.id,
          title: line.replace(/^\s*SECTION\s+[A-Z]\s*[—–-]\s*/i, '').replace(/\s*\(\d+\s*marks?\)\s*$/i, '').trim(),
          sort_order: sectionsCreated,
        }).select('id').single()
        if (sec) { currentSection = sec.id; sectionsCreated++ }
      }
    }

    if (questionsToInsert.length > 0) {
      const { error: qError } = await supabase.from('assessment_questions').insert(questionsToInsert)
      if (qError) {
        setResult({ type:'error', msg:`Sections created but questions failed: ${qError.message}` })
        await reload()
        setSaving(false)
        return
      }
    }

    setResult({ type:'success', msg:`Created ${sectionsCreated} sections with ${questionsToInsert.length} questions` })
    setPasteText('')
    await reload()
    setSaving(false)
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Add Questions to: {assessment.name}</h2>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('manual')} className={`px-3 py-1.5 text-sm rounded-lg ${mode === 'manual' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}>Manual Entry</button>
        <button onClick={() => setMode('paste')} className={`px-3 py-1.5 text-sm rounded-lg ${mode === 'paste' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}>Paste / Bulk Import</button>
      </div>

      {result && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${result.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.msg}
        </div>
      )}

      {mode === 'manual' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Section Title *</label>
            <input value={sectionTitle} onChange={e => setSectionTitle(e.target.value)} placeholder="e.g. Sales & Persuasion Skills"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Questions</label>
          {questions.map((q, i) => (
            <div key={i} className="flex gap-2 mb-2 items-start">
              <span className="text-xs text-gray-400 mt-2.5 w-5">{i+1}.</span>
              <textarea value={q.text} onChange={e => updateRow(i, 'text', e.target.value)} rows={2} placeholder="Question text..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={q.marks} onChange={e => updateRow(i, 'marks', +e.target.value)} className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center" />
              {questions.length > 1 && <button onClick={() => removeRow(i)} className="p-2 text-gray-300 hover:text-red-500"><X size={14} /></button>}
            </div>
          ))}
          <button onClick={addRow} className="text-xs text-blue-500 hover:text-blue-700 mb-4"><Plus size={12} className="inline" /> Add question</button>
          <div className="flex gap-2 mt-2">
            <button onClick={handleManualSave} disabled={saving || !sectionTitle.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Section
            </button>
          </div>
        </div>
      )}

      {mode === 'paste' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-3">Paste your assessment content. Use section headers on their own line and questions prefixed with Q1., Q2. etc. Mark allocation in [X marks] brackets.</p>
          <p className="text-xs text-gray-400 mb-3 bg-gray-50 p-2 rounded font-mono leading-relaxed">
            Role Understanding (15 marks)<br/>
            Q1. Explain the role of a Field Sales Agent. [3 marks]<br/>
            Q2. What motivates you to take on commission-based work? [4 marks]<br/>
            <br/>
            Sales & Persuasion Skills (25 marks)<br/>
            Q3. A garage owner says "I don't have time." How do you respond? [5 marks]
          </p>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={12} placeholder="Paste your assessment content here..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono mb-3" />
          <button onClick={handlePasteSave} disabled={saving || !pasteText.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import
          </button>
        </div>
      )}
    </div>
  )
}