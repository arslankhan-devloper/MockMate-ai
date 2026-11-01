import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Mic, MicOff, Video, VideoOff, PhoneOff, ChevronLeft, ChevronRight, Clock, Volume2, Play, Square, Loader2, AlertTriangle, AlertCircle, CheckCircle2, Brain, Keyboard, RefreshCw } from 'lucide-react'
import { Button, Badge, Card } from '../components/ui'
import LiveAnalysisPanel from '../components/LiveAnalysisPanel'
import InterviewerAvatar from '../components/InterviewerAvatar'
import { type InterviewConfig } from './InterviewSetup'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import { useFaceAnalysis } from '../lib/faceAnalysis'
import { resolveStoredAnswer } from '../lib/interviewDrafts'
import {
  buildAnalysisSummary,
  cameraAnalysisEnabled,
  createAnalysisAccumulator,
  recordAnalysisSample,
  type InterviewAnalysisSummary,
} from '../lib/interviewAnalysis'
import { setReportHandoff, type InterviewReportData, type ReportTurn } from '../lib/interviewReport'
import {
  createInterviewSession,
  newClientSessionId,
  requestNextInterviewQuestion,
  saveInterviewTurn,
  updateInterviewSession,
  type QuestionDifficulty,
} from '../lib/interviews'

const DEFAULT_SESSION_MINUTES = 25
const DEFAULT_QUESTION_COUNT = 8

type Page = 'report' | 'interview-setup'

interface AIInterviewProps {
  onNavigate: (p: Page, param?: string) => void
  config: InterviewConfig
}

type Question = {
  q: string
  category: string
  source?: 'static' | 'ai'
  difficulty?: QuestionDifficulty
  topic?: string
}
type Band = 'easy' | 'medium' | 'hard'
type QuestionSet = Record<Band, Question[]>

const questionSets: Record<string, QuestionSet> = {
  technical: {
    easy: [
      { q: 'Can you explain the difference between a process and a thread?', category: 'Fundamentals' },
      { q: 'What is the time complexity of binary search, and why?', category: 'Algorithms' },
      { q: 'Describe how a hash table works and how collisions are handled.', category: 'Data Structures' },
      { q: 'What is the difference between an array and a linked list?', category: 'Data Structures' },
    ],
    medium: [
      { q: 'Explain the difference between useEffect and useLayoutEffect in React. When would you use each?', category: 'Technical' },
      { q: 'How would you optimise a slow database query in a web application?', category: 'Databases' },
      { q: 'Describe how HTTP caching works and when you would use it.', category: 'Web' },
      { q: 'What are the trade-offs between SQL and NoSQL databases?', category: 'Databases' },
    ],
    hard: [
      { q: 'Design a rate limiter for a public API and discuss its trade-offs.', category: 'System Design' },
      { q: 'How would you diagnose and fix a memory leak in a long-running Node.js service?', category: 'Debugging' },
      { q: 'Explain the CAP theorem and how you would choose consistency vs availability for a payments system.', category: 'System Design' },
      { q: 'How would you design a system to process millions of events per day with exactly-once semantics?', category: 'System Design' },
    ],
  },
  hr: {
    easy: [
      { q: 'Tell me about yourself and your background.', category: 'Introduction' },
      { q: 'Why are you interested in this role and company?', category: 'Motivation' },
      { q: 'What is one strength and one weakness you have?', category: 'Self-awareness' },
      { q: 'How do you handle working within a team?', category: 'Teamwork' },
    ],
    medium: [
      { q: 'Describe a time you disagreed with a teammate. How did you resolve it?', category: 'Conflict' },
      { q: 'Tell me about a project you are proud of and your specific contribution.', category: 'Ownership' },
      { q: 'How do you prioritise tasks when you have multiple deadlines?', category: 'Time Management' },
      { q: 'Describe a situation where you received difficult feedback.', category: 'Growth' },
    ],
    hard: [
      { q: 'Tell me about a time you failed. What did you learn and how did you change?', category: 'Resilience' },
      { q: 'Describe a situation where you had to influence stakeholders without authority.', category: 'Influence' },
      { q: 'How would you handle a high-pressure deadline with incomplete requirements?', category: 'Judgement' },
      { q: 'Tell me about a time you took a calculated risk that did not pay off.', category: 'Decision Making' },
    ],
  },
  aptitude: {
    easy: [
      { q: 'A train travels 60 km in 45 minutes. What is its average speed in km/h?', category: 'Quantitative' },
      { q: 'Find the next number in the series: 2, 6, 12, 20, 30, ___.', category: 'Logical' },
      { q: 'If a shirt costs ₹800 after a 20% discount, what was its original price?', category: 'Quantitative' },
      { q: 'Complete the analogy: Book is to Reading as Fork is to ___.', category: 'Verbal' },
    ],
    medium: [
      { q: 'Two pipes fill a tank in 12 and 18 hours. How long will they take together?', category: 'Quantitative' },
      { q: 'In a group of 60 students, 40 play cricket and 30 play football. If 10 play both, how many play neither?', category: 'Logical' },
      { q: 'A sum doubles in 8 years at simple interest. In how many years will it triple?', category: 'Quantitative' },
      { q: 'Find the odd one out: 121, 144, 169, 200, 225.', category: 'Logical' },
    ],
    hard: [
      { q: 'A bag has 5 red and 3 blue balls. Two are drawn without replacement. What is the probability both are red?', category: 'Probability' },
      { q: 'A clock shows 3:00. What is the angle between the hour and minute hands?', category: 'Quantitative' },
      { q: "The average age of 30 students is 15. When the teacher's age is included, the average rises by 1. What is the teacher's age?", category: 'Averages' },
      { q: 'A boat travels 24 km downstream in 2 hours and returns in 3 hours. What is the speed of the stream?', category: 'Quantitative' },
    ],
  },
  mechanical: {
    easy: [
      { q: 'Explain the difference between a heat engine and a heat pump.', category: 'Thermodynamics' },
      { q: 'State the first law of thermodynamics and give an engineering example.', category: 'Thermodynamics' },
      { q: 'What is the purpose of a bearing in a rotating machine?', category: 'Machine Design' },
      { q: 'Describe the difference between casting and forging.', category: 'Manufacturing' },
    ],
    medium: [
      { q: 'A Carnot engine operates between 500 K and 300 K. How would you calculate its efficiency, and why do real engines perform worse?', category: 'Thermodynamics' },
      { q: 'How would you choose between machining and additive manufacturing for a low-volume bracket?', category: 'Manufacturing' },
      { q: 'Walk through how you would size a shaft subjected to combined bending and torsion.', category: 'Machine Design' },
      { q: 'How would you set up an SPC control chart and interpret an out-of-control point?', category: 'Quality' },
    ],
    hard: [
      { q: 'What design considerations prevent preload loss in a bolted joint under fatigue loading?', category: 'Machine Design' },
      { q: 'How would you analyse the performance of a combined-cycle power plant and identify its major exergy losses?', category: 'Thermodynamics' },
      { q: 'Describe an FMEA you would run for a critical gearbox and how it prioritises maintenance actions.', category: 'Maintenance' },
      { q: 'How would you reduce cycle time and scrap in a high-volume stamping line without compromising quality?', category: 'Manufacturing' },
    ],
  },
  electronics: {
    easy: [
      { q: "State Ohm's Law and explain how it relates voltage, current and resistance.", category: 'Circuits' },
      { q: 'What is the difference between a combinational and a sequential circuit?', category: 'Digital Electronics' },
      { q: 'What is the role of GPIO pins on a microcontroller?', category: 'Embedded Systems' },
      { q: 'Explain the difference between an AC and a DC supply.', category: 'Electrical' },
    ],
    medium: [
      { q: 'How would you find the Thevenin equivalent of a two-terminal resistive network?', category: 'Circuits' },
      { q: 'Design a 4-bit synchronous counter and explain how you would verify its timing.', category: 'Digital Electronics' },
      { q: 'Explain how interrupts differ from polling and when you would use each in firmware.', category: 'Embedded Systems' },
      { q: 'Describe how a PID controller is tuned and the effect of each term.', category: 'Control Systems' },
    ],
    hard: [
      { q: 'Analyse the stability of a closed-loop system using a Bode plot and the gain and phase margins.', category: 'Control Systems' },
      { q: 'How would you design a low-power, battery-operated sensor node with reliable wireless reporting?', category: 'Embedded Systems' },
      { q: 'How would you specify protection and coordination for a three-phase industrial distribution board?', category: 'Electrical' },
      { q: 'Describe how you would design and test a high-speed serial link, including signal-integrity considerations.', category: 'Digital Electronics' },
    ],
  },
  management: {
    easy: [
      { q: 'How would you decide which of two features to build first with limited engineering capacity?', category: 'Prioritisation' },
      { q: 'Which metrics would you track to gauge the health of a customer-support operation?', category: 'Operations' },
      { q: 'How do you explain a technical trade-off to a non-technical stakeholder?', category: 'Stakeholder Communication' },
      { q: 'What key components would you include in a simple business case?', category: 'Business Case' },
    ],
    medium: [
      { q: 'Estimate the market size for a new campus-hiring product and walk through your approach.', category: 'Business Case' },
      { q: 'A process keeps missing its SLA. How would you diagnose the bottleneck and improve throughput?', category: 'Operations' },
      { q: 'How would you prioritise a backlog when sales, support and engineering all want different things?', category: 'Prioritisation' },
      { q: 'How would you align two teams with conflicting goals on a single shared roadmap?', category: 'Stakeholder Communication' },
    ],
    hard: [
      { q: 'Leadership wants a three-year plan for a product with falling margins. How would you structure the analysis?', category: 'Business Case' },
      { q: 'How would you redesign an operations workflow to cut cost by 20% without hurting quality?', category: 'Operations' },
      { q: 'You can only partly fund three strategic initiatives. How do you decide what to prioritise?', category: 'Prioritisation' },
      { q: 'How would you handle a senior stakeholder who rejects a well-supported recommendation?', category: 'Stakeholder Communication' },
    ],
  },
  coding: {
    easy: [
      { q: 'Reverse a string in place without using extra space.', category: 'Strings' },
      { q: 'Find the maximum element in an array.', category: 'Arrays' },
      { q: 'Check whether a number is a palindrome.', category: 'Math' },
      { q: 'Count the vowels in a given string.', category: 'Strings' },
    ],
    medium: [
      { q: 'Find two numbers in an array that sum to a target value.', category: 'Arrays' },
      { q: 'Determine if a string is a valid palindrome, ignoring non-alphanumeric characters.', category: 'Strings' },
      { q: 'Find the longest substring without repeating characters.', category: 'Sliding Window' },
      { q: 'Merge two sorted arrays without using extra space.', category: 'Arrays' },
    ],
    hard: [
      { q: 'Find the median of two sorted arrays in O(log(min(n, m))).', category: 'Binary Search' },
      { q: 'Solve the trapping rain water problem and explain your approach.', category: 'Two Pointers' },
      { q: 'Find the longest increasing subsequence in O(n log n).', category: 'Dynamic Programming' },
      { q: 'Design an LRU cache with O(1) get and put operations.', category: 'Design' },
    ],
  },
  civil: {
    easy: [
      { q: 'What is the difference between a beam and a column in structural design?', category: 'Structures' },
      { q: 'What does the slump test measure in concrete?', category: 'Concrete' },
      { q: 'What is the difference between a one-way and a two-way slab?', category: 'Structures' },
      { q: 'Why is soil compaction important before construction?', category: 'Geotechnical' },
    ],
    medium: [
      { q: 'How would you design a simply supported RCC beam for a given span and load?', category: 'Structures' },
      { q: 'Explain how you would determine the bearing capacity of soil for a shallow foundation.', category: 'Geotechnical' },
      { q: 'How would you select a concrete mix design for a coastal structure exposed to chlorides?', category: 'Concrete' },
      { q: 'Describe how you would carry out a quantity estimate for a small residential building.', category: 'Estimation' },
    ],
    hard: [
      { q: 'How would you analyse a multi-storey frame for seismic loads using the response spectrum method?', category: 'Structures' },
      { q: 'Describe the design of a retaining wall and how you would check stability against overturning and sliding.', category: 'Geotechnical' },
      { q: 'How would you plan a project schedule using CPM and identify the critical path?', category: 'Project Management' },
      { q: 'How would you evaluate the environmental impact and treatment plan for construction wastewater?', category: 'Environmental' },
    ],
  },
  general: {
    easy: [
      { q: 'What are the key steps of the engineering design process?', category: 'Design' },
      { q: 'Explain the difference between accuracy and precision with an example.', category: 'Measurements' },
      { q: 'Why are units and dimensional consistency important in engineering calculations?', category: 'Fundamentals' },
      { q: 'What is the role of standards and codes in engineering practice?', category: 'Fundamentals' },
    ],
    medium: [
      { q: 'How would you approach a root-cause analysis for a process that keeps failing quality checks?', category: 'Problem Solving' },
      { q: 'Describe how you would evaluate two design alternatives using a trade-off analysis.', category: 'Design' },
      { q: 'How would you plan and manage risks for a small engineering project?', category: 'Project Management' },
      { q: 'Explain how sustainability considerations can be built into an engineering design decision.', category: 'Sustainability' },
    ],
    hard: [
      { q: 'Describe a systematic approach to optimise a design for cost, safety and performance simultaneously.', category: 'Design' },
      { q: 'How would you lead a multidisciplinary team to deliver a project under tight constraints?', category: 'Project Management' },
      { q: 'How would you validate a new design against applicable safety and reliability requirements?', category: 'Reliability' },
      { q: 'Explain how you would justify a major engineering decision to non-technical stakeholders.', category: 'Communication' },
    ],
  },
}

