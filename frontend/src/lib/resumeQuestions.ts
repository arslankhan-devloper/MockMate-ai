// Derives interview questions from the stored resume analysis.
//
// The prompts only reference skills, strengths and gaps that the analysis
// actually returned, so a resume-based session never invents experience. A
// small set of general resume prompts fills the session when the analysis is
// sparse.

import type { StoredResume } from './resumeStore'

export interface ResumeQuestion {
  q: string
  category: string
}

const MAX_QUESTIONS = 8
const MAX_SKILLS = 3
const MAX_MATCHED = 2
const MAX_STRENGTHS = 2

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function clip(value: string, max = 140): string {
  const text = clean(value)
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function buildResumeQuestions(resume: StoredResume | null): ResumeQuestion[] {
  if (!resume) return []
  const { analysis, jobTitle } = resume
  const role = clip(jobTitle, 60) || 'this role'
  const out: ResumeQuestion[] = []
  const seen = new Set<string>()

  const add = (question: string, category: string) => {
    const text = clean(question)
    if (!text || seen.has(text) || out.length >= MAX_QUESTIONS) return
    seen.add(text)
    out.push({ q: text, category })
  }

  add(`Walk me through your resume and the experience that best matches ${role}.`, 'Resume Overview')

  analysis.technicalSkills.slice(0, MAX_SKILLS).forEach(skill => {
    add(
      `Your resume lists ${skill}. Describe a project where you used it and the trade-offs you made.`,
      `Resume · ${clip(skill, 40)}`,
    )
  })

  if (analysis.jobMatch) {
    analysis.jobMatch.matchedSkills.slice(0, MAX_MATCHED).forEach(skill => {
      add(
        `${role} calls for ${skill}, which your resume matches. Give a concrete example of applying it.`,
        'Job Match',
      )
    })
  }

  analysis.keyStrengths.slice(0, MAX_STRENGTHS).forEach(strength => {
    add(
      `Your resume highlights: "${clip(strength)}". Can you support that with a specific example and outcome?`,
      'Key Strength',
    )
  })

  if (analysis.jobMatch && analysis.jobMatch.missingSkills.length > 0) {
    const gap = analysis.jobMatch.missingSkills[0]
    add(
      `The target role mentions ${gap}, but your resume does not clearly show it. How would you close that gap?`,
      'Skill Gap',
    )
  }

  const fallbacks: ResumeQuestion[] = [
    { q: 'Which project on your resume are you most proud of, and what was your specific contribution?', category: 'Project' },
    { q: 'What is the biggest technical challenge you have faced, and how did you resolve it?', category: 'Problem Solving' },
    { q: 'Which skill on your resume would you most like to strengthen, and why?', category: 'Self-assessment' },
    { q: `Why are you a good fit for ${role}?`, category: 'Motivation' },
  ]
  for (const fallback of fallbacks) add(fallback.q, fallback.category)

  return out
}
