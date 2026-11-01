import { useMemo, useState } from 'react'
import { Code2, Brain, Calculator, ChevronRight, Clock, BarChart3, Briefcase, Building2, Play, Award, Languages, Cog, CircuitBoard, Users, Layers, FileText, Cpu, Zap, GraduationCap, Combine } from 'lucide-react'
import { Card, Button, SelectField, Badge, Input } from '../components/ui'
import MediaCheck from '../components/MediaCheck'
import { useAuth } from '../lib/auth'
import { loadResumeAnalysis, type StoredResume } from '../lib/resumeStore'
import { buildResumeQuestions, type ResumeQuestion } from '../lib/resumeQuestions'
import {
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_DURATIONS,
  INTERVIEW_LANGUAGE,
  INTERVIEW_QUESTION_COUNTS,
  browserPreferenceStorage,
  loadInterviewPreferences,
  type InterviewTypePreference,
} from '../lib/preferences'

// Interview Setup only launches mock interviews. Coding practice is a separate
// standalone module reachable from its own navigation entry.
type Page = 'ai-interview' | 'resume'

export interface InterviewConfig {
  type: string
  typeLabel: string
  mode: string
  modeLabel: string
  difficulty: string
  experience: string
  role: string
  company: string
  language: string
  languageLabel: string
  branch?: string
  subject?: string
  /** True when the session merges technical, HR and aptitude rounds. */
  combined?: boolean
  /** Client-side session length in minutes (also used by the interview timer). */
  durationMinutes?: number
  /** Target number of questions; the server enforces this as the adaptive limit. */
  questionCount?: number
  /** Questions derived from the stored resume analysis (resume mode only). */
  resumeQuestions?: ResumeQuestion[]
}

interface InterviewSetupProps {
  onNavigate: (p: Page) => void
  onStart?: (config: InterviewConfig) => void
}

type TypeId = InterviewTypePreference

const interviewTypes: { id: TypeId; label: string; desc: string; icon: typeof Brain; color: string }[] = [
  { id: 'technical', label: 'Technical', desc: 'Branch-specific technical questions drawn from core topics.', icon: Brain, color: '#3b82f6' },
  { id: 'hr', label: 'HR / Behavioral', desc: 'Teamwork, conflict resolution, leadership and STAR examples.', icon: Users, color: '#ec4899' },
  { id: 'aptitude', label: 'Aptitude', desc: 'Numerical, logical and problem-solving reasoning.', icon: Calculator, color: '#8b5cf6' },
  { id: 'combined', label: 'Combined', desc: 'Technical, HR/Behavioral and Aptitude questions in one session.', icon: Combine, color: '#f59e0b' },
  { id: 'resume', label: 'Resume-Based', desc: 'Questions built from your latest resume analysis.', icon: FileText, color: '#10b981' },
]

interface Subject { id: string; label: string; desc: string; type: string }
interface Branch { id: string; label: string; short: string; icon: typeof Brain; color: string; subjects: Subject[] }

