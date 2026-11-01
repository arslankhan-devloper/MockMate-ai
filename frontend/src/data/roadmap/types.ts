// Versioned, in-app roadmap study material.
//
// Content lives in TypeScript so it ships with the app and needs no content
// CRUD API. Topic IDs are stable identifiers used by the progress table; renaming
// a title must never change its ID. Only completion is persisted.

export const ROADMAP_DOMAIN_IDS = [
  'it',
  'mechanical',
  'electronics',
  'management',
  'hr',
  'aptitude',
] as const

export type RoadmapDomainId = (typeof ROADMAP_DOMAIN_IDS)[number]

export type QuestionDifficulty = 'Easy' | 'Medium' | 'Hard'

export interface RoadmapPracticeQuestion {
  id: string
  prompt: string
  difficulty: QuestionDifficulty
  answer: string
  explanation: string
}

export interface RoadmapWorkedExample {
  title: string
  body: string
}

export interface RoadmapResource {
  title: string
  provider: string
  url: string
}

export interface RoadmapTopic {
  id: string
  title: string
  summary: string
  estimatedMinutes: number
  notes: string[]
  example: RoadmapWorkedExample
  practice: RoadmapPracticeQuestion[]
  resources?: RoadmapResource[]
}

export interface RoadmapDomain {
  id: RoadmapDomainId
  title: string
  shortLabel: string
  description: string
  accent: string
  topics: RoadmapTopic[]
}