function getQuestionSet(typeKey: string): { set: QuestionSet } {
  return { set: questionSets[typeKey] ?? questionSets.technical }
}

const genericFallbackQuestions: Question[] = [
  { q: 'Walk me through how you would break down a problem you have not seen before.', category: 'Problem Solving' },
  { q: 'Describe a project you are proud of and explain the most important trade-off you made.', category: 'Project' },
  { q: 'How do you check that your work is correct before you call it finished?', category: 'Quality' },
  { q: 'Tell me about a time you had to learn something quickly to finish a task.', category: 'Learning' },
  { q: 'How would you explain a complex decision to someone without your technical background?', category: 'Communication' },
  { q: 'Describe a mistake you made and what you changed afterwards.', category: 'Growth' },
  { q: 'How do you prioritise when several important tasks compete for your time?', category: 'Prioritisation' },
  { q: 'What would you do if you disagreed with a teammate about the right approach?', category: 'Teamwork' },
  { q: 'How do you decide when a solution is good enough to ship?', category: 'Judgement' },
  { q: 'Describe how you would investigate a result that looks unexpectedly wrong.', category: 'Debugging' },
  { q: 'What do you do when the requirements for a task are unclear or changing?', category: 'Adaptability' },
  { q: 'Which part of your work do you find hardest to explain to an interviewer, and why?', category: 'Reflection' },
]

function questionIdentity(question: Question): string {
  return question.q.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Build a bounded, duplicate-free pool. The first entries are the questions the
// existing setup already selected; extras keep navigation working if adaptive
// generation is unavailable.
function buildQuestionPool(
  primary: Question[],
  extras: Question[],
  count: number,
): Question[] {
  const out: Question[] = []
  const seen = new Set<string>()
  const add = (question: Question) => {
    const id = questionIdentity(question)
    if (!id || seen.has(id) || out.length >= count) return
    seen.add(id)
    out.push(question.source ? question : { ...question, source: 'static' })
  }
  primary.forEach(add)
  extras.forEach(add)
  genericFallbackQuestions.forEach(add)
  return out
}

function bandFromDifficulty(difficulty: string): Band {
  const value = difficulty.trim().toLowerCase()
  return value === 'easy' || value === 'hard' ? value : 'medium'
}

function selectQuestions(set: QuestionSet, difficulty: string, experience: string): Question[] {
  if (difficulty === 'Mixed') {
    const junior = experience === 'Fresher' || experience === '0-2 years'
    const order: Band[] = junior
      ? ['easy', 'easy', 'medium', 'medium', 'hard']
      : ['medium', 'hard', 'medium', 'hard', 'easy']
    const idx: Record<Band, number> = { easy: 0, medium: 0, hard: 0 }
    const picks: Question[] = []
    for (const b of order) {
      const pool = set[b]
      if (pool.length === 0) continue
      picks.push(pool[idx[b] % pool.length])
      idx[b] += 1
    }
    return picks
  }
  return set[bandFromDifficulty(difficulty)]
}

type MediaStatus = 'requesting' | 'ready' | 'error' | 'unsupported'
type AnswerMode = 'speak' | 'type'

interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionErrorLike { error?: string }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

const SPEECH_LOCALE = 'en-IN'

function classifyMediaError(err: unknown): string {
  const name = (err as DOMException)?.name
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera/microphone permission was denied. Allow access in your browser (site permissions) and retry.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera or microphone was found on this device.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your camera or microphone is already in use by another application.'
    case 'OverconstrainedError':
      return 'The requested camera/microphone settings are not supported on this device.'
    default:
      return 'Could not access your camera or microphone. Please retry.'
  }
}