const branches: Branch[] = [
  {
    id: 'cse', label: 'Computer Science & Engineering', short: 'CSE', icon: Code2, color: '#3b82f6', subjects: [
      { id: 'cse-software', label: 'Software & DSA', desc: 'Data structures, algorithms and core CS fundamentals.', type: 'technical' },
      { id: 'cse-system', label: 'System Design', desc: 'Scalability, architecture and trade-off questions.', type: 'technical' },
      { id: 'cse-db', label: 'Databases & SQL', desc: 'SQL, indexing, caching and data modelling.', type: 'technical' },
    ],
  },
  {
    id: 'it', label: 'Information Technology', short: 'IT', icon: Cpu, color: '#06b6d4', subjects: [
      { id: 'it-software', label: 'Software Fundamentals', desc: 'Programming and application fundamentals.', type: 'technical' },
      { id: 'it-web', label: 'Web & Networking', desc: 'HTTP, caching and networking basics.', type: 'technical' },
    ],
  },
  {
    id: 'electrical', label: 'Electrical Engineering', short: 'Electrical', icon: Zap, color: '#f59e0b', subjects: [
      { id: 'ee-circuits', label: 'Electrical Circuits', desc: 'Circuit analysis, machines and protection.', type: 'electronics' },
      { id: 'ee-power', label: 'Power Systems', desc: 'Generation, distribution and protection coordination.', type: 'electronics' },
      { id: 'ee-control', label: 'Control Systems', desc: 'Stability, PID tuning and feedback control.', type: 'electronics' },
    ],
  },
  {
    id: 'entc', label: 'Electronics & Telecommunication', short: 'E&TC', icon: CircuitBoard, color: '#10b981', subjects: [
      { id: 'entc-digital', label: 'Digital Electronics', desc: 'Logic design, counters and timing.', type: 'electronics' },
      { id: 'entc-embedded', label: 'Embedded Systems', desc: 'Microcontrollers, interrupts and low-power design.', type: 'electronics' },
      { id: 'entc-comm', label: 'Communication Systems', desc: 'Signals, links and signal integrity.', type: 'electronics' },
    ],
  },
  {
    id: 'mechanical', label: 'Mechanical Engineering', short: 'Mechanical', icon: Cog, color: '#ec4899', subjects: [
      { id: 'mech-thermo', label: 'Thermodynamics', desc: 'Laws, cycles and engine efficiency.', type: 'mechanical' },
      { id: 'mech-design', label: 'Machine Design', desc: 'Shafts, bearings, joints and fatigue.', type: 'mechanical' },
      { id: 'mech-manufacturing', label: 'Manufacturing & Quality', desc: 'Processes, SPC and maintenance.', type: 'mechanical' },
    ],
  },
  {
    id: 'civil', label: 'Civil Engineering', short: 'Civil', icon: Building2, color: '#8b5cf6', subjects: [
      { id: 'civil-structures', label: 'Structural Analysis', desc: 'Beams, columns, slabs and RCC design.', type: 'civil' },
      { id: 'civil-geotech', label: 'Geotechnical Engineering', desc: 'Soil, foundations and retaining structures.', type: 'civil' },
      { id: 'civil-env', label: 'Environmental & Transportation', desc: 'Water, wastewater, roads and quantity estimation.', type: 'civil' },
    ],
  },
  {
    id: 'management', label: 'Management / Business', short: 'Management', icon: Briefcase, color: '#7c5cfc', subjects: [
      { id: 'mgmt-business', label: 'Business Cases', desc: 'Market sizing, business cases and analysis.', type: 'management' },
      { id: 'mgmt-operations', label: 'Operations & Prioritisation', desc: 'Process, SLA and backlog prioritisation.', type: 'management' },
      { id: 'mgmt-stakeholder', label: 'Stakeholder Communication', desc: 'Influence and alignment across teams.', type: 'management' },
    ],
  },
  {
    id: 'other', label: 'Other Engineering Branch', short: 'Other', icon: Layers, color: '#f97316', subjects: [
      { id: 'other-general', label: 'General Engineering', desc: 'Cross-discipline design, problem solving and project questions.', type: 'general' },
    ],
  },
]

const difficulties = INTERVIEW_DIFFICULTIES
const durations = INTERVIEW_DURATIONS.map(minutes => `${minutes} minutes`)
const questionCounts = INTERVIEW_QUESTION_COUNTS
const experienceLevels = ['Fresher', '0�?"2 years', '2�?"5 years', '5+ years']

const languages = [
  { code: INTERVIEW_LANGUAGE, label: 'English', native: 'English' },
]

const companies = ['Google', 'Microsoft', 'Amazon', 'Meta', 'Apple', 'Flipkart', 'Swiggy', 'Zomato', 'TCS', 'Infosys', 'Wipro', 'Cognizant', 'Accenture', 'Custom']
const roles = ['Software Engineer', 'SDE-1', 'SDE-2', 'Full Stack Developer', 'Frontend Engineer', 'Backend Engineer', 'Data Scientist', 'ML Engineer', 'DevOps Engineer', 'Product Manager']

export default function InterviewSetup({ onNavigate, onStart }: InterviewSetupProps) {
  const { user } = useAuth()
  const savedPreferences = useMemo(
    () => loadInterviewPreferences(browserPreferenceStorage(), user?.id ?? null),
    [user?.id],
  )
  const [mode, setMode] = useState<TypeId>(savedPreferences.type)
  const [branch, setBranch] = useState('cse')
  const [subject, setSubject] = useState('cse-software')
  const [customBranch, setCustomBranch] = useState('')
  const [difficulty, setDifficulty] = useState<string>(savedPreferences.difficulty)
  const [duration, setDuration] = useState(`${savedPreferences.durationMinutes} minutes`)
  const [questionCount, setQuestionCount] = useState<number>(savedPreferences.questionCount)
  const [company, setCompany] = useState('Google')
  const [role, setRole] = useState('Software Engineer')
  const [experience, setExperience] = useState('Fresher')
  const [language, setLanguage] = useState<string>(INTERVIEW_LANGUAGE)
  const [showMediaCheck, setShowMediaCheck] = useState(false)

  // Latest analysed resume (stored by the Resume Analysis page), used to build
  // resume-based questions without re-uploading the file.
  const storedResume = useMemo<StoredResume | null>(
    () => (user?.id ? loadResumeAnalysis(user.id) : null),
    [user?.id],
  )

  const isCombined = mode === 'combined'
  const isResume = mode === 'resume'
  const isTechnical = mode === 'technical' || isCombined
  const fixedMode = mode === 'hr' || mode === 'aptitude'

  const activeBranch = branches.find(b => b.id === branch) ?? branches[0]
  const activeSubject = activeBranch.subjects.find(s => s.id === subject) ?? activeBranch.subjects[0]
  const branchLabel = branch === 'other' && customBranch.trim() ? customBranch.trim() : activeBranch.label
  const durationMinutes = Number.parseInt(duration, 10) || 30

  const effectiveType =
    mode === 'hr' ? 'hr'
      : mode === 'aptitude' ? 'aptitude'
        : mode === 'resume' ? 'technical'
          : activeSubject.type
  const domainLabel =
    mode === 'technical' ? activeSubject.label
      : mode === 'combined' ? `${activeSubject.label} + HR + Aptitude`
        : mode === 'hr' ? 'HR / Behavioral'
          : mode === 'aptitude' ? 'Aptitude'
            : 'Resume-Based'
  const modeLabel = isCombined
    ? 'Combined Interview'
    : interviewTypes.find(t => t.id === mode)?.label ?? 'Technical'

  const selectMode = (id: TypeId) => {
    setMode(id)
  }

  const selectBranch = (id: string) => {
    setBranch(id)
    const nextSubjects = branches.find(b => b.id === id)?.subjects ?? []
    setSubject(nextSubjects[0]?.id ?? '')
  }

  const commit = () => {
    const resumeQuestions = isResume ? buildResumeQuestions(storedResume) : undefined
    onStart?.({
      type: effectiveType,
      typeLabel: domainLabel,
      // Combined sessions use a valid backend mode; the merged question bank is
      // selected client-side and the label records what the candidate chose.
      mode: isCombined ? 'technical' : mode,
      modeLabel,
      difficulty,
      experience,
      role,
      company,
      language,
      languageLabel: languages.find(l => l.code === language)?.label ?? 'English',
      branch: isTechnical ? branchLabel : undefined,
      subject: isTechnical ? activeSubject.label : undefined,
      combined: isCombined || undefined,
      durationMinutes,
      questionCount,
      resumeQuestions,
    })
    onNavigate('ai-interview')
  }

  // Camera/microphone interviews show a device check first. Resume-based
  // sessions run in the AI interview room too, so they get the same check.
  const start = () => {
    if (isResume && !storedResume) {
      onNavigate('resume')
      return
    }
    setShowMediaCheck(true)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Setup Interview</h1>
        <p className="text-sm text-[var(--text-secondary)]">Configure your mock interview session. Questions are drawn from the set that matches your choices.</p>
      </div>

      {/* Interview Type */}
      <Card className="p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <Layers size={13} /> Interview Type
        </p>
        <div className="grid grid-cols-2 gap-3">
          {interviewTypes.map(m => (
            <button
              key={m.id}
              onClick={() => selectMode(m.id)}
              className={`relative text-left p-4 rounded-[var(--radius-lg)] border-2 transition-all-smooth cursor-pointer ${mode === m.id ? 'border-[var(--accent-from)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent-from)]/40'}`}
            >
              {mode === m.id && <div className="absolute top-2 right-2 w-4 h-4 rounded-full gradient-bg flex items-center justify-center"><span className="text-white text-[8px] font-bold">✓</span></div>}
              <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center mb-3" style={{ background: `${m.color}18`, color: m.color }}>
                <m.icon size={18} />
              </div>
              <p className="font-bold text-sm text-[var(--text-primary)] mb-0.5">{m.label}</p>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{m.desc}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Technical: Engineering Branch */}
      {isTechnical && (
        <>
          <Card className="p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-4 flex items-center gap-2">
              <GraduationCap size={14} /> Engineering Branch
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {branches.map(b => (
                <button
                  key={b.id}
                  onClick={() => selectBranch(b.id)}
                  className={`relative text-left p-3 rounded-[var(--radius-lg)] border-2 transition-all-smooth cursor-pointer ${branch === b.id ? 'border-[var(--accent-from)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent-from)]/40'}`}
                >
                  {branch === b.id && <div className="absolute top-2 right-2 w-4 h-4 rounded-full gradient-bg flex items-center justify-center"><span className="text-white text-[8px] font-bold">✓</span></div>}
                  <div className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center mb-2" style={{ background: `${b.color}18`, color: b.color }}>
                    <b.icon size={16} />
                  </div>
                  <p className="font-bold text-sm text-[var(--text-primary)]">{b.short}</p>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">{b.label}</p>
                </button>
              ))}
            </div>
            {branch === 'other' && (
              <div className="mt-4">
                <Input
                  value={customBranch}
                  onChange={e => setCustomBranch(e.target.value)}
                  placeholder="Enter your engineering branch (e.g., Chemical, Aerospace, Mining)"
                />
              </div>
            )}
          </Card>

        </>
      )}

      {/* HR / Aptitude: common across all branches */}
      {fixedMode && (
        <Card className="p-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0 text-[var(--accent-from)]">
            {mode === 'hr' ? <Users size={18} /> : <Calculator size={18} />}
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Domain: {domainLabel}</p>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{modeLabel} is common to all engineering branches and uses the fixed {domainLabel} question set across all difficulty levels.</p>
          </div>
        </Card>
      )}

      {/* Combined: technical + HR + aptitude rounds in one session */}
      {isCombined && (
        <Card className="p-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0 text-[var(--accent-from)]">
            <Combine size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Combined Interview</p>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Mixes {activeSubject.label}, HR / Behavioral and Aptitude questions in one session, using the
              difficulty and experience you select below.
            </p>
          </div>
        </Card>
      )}

      {/* Resume-Based */}
      {isResume && (
        <Card className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0 text-[var(--accent-from)]">
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">Resume-Based Interview</p>
              {storedResume ? (
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Questions are built from your latest resume analysis
                  {storedResume.fileName ? ` (${storedResume.fileName})` : ''}: score {storedResume.analysis.overallScore}/100
                  {storedResume.jobTitle ? ` · target: ${storedResume.jobTitle}` : ''}. Nothing is re-uploaded.
                </p>
              ) : (
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  No analysed resume is stored on this device yet. Analyse your resume first, then return here to
                  start a session built from its skills and gaps.
                </p>
              )}
            </div>
          </div>
          {storedResume ? (
            storedResume.analysis.technicalSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-12">
                {storedResume.analysis.technicalSkills.slice(0, 6).map(skill => (
                  <Badge key={skill} variant="info">{skill}</Badge>
                ))}
                {storedResume.analysis.technicalSkills.length > 6 && (
                  <Badge variant="default">+{storedResume.analysis.technicalSkills.length - 6} more</Badge>
                )}
              </div>
            )
          ) : (
            <div className="pl-12">
              <Button size="sm" variant="secondary" onClick={() => onNavigate('resume')}>
                <FileText size={13} /> Open Resume Analysis
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Configuration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Briefcase size={12} /> Job Role
          </p>
          <SelectField options={roles} value={role} onChange={setRole} />
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Building2 size={12} /> Target Company
          </p>
          <SelectField options={companies} value={company} onChange={setCompany} />
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <BarChart3 size={12} /> Difficulty
          </p>
          <div className="grid grid-cols-2 gap-2">
            {difficulties.map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`py-2 rounded-[var(--radius-md)] text-xs font-bold transition-all-smooth cursor-pointer ${difficulty === d ? 'gradient-bg text-white' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Clock size={12} /> Duration
          </p>
          <div className="grid grid-cols-2 gap-2">
            {durations.map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`py-2 rounded-[var(--radius-md)] text-xs font-bold transition-all-smooth cursor-pointer ${duration === d ? 'gradient-bg text-white' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'}`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-2">
              <FileText size={12} /> Questions
            </p>
            <div className="grid grid-cols-3 gap-2">
              {questionCounts.map(count => (
                <button
                  key={count}
                  onClick={() => setQuestionCount(count)}
                  className={`py-2 rounded-[var(--radius-md)] text-xs font-bold transition-all-smooth cursor-pointer ${questionCount === count ? 'gradient-bg text-white' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'}`}
                >
                  {count}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-[var(--text-muted)] leading-relaxed">
              Questions adapt to your answers. This is the maximum for the session.
            </p>
          </div>
        </Card>
        <Card className="p-5 sm:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Award size={12} /> Experience Level
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {experienceLevels.map(e => (
              <button
                key={e}
                onClick={() => setExperience(e)}
                className={`py-2 rounded-[var(--radius-md)] text-xs font-bold transition-all-smooth cursor-pointer ${experience === e ? 'gradient-bg text-white' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-5 sm:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Languages size={12} /> Interview Language
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {languages.map(l => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLanguage(l.code)}
                aria-pressed={language === l.code}
                className={`py-2 rounded-[var(--radius-md)] transition-all-smooth cursor-pointer ${language === l.code ? 'gradient-bg text-white' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'}`}
              >
                <span className="block text-xs font-bold">{l.label}</span>
                <span className={`block text-[10px] ${language === l.code ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>{l.native}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-3">
            Interviews are conducted in English. Questions, follow-ups, evaluations and feedback are all generated in English.
          </p>
        </Card>
      </div>

      {/* Summary + Start */}
      <Card className="p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-4">Session Summary</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Mode', value: modeLabel },
            ...(isTechnical ? [{ label: 'Branch', value: branchLabel }] : []),
            { label: 'Role', value: role },
            { label: 'Company', value: company },
            { label: 'Experience', value: experience },
            { label: 'Language', value: languages.find(l => l.code === language)?.label ?? 'English' },
            { label: 'Duration', value: duration },
            { label: 'Questions', value: `${questionCount} max` },
          ].map(item => (
            <div key={item.label} className="text-center p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] mb-5">
          <Badge variant="info" className="flex-shrink-0">Tip</Badge>
          <p className="text-xs text-[var(--text-secondary)]">Ensure your microphone and webcam are enabled before starting.</p>
        </div>
        <Button className="w-full" size="lg" onClick={start}>
          <Play size={17} /> {isResume ? (storedResume ? 'Start Resume-Based Interview' : 'Analyze Resume First') : 'Start Interview Session'}
          <ChevronRight size={15} className="ml-auto" />
        </Button>
      </Card>

      {showMediaCheck && (
        <MediaCheck
          onProceed={() => { setShowMediaCheck(false); commit() }}
          onCancel={() => setShowMediaCheck(false)}
        />
      )}
    </div>
  )
}