// Splits long questions into utterance-sized chunks at sentence boundaries.
// Chunks join back (with single spaces) to the cleaned input, so no text is lost or repeated.
function splitForSpeech(text: string, maxLen = 200): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxLen) return [clean]
  const parts = clean.match(/[^.!?।]+[.!?।]*/g) ?? [clean]
  const chunks: string[] = []
  let buf = ''
  for (const part of parts) {
    const piece = part.trim()
    if (!piece) continue
    if (buf && (buf + ' ' + piece).length > maxLen) { chunks.push(buf); buf = piece }
    else buf = buf ? `${buf} ${piece}` : piece
  }
  if (buf) chunks.push(buf)
  return chunks
}

// Browser voices only exist for the languages the device has installed, so voice selection is
// best-effort: prefer a locale match, then a same-language match, then any available voice.
type SpokenLang = 'en'

const voicePreferences: Record<SpokenLang, string[]> = {
  en: ['en-in', 'en-gb', 'en-us', 'en'],
}

function scoreVoice(voice: SpeechSynthesisVoice, prefs: string[]): number {
  const lang = voice.lang.toLowerCase().replace('_', '-')
  for (let i = 0; i < prefs.length; i++) if (lang === prefs[i]) return 1000 - i
  const primary = lang.split('-')[0]
  for (let i = 0; i < prefs.length; i++) if (primary === prefs[i].split('-')[0]) return 100 - i
  return -1
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: SpokenLang): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -1
  for (const voice of voices) {
    const score = scoreVoice(voice, voicePreferences[lang])
    if (score > bestScore) { bestScore = score; best = voice }
  }
  if (!best && voices.length > 0) return voices.find(v => v.default) ?? voices[0]
  return best
}

// A queued question/answer turn held in memory until the backend confirms it.
interface TurnSnapshot {
  questionText: string
  questionKey: string
  answerText: string
  spokenSeconds: number
}

// Map the setup configuration to the create-session payload. Undefined optional
// fields are omitted by JSON serialisation; the backend re-validates everything.
function buildSessionInput(config: InterviewConfig, clientSessionId?: string) {
  return {
    interviewType: config.type,
    mode: config.mode,
    difficulty: config.difficulty,
    experience: config.experience,
    role: config.role,
    company: config.company,
    language: 'en',
    typeLabel: config.typeLabel,
    modeLabel: config.modeLabel,
    languageLabel: 'English',
    branch: config.branch,
    subject: config.subject,
    questionCount: config.questionCount,
    clientSessionId,
  }
}

// A message that never implies an unsaved answer was saved.
function describePersistenceError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session expired, so progress could not be saved. Sign in again and retry.'
    if (err.status === 404) return 'This interview session could not be found, so progress is not being saved.'
    if (err.status === 0) return 'Could not reach the server. Your answers are held on this screen — retry to save them.'
    return `Progress could not be saved: ${err.message}`
  }
  return 'Progress could not be saved. Your answers are held on this screen — retry to save them.'
}

function describeAdaptiveError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session expired. The prepared next question will be used.'
    if (err.status === 404) return 'This answer was not found on the server. The prepared next question will be used.'
    if (err.status === 0) return 'Could not reach the server. The prepared next question will be used.'
    return `${err.message} The prepared next question will be used.`
  }
  return 'The adaptive next question could not be prepared. The prepared next question will be used.'
}

export default function AIInterview({ onNavigate, config }: AIInterviewProps) {
  const [timeLeft, setTimeLeft] = useState(() => (config.durationMinutes ?? DEFAULT_SESSION_MINUTES) * 60)
  const [qIndex, setQIndex] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [showEnd, setShowEnd] = useState(false)
  const [answer, setAnswer] = useState('')
  const [mode, setMode] = useState<AnswerMode>('speak')

  const [mediaStatus, setMediaStatus] = useState<MediaStatus>('requesting')
  const [mediaError, setMediaError] = useState('')
  const [camOn, setCamOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [hasVideo, setHasVideo] = useState(false)
  const [hasAudio, setHasAudio] = useState(false)
  const [micLevel, setMicLevel] = useState(0)

  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [speechError, setSpeechError] = useState('')
  const [srSupported] = useState(() => getSpeechRecognitionCtor() !== null)

  const [spokenText, setSpokenText] = useState('')
  const [speakingSeconds, setSpeakingSeconds] = useState(0)
  const [recentAudio, setRecentAudio] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const meterRef = useRef<number | null>(null)
  const recogRef = useRef<SpeechRecognitionLike | null>(null)
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)
  const lastAudioAtRef = useRef(0)
  const lastSpeechAtRef = useRef(0)
  const speakSessionRef = useRef(0)
  const speakWatchdogRef = useRef<number | null>(null)
  const speakingRef = useRef(false)
  const listenIntentRef = useRef(false)
  const restartTimerRef = useRef<number | null>(null)
  const listenAttemptsRef = useRef(0)
  const justRestartedRef = useRef(false)
  const lastFinalRef = useRef('')
  const scheduleRestartRef = useRef<(delay?: number) => void>(() => {})

  // Optional consent chosen in Setup. Declining only disables that analysis
  // section; the interview, camera and microphone behave exactly as before.
  const analysisConsent = config.analysisConsent ?? null

  // On-device face analysis (MediaPipe FaceLandmarker). Runs only while the
  // camera feed is live AND the candidate consented in Setup; nothing is
  // recorded or transmitted.
  const faceAnalysis = useFaceAnalysis(
    videoRef,
    cameraAnalysisEnabled(analysisConsent, camOn && hasVideo && mediaStatus === 'ready'),
  )
  const analysisRef = useRef(createAnalysisAccumulator())

  useEffect(() => {
    if (cameraAnalysisEnabled(analysisConsent, camOn && hasVideo && mediaStatus === 'ready')) {
      analysisRef.current.cameraUsed = true
    }
  }, [analysisConsent, camOn, hasVideo, mediaStatus])

  useEffect(() => {
    if (micOn) analysisRef.current.microphoneUsed = true
  }, [micOn])

  useEffect(() => {
    recordAnalysisSample(analysisRef.current, faceAnalysis)
  }, [faceAnalysis])

  // ── Persistence lifecycle ──────────────────────────────────────
  // `sessionState` tracks creation of the backend session. `sessionError` and
  // `saveError` surface failures to the user; nothing here ever claims an answer
  // was saved when the request failed. Unsaved turns are held in memory only —
  // no localStorage.
  const { session: authSession } = useAuth()
  const accessToken = authSession?.access_token ?? null

  const [sessionState, setSessionState] = useState<'idle' | 'creating' | 'ready' | 'error'>('idle')
  const [sessionError, setSessionError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [adaptiveNotice, setAdaptiveNotice] = useState('')
  const [savedTick, setSavedTick] = useState(0)

  const clientIdRef = useRef<string | null>(null)
  const clientKeyRef = useRef('')
  const createdKeyRef = useRef('')
  const sessionIdRef = useRef<string | null>(null)
  const pendingRef = useRef<Map<number, TurnSnapshot>>(new Map())
  const savedAnswersRef = useRef<Map<number, string>>(new Map())
  const answeredIndexesRef = useRef<Set<number>>(new Set())
  const drainRef = useRef<Promise<void> | null>(null)
  const finishingRef = useRef(false)
  const advancingRef = useRef(false)
  const startedAtRef = useRef<string | null>(null)

  const baseQuestionSet = useMemo(
    () => getQuestionSet(config.type),
    [config.type],
  )

  // Combined sessions merge the technical, HR and aptitude rounds. All three
  // banks are English, so one session never mixes languages.
  const combined = useMemo(() => {
    if (!config.combined) return null
    const technicalSet = getQuestionSet(config.type).set
    const hrSet = getQuestionSet('hr').set
    const aptitudeSet = getQuestionSet('aptitude').set
    const pick = (set: QuestionSet) =>
      selectQuestions(set, config.difficulty, config.experience).slice(0, 3)
    const technical = pick(technicalSet)
    const hr = pick(hrSet)
    const aptitude = pick(aptitudeSet)
    const merged: Question[] = []
    for (let i = 0; i < 3; i += 1) {
      if (technical[i]) merged.push(technical[i])
      if (hr[i]) merged.push(hr[i])
      if (aptitude[i]) merged.push(aptitude[i])
    }
    const all = [
      ...Object.values(technicalSet).flat(),
      ...Object.values(hrSet).flat(),
      ...Object.values(aptitudeSet).flat(),
    ]
    return { questions: merged, all }
  }, [config.combined, config.type, config.difficulty, config.experience])

  // Resume-based sessions use the prompts derived from the stored analysis.
  const resumeQuestions = useMemo<Question[] | null>(
    () =>
      config.mode === 'resume' && config.resumeQuestions && config.resumeQuestions.length > 0
        ? config.resumeQuestions.map(item => ({ q: item.q, category: item.category }))
        : null,
    [config.mode, config.resumeQuestions],
  )

  const selectedQuestions = useMemo(() => {
    if (resumeQuestions) return resumeQuestions
    if (combined) return combined.questions
    return selectQuestions(baseQuestionSet.set, config.difficulty, config.experience)
  }, [resumeQuestions, combined, baseQuestionSet.set, config.difficulty, config.experience])

  const availableQuestions = useMemo(() => {
    if (resumeQuestions) return resumeQuestions
    if (combined) return combined.all
    return Object.values(baseQuestionSet.set).flat()
  }, [resumeQuestions, combined, baseQuestionSet.set])

  const requestedQuestionCount =
    typeof config.questionCount === 'number' &&
    Number.isInteger(config.questionCount) &&
    config.questionCount >= 3 &&
    config.questionCount <= 12
      ? config.questionCount
      : DEFAULT_QUESTION_COUNT

  // The first question is always the prepared question; later questions are
  // replaced by the server's adaptive question as each answer is submitted.
  const fallbackQuestions = useMemo(
    () => buildQuestionPool(selectedQuestions, availableQuestions, requestedQuestionCount),
    [selectedQuestions, availableQuestions, requestedQuestionCount],
  )
  const [questions, setQuestions] = useState<Question[]>(fallbackQuestions)

  const total = questions.length
  const current = questions[Math.min(qIndex, total - 1)]
  const isLast = qIndex >= total - 1
  const progress = (Math.min(qIndex + 1, total) / total) * 100
  const currentAnswerSaved = useMemo(() => {
    const saved = savedAnswersRef.current.get(qIndex)
    return Boolean(saved?.trim() && saved.trim() === answer.trim())
  }, [qIndex, answer, savedTick])
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const secs = String(timeLeft % 60).padStart(2, '0')
  const lowTime = timeLeft <= 60

  // English is the only supported language for speech playback and recognition.
  const speechLocale = SPEECH_LOCALE
  const spokenLang: SpokenLang = 'en'
  const recognitionLocale = SPEECH_LOCALE

  const selectedVoice = useMemo(() => pickVoice(voices, spokenLang), [voices, spokenLang])

  const voiceNotice = useMemo(() => {
    if (!ttsSupported) return ''
    if (voices.length === 0) return 'Loading available voices…'
    if (!selectedVoice) return 'No speech voice is available on this device.'
    const lang = selectedVoice.lang.toLowerCase()
    if (!lang.startsWith('en')) {
      return 'No English voice is installed on this device — using the closest available voice.'
    }
    return ''
  }, [voices, selectedVoice])

  const spokenWords = useMemo(
    () => (spokenText.trim() ? spokenText.trim().split(/\s+/).length : 0),
    [spokenText],
  )

  // Stable identity for the configured session, so exactly one session is created
  // per configuration — re-renders or a token refresh never start a second one.
  const sessionKey = useMemo(
    () =>
      [
        config.type,
        config.mode,
        config.difficulty,
        config.experience,
        'en',
        config.role,
        config.company,
        config.combined ? 'combined' : 'single',
        config.questionCount ?? 'default',
      ].join('|'),
    [
      config.type,
      config.mode,
      config.difficulty,
      config.experience,
      config.role,
      config.company,
      config.combined,
      config.questionCount,
    ],
  )

  // Drain queued turns to the backend. Turns are keyed by question index and the
  // API upserts on (session_id, question_index), so re-sending one can never
  // create a duplicate. On failure the queue stays in memory for a safe retry.
  const drainPending = useCallback((): Promise<void> => {
    if (drainRef.current) return drainRef.current
    const run = async () => {
      const token = accessToken
      const sid = sessionIdRef.current
      if (!token || !sid) return
      let savedAny = false
      while (pendingRef.current.size > 0) {
        const entry = pendingRef.current.entries().next().value as [number, TurnSnapshot] | undefined
        if (!entry) break
        const [index, snap] = entry
        try {
          await saveInterviewTurn(token, sid, index, {
            questionText: snap.questionText,
            questionKey: snap.questionKey,
            answerText: snap.answerText,
            spokenSeconds: snap.spokenSeconds,
          })
          pendingRef.current.delete(index)
          savedAnswersRef.current.set(index, snap.answerText)
          savedAny = true
        } catch (err) {
          if (mountedRef.current) setSaveError(describePersistenceError(err))
          return
        }
      }
      if (mountedRef.current) {
        if (savedAny) setSavedTick(t => t + 1)
        setSaveError('')
      }
    }
    const promise = run().finally(() => { drainRef.current = null })
    drainRef.current = promise
    return promise
  }, [accessToken])

  // Queue the current question/answer for persistence. An empty answer never
  // overwrites a previously saved non-empty one (e.g. navigating back and forth).
  const persistTurn = useCallback(
    (index: number, answerText: string, seconds: number) => {
      const saved = savedAnswersRef.current.get(index)
      if (!answerText.trim() && saved && saved.trim()) return
      pendingRef.current.set(index, {
        questionText: questions[index]?.q ?? '',
        questionKey: config.type,
        answerText,
        spokenSeconds: Math.max(0, Math.round(seconds)),
      })
      void drainPending()
    },
    [questions, config.type, drainPending],
  )

  // Restore the answer text and transcript for a question from the in-memory
  // turn store. Navigating back and forth must never silently discard an answer
  // that is queued for saving or already confirmed by the backend.
  const restoreStoredAnswer = useCallback((index: number) => {
    const restored = resolveStoredAnswer(index, pendingRef.current, savedAnswersRef.current)
    setAnswer(restored.text)
    setSpokenText(restored.text)
    setSpeakingSeconds(restored.spokenSeconds)
    setInterim('')
    setSpeechError('')
    lastFinalRef.current = ''
    justRestartedRef.current = false
  }, [])

  const applyNextQuestion = useCallback((index: number, next: Question) => {
    setQuestions(prev => {
      const updated = prev.slice()
      if (index >= updated.length) updated.push(next)
      else updated[index] = next
      return updated
    })
  }, [])

  // Ask the backend to evaluate the saved answer and propose the next question.
  // The prepared question remains on screen/state as the fallback, so a provider
  // or network failure never blocks the candidate from continuing.
  const requestAdaptiveQuestion = useCallback(
    async (index: number): Promise<Question | null> => {
      const token = accessToken
      const sid = sessionIdRef.current
      if (!token || !sid) return null

      await drainPending()
      if (pendingRef.current.has(index)) return null

      try {
        const result = await requestNextInterviewQuestion(token, sid, index)
        if (result.nextQuestion) {
          setAdaptiveNotice('')
          return {
            q: result.nextQuestion.questionText,
            category: result.nextQuestion.category,
            source: 'ai',
            difficulty: result.nextQuestion.difficulty ?? undefined,
            topic: result.nextQuestion.topic ?? undefined,
          }
        }
        if (result.generation.status === 'unavailable') {
          setAdaptiveNotice(
            result.generation.note || 'Adaptive generation was unavailable. Using the prepared next question.',
          )
        }
        return null
      } catch (err) {
        setAdaptiveNotice(describeAdaptiveError(err))
        return null
      }
    },
    [accessToken, drainPending],
  )

  const advanceToNextQuestion = useCallback(
    async (index: number, nextIndex: number) => {
      if (advancingRef.current) return
      advancingRef.current = true
      setAdvancing(true)
      setAdaptiveNotice('')
      try {
        const generated = await requestAdaptiveQuestion(index)
        if (generated) applyNextQuestion(nextIndex, generated)
        setQIndex(nextIndex)
        restoreStoredAnswer(nextIndex)
      } finally {
        advancingRef.current = false
        setAdvancing(false)
      }
    },
    [applyNextQuestion, requestAdaptiveQuestion, restoreStoredAnswer],
  )

  // Create the persistent session for this configuration. `newClientSessionId()`
  // makes create idempotent, so a repeated invocation returns the original row
  // rather than starting a duplicate session.
  const createSession = useCallback(async () => {
    if (!accessToken) return
    if (clientKeyRef.current !== sessionKey) {
      clientKeyRef.current = sessionKey
      clientIdRef.current = newClientSessionId() ?? null
      pendingRef.current.clear()
      savedAnswersRef.current.clear()
      answeredIndexesRef.current.clear()
      setAnswered(0)
      setSavedTick(t => t + 1)
    }
    setSessionState('creating')
    setSessionError('')
    try {
      const created = await createInterviewSession(
        accessToken,
        buildSessionInput(config, clientIdRef.current ?? undefined),
      )
      if (!mountedRef.current) return
      createdKeyRef.current = sessionKey
      sessionIdRef.current = created.id
      startedAtRef.current = created.startedAt ?? null
      setSessionState('ready')
      void drainPending()
    } catch (err) {
      if (!mountedRef.current) return
      setSessionState('error')
      setSessionError(describePersistenceError(err))
    }
  }, [accessToken, sessionKey, config, drainPending])

  // Retry whichever step failed: recreate the session, or flush queued turns.
  const retryPersistence = useCallback(() => {
    if (sessionState === 'error' || !sessionIdRef.current) {
      void createSession()
      return
    }
    setSaveError('')
    void drainPending()
  }, [sessionState, createSession, drainPending])

  const cleanupMedia = useCallback(() => {
    if (meterRef.current !== null) { clearInterval(meterRef.current); meterRef.current = null }
    if (analyserRef.current) { try { analyserRef.current.disconnect() } catch { /* ignore */ } analyserRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setMicLevel(0)
    setHasVideo(false)
    setHasAudio(false)
  }, [])

  const startMeter = useCallback((stream: MediaStream) => {
    if (stream.getAudioTracks().length === 0) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    audioCtxRef.current = ctx
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    analyserRef.current = analyser
    const data = new Uint8Array(analyser.fftSize)
    meterRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v }
      const rms = Math.sqrt(sum / data.length)
      setMicLevel(Math.min(100, Math.round(rms * 220)))
    }, 100)
  }, [])

  const applyStream = useCallback((stream: MediaStream) => {
    streamRef.current = stream
    const videoTrack = stream.getVideoTracks()[0]
    const audioTrack = stream.getAudioTracks()[0]
    setHasVideo(!!videoTrack)
    setHasAudio(!!audioTrack)
    setCamOn(!!videoTrack && videoTrack.enabled)
    setMicOn(!!audioTrack && audioTrack.enabled)
    if (videoTrack && videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
    startMeter(stream)
    setMediaStatus('ready')
  }, [startMeter])

  const requestMedia = useCallback(async () => {
    const id = ++requestIdRef.current
    cleanupMedia()
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaStatus('unsupported')
      setMediaError('This browser or context does not support camera/microphone access. A secure (https or localhost) page is required.')
      return
    }
    setMediaStatus('requesting')
    setMediaError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      if (id !== requestIdRef.current || !mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      applyStream(stream)
    } catch (err) {
      let cam: MediaStream | null = null
      let mic: MediaStream | null = null
      try { cam = await navigator.mediaDevices.getUserMedia({ video: true }) } catch { cam = null }
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { mic = null }
      if (id !== requestIdRef.current || !mountedRef.current) {
        cam?.getTracks().forEach(t => t.stop())
        mic?.getTracks().forEach(t => t.stop())
        return
      }
      const tracks = [...(cam?.getVideoTracks() ?? []), ...(mic?.getAudioTracks() ?? [])]
      if (tracks.length > 0) {
        applyStream(new MediaStream(tracks))
        setMediaError('Only some devices were available. Voice features may be limited.')
      } else {
        setMediaStatus('error')
        setMediaError(classifyMediaError(err))
      }
    }
  }, [cleanupMedia, applyStream])

  useEffect(() => {
    mountedRef.current = true
    requestMedia()
    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
      cleanupMedia()
      listenIntentRef.current = false
      if (restartTimerRef.current !== null) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
      if (speakWatchdogRef.current !== null) { clearTimeout(speakWatchdogRef.current); speakWatchdogRef.current = null }
      speakSessionRef.current += 1
      try { recogRef.current?.abort() } catch { /* ignore */ }
      recogRef.current = null
      if (ttsSupported) window.speechSynthesis.cancel()
    }
  }, [requestMedia, cleanupMedia])

  // Start the persistent session once for this configuration. Unmounting or a
  // refresh never abandons it — only an explicit End updates its final status.
  useEffect(() => {
    if (!accessToken) return
    if (createdKeyRef.current === sessionKey) return
    void createSession()
  }, [accessToken, sessionKey, createSession])

  const toggleCam = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCamOn(track.enabled)
  }, [])

  const toggleMic = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMicOn(track.enabled)
    if (!track.enabled) {
      listenIntentRef.current = false
      if (restartTimerRef.current !== null) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
      const rec = recogRef.current
      recogRef.current = null
      try { rec?.abort() } catch { /* ignore */ }
      setListening(false)
      setInterim('')
    }
  }, [])

  const clearWatchdog = useCallback(() => {
    if (speakWatchdogRef.current !== null) { clearTimeout(speakWatchdogRef.current); speakWatchdogRef.current = null }
  }, [])

  const stopSpeaking = useCallback(() => {
    speakSessionRef.current += 1
    clearWatchdog()
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
    setSpeaking(false)
  }, [clearWatchdog])

  const speak = useCallback((text: string) => {
    if (!ttsSupported) return
    const synth = window.speechSynthesis
    const chunks = splitForSpeech(text)
    if (chunks.length === 0) return
    try {
      synth.cancel()
      const session = ++speakSessionRef.current
      const speakChunk = (index: number) => {
        if (session !== speakSessionRef.current) return
        const chunk = chunks[index]
        const u = new SpeechSynthesisUtterance(chunk)
        u.lang = speechLocale
        if (selectedVoice) u.voice = selectedVoice
        u.rate = 0.95
        u.pitch = 1
        const arm = (ms: number) => {
          clearWatchdog()
          speakWatchdogRef.current = window.setTimeout(() => {
            if (session === speakSessionRef.current) setSpeaking(false)
          }, ms)
        }
        const advance = () => {
          if (session !== speakSessionRef.current) return
          if (index + 1 < chunks.length) speakChunk(index + 1)
          else { clearWatchdog(); setSpeaking(false) }
        }
        // Once playback actually starts, allow time proportional to the chunk length;
        // if it never starts (e.g. blocked audio), stop reporting playback after a short grace period.
        u.onstart = () => { if (session === speakSessionRef.current) arm(2000 + chunk.length * 130) }
        u.onend = advance
        u.onerror = advance
        arm(4000)
        synth.speak(u)
      }
      setSpeaking(true)
      if (synth.paused) synth.resume()
      speakChunk(0)
    } catch {
      setSpeaking(false)
    }
  }, [selectedVoice, speechLocale, clearWatchdog])

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    if (recogRef.current) { try { recogRef.current.abort() } catch { /* ignore */ } recogRef.current = null }
    const rec = new Ctor()
    rec.lang = recognitionLocale
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onstart = () => { listenAttemptsRef.current = 0; setListening(true); setSpeechError('') }
    rec.onresult = (e) => {
      let finalText = ''
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const txt = res[0]?.transcript ?? ''
        if (res.isFinal) finalText += txt
        else interimText += txt
      }
      if (finalText.trim() || interimText.trim()) lastSpeechAtRef.current = Date.now()
      const clean = finalText.trim()
      if (clean) {
        // Ignore the same sentence being re-emitted by a restart of the recognition service.
        const boundaryRepeat = justRestartedRef.current && clean === lastFinalRef.current
        justRestartedRef.current = false
        if (!boundaryRepeat) {
          lastFinalRef.current = clean
          setAnswer(a => (a ? `${a} ` : '') + clean)
          setSpokenText(t => (t ? `${t} ` : '') + clean)
        }
      }
      setInterim(interimText)
    }
    rec.onerror = (e) => {
      const code = e.error ?? ''
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        listenIntentRef.current = false
        setSpeechError('Microphone permission for speech recognition was denied. Allow access in your browser and try again.')
      } else if (code === 'audio-capture') {
        listenIntentRef.current = false
        setSpeechError('No microphone was found for speech recognition.')
      } else if (code === 'network') {
        setSpeechError('Speech service connection issue. Reconnecting…')
      } else if (code === 'no-speech') {
        setSpeechError('')
      } else if (code !== 'aborted') {
        setSpeechError('Speech recognition error. You can type your answer instead.')
      }
      if (code !== 'no-speech' && code !== 'network') setListening(false)
    }
    rec.onend = () => {
      if (recogRef.current === rec) recogRef.current = null
      setListening(false)
      setInterim('')
      // Continuous browsers end after a pause; restart cleanly while the user still wants to listen and the AI is silent.
      if (listenIntentRef.current && !speakingRef.current) scheduleRestartRef.current()
    }
    recogRef.current = rec
    justRestartedRef.current = true
    try { rec.start() } catch { setSpeechError('Could not start speech recognition. You can type your answer instead.') }
  }, [recognitionLocale])

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    listenIntentRef.current = true
    listenAttemptsRef.current = 0
    lastSpeechAtRef.current = 0
    lastAudioAtRef.current = 0
    if (restartTimerRef.current !== null) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
    setSpeechError('')
    startRecognition()
  }, [startRecognition])

  const stopListening = useCallback(() => {
    listenIntentRef.current = false
    if (restartTimerRef.current !== null) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
    const rec = recogRef.current
    recogRef.current = null
    try { rec?.abort() } catch { /* ignore */ }
    setListening(false)
    setInterim('')
  }, [])

  const scheduleRestart = useCallback((delay?: number) => {
    if (restartTimerRef.current !== null) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
    if (!listenIntentRef.current) return
    if (listenAttemptsRef.current >= 6) {
      listenIntentRef.current = false
      setSpeechError('Speech recognition kept stopping. Tap Speak Answer to resume.')
      return
    }
    const wait = delay ?? (listenAttemptsRef.current === 0 ? 250 : Math.min(1000 * listenAttemptsRef.current, 4000))
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null
      if (!listenIntentRef.current || speakingRef.current) return
      listenAttemptsRef.current += 1
      startRecognition()
    }, wait)
  }, [startRecognition])

  useEffect(() => { scheduleRestartRef.current = scheduleRestart }, [scheduleRestart])

  const toggleRecording = useCallback(() => {
    if (listenIntentRef.current || listening) {
      stopListening()
      persistTurn(qIndex, answer, speakingSeconds)
    } else {
      startListening()
    }
  }, [listening, stopListening, startListening, persistTurn, qIndex, answer, speakingSeconds])

  const chooseMode = useCallback((m: AnswerMode) => {
    if (m === 'type') stopListening()
    setMode(m)
  }, [stopListening])

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  // Warn before a refresh/close would discard a response that has not been
  // submitted yet. A queued turn is already handled by the persistence layer.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const saved = savedAnswersRef.current.get(qIndex)
      const hasUnsavedDraft = Boolean(answer.trim()) && saved?.trim() !== answer.trim()
      const hasPendingAnswer = [...pendingRef.current.values()].some(turn => turn.answerText.trim().length > 0)
      if (!hasUnsavedDraft && !hasPendingAnswer && !interim.trim()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [answer, interim, qIndex])

  useEffect(() => {
    if (micOn && micLevel > 5) {
      lastAudioAtRef.current = Date.now()
      setRecentAudio(true)
      return
    }
    if (!recentAudio) return
    const id = window.setInterval(() => {
      if (Date.now() - lastAudioAtRef.current > 2500) setRecentAudio(false)
    }, 1000)
    return () => clearInterval(id)
  }, [micLevel, micOn, recentAudio])

  useEffect(() => {
    if (!listening) return
    const id = window.setInterval(() => {
      const audioActive = micOn && Date.now() - lastAudioAtRef.current < 1200
      const speechActive = Date.now() - lastSpeechAtRef.current < 1500
      if (audioActive || speechActive) setSpeakingSeconds(s => s + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [listening, micOn])

  useEffect(() => {
    if (!ttsSupported) return
    const synth = window.speechSynthesis
    const load = () => setVoices(synth.getVoices())
    load()
    synth.onvoiceschanged = load
    return () => { synth.onvoiceschanged = null }
  }, [])

  // Keep recognition and AI speech from overlapping: pause listening while the AI talks,
  // then resume it once playback finishes (only if the user is still listening).
  useEffect(() => {
    speakingRef.current = speaking
    if (!ttsSupported) return
    if (speaking) {
      if (restartTimerRef.current !== null) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
      if (recogRef.current || listening) {
        const rec = recogRef.current
        recogRef.current = null
        try { rec?.abort() } catch { /* ignore */ }
        setListening(false)
        setInterim('')
      }
    } else if (listenIntentRef.current && micOn) {
      scheduleRestartRef.current(150)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaking, micOn])

  useEffect(() => {
    stopSpeaking()
    stopListening()
    analysisRef.current = createAnalysisAccumulator()
    answeredIndexesRef.current.clear()
    setSavedTick(t => t + 1)
    setQIndex(0)
    setAnswered(0)
    setAnswer('')
    setInterim('')
    setMode('speak')
    setSpokenText('')
    setSpeakingSeconds(0)
    setQuestions(fallbackQuestions)
    lastFinalRef.current = ''
    justRestartedRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type, config.difficulty, config.experience, config.combined, config.questionCount])

  useEffect(() => {
    if (timeLeft === 0) setShowEnd(true)
  }, [timeLeft])

  useEffect(() => {
    if (showEnd) { stopSpeaking(); stopListening() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEnd])

  useEffect(() => {
    if (!ttsSupported || !current) return
    speak(current.q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex, current?.q, speechLocale])

  const goPrev = () => {
    stopListening()
    if (qIndex === 0) return
    persistTurn(qIndex, answer, speakingSeconds)
    setQIndex(qIndex - 1)
    restoreStoredAnswer(qIndex - 1)
  }

  const goNext = () => {
    if (advancingRef.current) return
    stopListening()
    persistTurn(qIndex, answer, speakingSeconds)
    if (isLast) { setShowEnd(true); return }
    setQIndex(qIndex + 1)
    restoreStoredAnswer(qIndex + 1)
  }

  const submitAnswer = async () => {
    if (advancingRef.current || finishingRef.current) return
    stopListening()
    persistTurn(qIndex, answer, speakingSeconds)
    if (answer.trim()) {
      answeredIndexesRef.current.add(qIndex)
      setAnswered(answeredIndexesRef.current.size)
    }

    if (isLast) {
      advancingRef.current = true
      setAdvancing(true)
      const token = accessToken
      const sid = sessionIdRef.current
      if (token && sid) {
        await drainPending()
        if (!pendingRef.current.has(qIndex)) {
          try {
            await requestNextInterviewQuestion(token, sid, qIndex)
          } catch {
            // The report can still evaluate this answer on demand.
          }
        }
      }
      advancingRef.current = false
      setAdvancing(false)
      setShowEnd(true)
      return
    }

    await advanceToNextQuestion(qIndex, qIndex + 1)
  }

  // Compile a local report from the in-memory interview state. Used only as a
  // recoverable fallback; when the server write succeeded the report reloads
  // from the persisted session instead.
  const buildLocalReport = (
    status: 'completed' | 'abandoned',
    saved: boolean,
    analysis: InterviewAnalysisSummary,
  ): InterviewReportData => {
    const turns: ReportTurn[] = questions.map((q, i) => {
      const queued = pendingRef.current.get(i)
      const text = queued?.answerText ?? savedAnswersRef.current.get(i) ?? (i === qIndex ? answer : '')
      const answerText = text ?? ''
      return {
        index: i,
        question: q.q,
        answer: answerText,
        spokenSeconds: queued?.spokenSeconds ?? 0,
        answered: answerText.trim().length > 0,
        source: q.source ?? 'static',
        difficulty: q.difficulty ?? null,
        topic: q.topic ?? q.category,
      }
    })
    const startedAt = startedAtRef.current
    const completedAt = new Date().toISOString()
    return {
      id: sessionIdRef.current,
      saved,
      interviewType: config.type,
      typeLabel: config.typeLabel,
      mode: config.mode,
      modeLabel: config.modeLabel,
      difficulty: config.difficulty,
      experience: config.experience,
      language: 'en',
      languageLabel: 'English',
      role: config.role,
      company: config.company,
      branch: config.branch ?? null,
      subject: config.subject ?? null,
      status,
      startedAt,
      completedAt,
      durationSeconds: startedAt ? Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000)) : null,
      speakingSeconds: turns.reduce((sum, t) => sum + t.spokenSeconds, 0),
      answeredCount: turns.filter(t => t.answered).length,
      totalQuestions: turns.length,
      turns,
      analysis,
      evaluations: {},
    }
  }

  // Persist the final answer and finalize the session. The latest turns are
  // flushed BEFORE the session is stamped complete, so a completed report can
  // never read back missing answers. Completed (the candidate reached the end)
  // is kept distinct from abandoned (ended early). Repeated calls are guarded.
  const finishInterview = async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    setFinishing(true)
    stopListening()
    stopSpeaking()
    persistTurn(Math.min(qIndex, total - 1), answer, speakingSeconds)

    const analysis = buildAnalysisSummary(analysisRef.current, {
      mediaStatus,
      faceModel: faceAnalysis.status,
      speechRecognitionSupported: srSupported,
      consent: config.analysisConsent ?? null,
    })
    const token = accessToken
    const sid = sessionIdRef.current
    const status: 'completed' | 'abandoned' =
      answeredIndexesRef.current.size >= total ? 'completed' : 'abandoned'
    let saved = false

    if (token && sid) {
      await drainPending()
      const turnsFlushed = pendingRef.current.size === 0
      let statusOk = false
      try {
        await updateInterviewSession(token, sid, { status, analysis })
        statusOk = true
      } catch (err) {
        if (mountedRef.current) setSaveError(describePersistenceError(err))
      }
      saved = turnsFlushed && statusOk
      if (!turnsFlushed && mountedRef.current) {
        setSaveError('Some answers could not be saved to your account.')
      }
    } else if (mountedRef.current) {
      setSaveError('Progress was not saved because the interview session was never created.')
    }

    setReportHandoff(buildLocalReport(status, saved, analysis))
    if (saved) window.dispatchEvent(new Event('mockmate:interview-updated'))
    if (mountedRef.current) setFinishing(false)
    onNavigate('report', sid ?? undefined)
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--surface-raised)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-from)]">
              <Brain size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-[var(--text-primary)]">MockMate</span>
                <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] sm:inline">AI Interview</span>
              </div>
              <p className="truncate text-[11px] text-[var(--text-secondary)]">
                {config.typeLabel}
                {config.role ? ` · ${config.role}` : ''}
                {config.company ? ` · ${config.company}` : ''}
              </p>
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-xs font-semibold text-[var(--text-secondary)]">
              <span className="hidden sm:inline">Question </span>
              {Math.min(qIndex + 1, total)}<span className="text-[var(--text-muted)]"> / {total}</span>
            </span>
            <div className={`flex items-center gap-1.5 rounded-[var(--radius-md)] border bg-[var(--surface)] px-2.5 py-1.5 ${lowTime ? 'border-red-500/40' : 'border-[var(--border)]'}`} title={`${config.durationMinutes ?? DEFAULT_SESSION_MINUTES}-minute session`}>
              <Clock size={13} className={lowTime ? 'text-red-500' : 'text-[var(--text-muted)]'} />
              <span className={`font-mono text-sm font-bold tabular-nums ${lowTime ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>{mins}:{secs}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowEnd(true)}
              className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs font-bold text-red-500 transition-all-smooth hover:bg-red-500 hover:text-white"
              aria-label="End interview"
            >
              <PhoneOff size={13} />
              <span className="hidden sm:inline">End</span>
            </button>
          </div>
        </div>
        <div className="h-1 w-full bg-[var(--accent-soft)]">
          <div className="h-1 bg-[var(--accent-from)] transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto w-full max-w-[1400px] p-3 sm:p-4 lg:h-full lg:p-5">
          <div className="grid grid-cols-1 gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,1fr)_minmax(260px,0.9fr)]">
            <section className="min-w-0 space-y-4 lg:h-full lg:overflow-y-auto lg:pb-5 lg:pr-1" aria-label="Interviewer and answer workspace">
              <Card className="overflow-hidden" aria-labelledby="current-question-heading">
                <div className="relative overflow-hidden border-b border-[var(--border)] bg-[linear-gradient(135deg,#faf8ff_0%,#f3eeff_55%,#ece5ff_100%)] p-3.5 sm:p-4">
                  <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[var(--accent-from)]/10 blur-2xl" />
                  <div className="relative flex items-center gap-3.5">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-[18px] border border-white/80 bg-white shadow-[var(--shadow-md)] ring-1 ring-[var(--accent-from)]/10 sm:h-20 sm:w-20 xl:h-24 xl:w-24">
                      <InterviewerAvatar className="h-full w-full" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-extrabold text-[var(--text-primary)]">AI Interviewer</p>
                        <Badge variant="default" className="px-1.5 py-0 text-[10px]">Preview</Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] font-medium text-[var(--text-secondary)]">Virtual interview host</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="info">{config.typeLabel}</Badge>
                        {config.role && <Badge variant="default">{config.role}</Badge>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent-from)]">
                      Question {Math.min(qIndex + 1, total)} <span className="font-medium text-[var(--text-muted)]">of {total}</span>
                    </span>
                    <span className="h-3 w-px bg-[var(--border)]" />
                    <Badge variant="info">{current.category}</Badge>
                  </div>
                  <Button size="sm" variant="secondary" className="min-h-9" onClick={() => speak(current.q)} disabled={!ttsSupported}>
                    <Play size={13} /> Replay
                  </Button>
                </div>

                <h2 id="current-question-heading" className="mt-3 text-lg font-semibold leading-relaxed text-[var(--text-primary)] sm:text-xl">
                  {current.q}
                </h2>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {speaking && (
                    <>
                      <Badge variant="success"><Volume2 size={10} /> Playing question…</Badge>
                      <Button size="sm" variant="ghost" className="min-h-9" onClick={stopSpeaking}><Square size={12} /> Stop</Button>
                    </>
                  )}
                  {!ttsSupported && <span className="text-[11px] text-[var(--text-muted)]">Question playback is not supported in this browser.</span>}
                </div>

                {ttsSupported && voiceNotice && (
                  <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-600">
                    <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                    <span>{voiceNotice}</span>
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Answered <span className="font-semibold text-[var(--text-secondary)]">{answered}</span> of {total}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">English</p>
                </div>
                </div>
              </Card>

              {(sessionError || saveError) && (
                <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/10 p-3">
                  <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{sessionError || saveError}</p>
                    <button type="button" onClick={retryPersistence} className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold text-amber-600 hover:underline">
                      <RefreshCw size={11} /> Retry saving
                    </button>
                  </div>
                </div>
              )}

              {adaptiveNotice && (
                <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[var(--text-muted)]" />
                  <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{adaptiveNotice}</p>
                </div>
              )}

              <Card className="p-3.5 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-[var(--text-primary)]">Your Answer</h2>
                      {currentAnswerSaved && (
                        <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                          <CheckCircle2 size={10} /> Saved
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">Speak naturally or type your response. Transcripts stay editable.</p>
                  </div>
                  <div className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1" role="group" aria-label="Answer mode">
                    <button
                      type="button"
                      onClick={() => chooseMode('speak')}
                      aria-pressed={mode === 'speak'}
                      className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-semibold transition-all-smooth ${mode === 'speak' ? 'bg-[var(--accent-from)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]'}`}
                    >
                      <Mic size={13} /> Speak
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseMode('type')}
                      aria-pressed={mode === 'type'}
                      className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-semibold transition-all-smooth ${mode === 'type' ? 'bg-[var(--accent-from)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]'}`}
                    >
                      <Keyboard size={13} /> Type
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  {mode === 'speak' ? (
                    <div className="space-y-2.5">
                      {srSupported ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="md" variant={listening ? 'danger' : 'primary'} onClick={toggleRecording} disabled={advancing || finishing}>
                              {listening ? <><Square size={14} /> Stop recording</> : <><Mic size={14} /> Speak answer</>}
                            </Button>
                            {listening
                              ? <Badge variant="error" className="animate-pulse"><Volume2 size={10} /> Listening…</Badge>
                              : <span className="text-[11px] text-[var(--text-muted)]">Your words appear below as you speak.</span>}
                          </div>
                          {!micOn && (
                            <p className="text-[11px] leading-relaxed text-amber-600">Microphone is muted. Unmute it in the media panel to capture a spoken answer.</p>
                          )}
                          <div className={`min-h-[96px] rounded-[var(--radius-md)] border bg-[var(--surface)] p-3 ${listening ? 'border-[var(--accent-from)]/30' : 'border-[var(--border)]'}`}>
                            {(answer.trim() || interim) ? (
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">{answer}{interim && <span className="text-[var(--text-muted)]"> {interim}</span>}</p>
                            ) : (
                              <div className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 text-center">
                                <Mic size={20} className="text-[var(--text-muted)]" />
                                <p className="text-xs text-[var(--text-muted)]">{listening ? 'Start speaking — your words appear here.' : 'Press Speak answer and say your response.'}</p>
                                <p className="text-[10px] text-[var(--text-muted)]">You can edit the transcript in Type mode before submitting.</p>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/10 p-3">
                          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
                          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">Speech recognition is not supported in this browser. Use Type mode instead.</p>
                        </div>
                      )}
                      {speechError && <p className="text-[11px] leading-relaxed text-amber-600">{speechError}</p>}
                    </div>
                  ) : (
                    <textarea
                      value={answer}
                      onChange={e => setAnswer(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submitAnswer() }}
                      readOnly={advancing || finishing}
                      rows={4}
                      aria-label="Your typed answer"
                      placeholder="Type your response here..."
                      className="min-h-[96px] w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm leading-relaxed text-[var(--text-primary)] outline-none transition-all-smooth focus:border-[var(--accent-from)] focus:ring-2 focus:ring-[var(--accent-from)]/20"
                    />
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <Button size="sm" variant="ghost" className="min-h-9" onClick={goPrev} disabled={qIndex === 0 || advancing || finishing}>
                    <ChevronLeft size={14} /> Previous
                  </Button>
                  {!isLast && <Button size="sm" variant="secondary" className="min-h-9" onClick={goNext} disabled={advancing || finishing}>Next <ChevronRight size={14} /></Button>}
                  {mode === 'type' && <span className="hidden text-[10px] text-[var(--text-muted)] sm:inline">Ctrl / ⌘ + Enter to submit</span>}
                  <Button size="md" className="ml-auto min-w-[170px]" onClick={() => void submitAnswer()} disabled={advancing || finishing}>
                    {advancing ? (
                      <><Loader2 size={14} className="animate-spin" /> {isLast ? 'Evaluating answer…' : 'Preparing next question…'}</>
                    ) : isLast ? (
                      <>Submit &amp; Finish <CheckCircle2 size={14} /></>
                    ) : (
                      <>Submit Answer <ChevronRight size={14} /></>
                    )}
                  </Button>
                </div>
              </Card>
            </section>

            <div className="contents lg:block lg:h-full lg:space-y-4 lg:overflow-y-auto lg:pb-5 lg:pr-1 xl:contents xl:space-y-0">
              <section className="min-w-0 xl:h-full xl:overflow-y-auto xl:pb-5 xl:pr-1" aria-label="My camera">
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)]">My Camera</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Live video preview</p>
                    </div>
                    <Badge
                      variant={camOn ? 'success' : mediaStatus === 'error' || mediaStatus === 'unsupported' ? 'error' : 'default'}
                      className="px-2 py-0.5 text-[10px]"
                    >
                      {camOn ? 'Live' : !hasVideo ? (mediaStatus === 'requesting' ? 'Connecting' : 'Unavailable') : 'Camera off'}
                    </Badge>
                  </div>
                  <div className="p-3">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] bg-[#0e0a1e] ring-1 ring-black/5">
                  <video ref={videoRef} autoPlay muted playsInline aria-label="Your camera preview" className="absolute inset-0 h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                  {!camOn && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center" style={{ background: 'linear-gradient(135deg, #1a0c3a, #0e0820)' }}>
                      {mediaStatus === 'requesting'
                        ? <><Loader2 size={24} className="animate-spin text-[var(--accent-from)]" /><p className="text-xs text-[var(--text-muted)]">Requesting camera…</p></>
                        : mediaStatus === 'error' || mediaStatus === 'unsupported'
                          ? <><VideoOff size={24} className="text-[var(--text-muted)]" /><p className="text-xs text-[var(--text-muted)]">Camera unavailable</p></>
                          : <><VideoOff size={24} className="text-[var(--text-muted)]" /><p className="text-xs text-[var(--text-muted)]">Camera off</p></>}
                    </div>
                  )}
                  {camOn && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live
                    </span>
                  )}
                  <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">You</span>
                    {micOn && (
                      <div className="flex h-4 items-end gap-0.5" aria-hidden="true">
                        {[3, 5, 4, 6, 3].map((h, i) => (
                          <div key={i} className="w-1 rounded-full bg-emerald-400 transition-all-smooth" style={{ height: `${Math.max(4, (micLevel / 100) * h * 4)}px`, opacity: micLevel > 4 ? 1 : 0.3 }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                  </div>

                <div className="space-y-3 px-3 pb-3.5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={toggleCam}
                      disabled={!hasVideo}
                      aria-pressed={camOn}
                      className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-2 text-xs font-semibold transition-all-smooth disabled:cursor-not-allowed disabled:opacity-40 ${camOn ? 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent-from)] hover:bg-[var(--accent-from)] hover:text-white'}`}
                    >
                      {camOn ? <Video size={14} /> : <VideoOff size={14} />} {camOn ? 'Stop camera' : 'Start camera'}
                    </button>
                    <button
                      type="button"
                      onClick={toggleMic}
                      disabled={!hasAudio}
                      aria-pressed={micOn}
                      className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-2 text-xs font-semibold transition-all-smooth disabled:cursor-not-allowed disabled:opacity-40 ${micOn ? 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent-from)] hover:bg-[var(--accent-from)] hover:text-white'}`}
                    >
                      {micOn ? <Mic size={14} /> : <MicOff size={14} />} {micOn ? 'Mute mic' : 'Unmute mic'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-center">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Camera</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-[var(--text-primary)]">{hasVideo ? (camOn ? 'On' : 'Off') : 'Unavailable'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Mic</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-[var(--text-primary)]">{hasAudio ? (micOn ? 'On' : 'Muted') : 'Unavailable'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Access</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-[var(--text-primary)]">{mediaStatus === 'ready' ? 'Granted' : mediaStatus === 'requesting' ? 'Pending' : mediaStatus === 'unsupported' ? 'Unsupported' : 'Denied'}</p>
                    </div>
                  </div>

                  {mediaError && (
                    <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 p-2.5">
                      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{mediaError}</p>
                        <button type="button" onClick={requestMedia} className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold text-red-500 hover:underline">
                          <RefreshCw size={11} /> Retry device access
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </Card>
              </section>

              <aside className="min-w-0 xl:h-full xl:overflow-y-auto xl:pb-5 xl:pr-1" aria-label="Live analysis">
                <LiveAnalysisPanel
                mediaStatus={mediaStatus}
                hasVideo={hasVideo}
                hasAudio={hasAudio}
                camOn={camOn}
                micOn={micOn}
                micLevel={micLevel}
                recentAudio={recentAudio}
                srSupported={srSupported}
                listening={listening}
                interim={interim}
                spokenWords={spokenWords}
                face={faceAnalysis}
              />
              </aside>
            </div>
          </div>
        </div>
      </div>

      {showEnd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="end-interview-title">
          <Card className="max-h-[90dvh] w-full max-w-sm overflow-y-auto p-6 text-center sm:p-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
              <AlertCircle size={26} className="text-red-500" />
            </div>
            <h3 id="end-interview-title" className="mb-2 text-lg font-extrabold text-[var(--text-primary)]">End Interview?</h3>
            <p className="mb-6 text-sm leading-relaxed text-[var(--text-secondary)]">You've answered {answered} of {total} questions. Your current answers will be saved before you leave.</p>
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setShowEnd(false)} disabled={finishing}>Continue</Button>
              <Button variant="danger" className="flex-1" onClick={() => { void finishInterview() }} disabled={finishing}>
                {finishing
                  ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  : <><CheckCircle2 size={13} /> End Session</>}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
