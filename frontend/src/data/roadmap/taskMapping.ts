import {
  roadmapDomains,
  type RoadmapDomainId,
  type RoadmapTopic,
} from './index.ts'
import type { RoadmapPlan, RoadmapPlanTask } from './plan.ts'

// Deterministic, local mapping from an AI-generated task to the curated roadmap
// catalog. The API stores only the task text; the mapping is derived in the
// browser so no schema change or duplicate catalog is required.

export interface CatalogTopicKeywords {
  [topicKey: string]: readonly string[]
}

// Extra vocabulary that is common in task titles but not necessarily present in
// the short catalog title/summary. Every catalog topic must have an entry; the
// roadmap test suite enforces that.
export const CATALOG_TOPIC_KEYWORDS: CatalogTopicKeywords = {
  'it:complexity-and-data-structures': [
    'big o',
    'big-o',
    'time complexity',
    'space complexity',
    'complexity analysis',
    'data structures',
    'arrays',
    'linked lists',
    'hash tables',
    'hash maps',
    'stacks',
    'queues',
  ],
  'it:algorithms-and-problem-solving': [
    'algorithms',
    'algorithm',
    'dsa',
    'data structures and algorithms',
    'coding interview',
    'coding problems',
    'problem solving',
    'dynamic programming',
    'dp',
    'greedy',
    'binary search',
    'two pointers',
    'sliding window',
    'graph traversal',
    'graph algorithms',
    'bfs',
    'dfs',
    'recursion',
    'backtracking',
    'sorting',
  ],
  'it:databases-and-apis': [
    'databases',
    'database',
    'dbms',
    'sql',
    'transactions',
    'acid',
    'indexes',
    'indexing',
    'normalization',
    'rest api',
    'rest apis',
    'http api',
    'http apis',
    'api design',
    'idempotency',
  ],
  'it:operating-systems-and-networks': [
    'operating systems',
    'operating system',
    'os',
    'processes',
    'threads',
    'memory management',
    'virtual memory',
    'scheduling',
    'networking',
    'tcp',
    'udp',
    'dns',
    'tls',
    'cdn',
  ],
  'it:system-design-foundations': [
    'system design',
    'distributed systems',
    'scalability',
    'load balancing',
    'caching',
    'message queues',
    'url shortener',
    'availability',
    'consistency',
    'replication',
    'sharding',
    'cap theorem',
  ],
  'mechanical:thermodynamics': [
    'thermodynamics',
    'thermo',
    'energy systems',
    'heat',
    'entropy',
    'second law',
    'thermodynamic cycles',
    'efficiency',
  ],
  'mechanical:fluid-mechanics': [
    'fluid mechanics',
    'fluids',
    'piping',
    'pumps',
    'pressure',
    'flow',
    'bernoulli',
    'continuity',
    'head loss',
  ],
  'mechanical:machine-design': [
    'machine design',
    'mechanical design',
    'fatigue',
    'stress concentration',
    'combined loading',
    'shafts',
    'bearings',
    'failure theories',
  ],
  'mechanical:manufacturing-and-materials': [
    'manufacturing',
    'materials',
    'material selection',
    'casting',
    'machining',
    'welding',
    'tolerance',
    'production',
    'process selection',
  ],
  'electronics:circuit-analysis': [
    'circuit analysis',
    'circuits',
    'kirchhoff',
    'kvl',
    'kcl',
    'impedance',
    'electrical power',
    'network analysis',
    'thevenin',
    'nodal analysis',
  ],
  'electronics:digital-electronics': [
    'digital electronics',
    'digital logic',
    'boolean logic',
    'logic gates',
    'flip flops',
    'state machines',
    'timing',
    'sequential logic',
    'combinational logic',
  ],
  'electronics:embedded-systems': [
    'embedded systems',
    'microcontrollers',
    'firmware',
    'interrupts',
    'gpio',
    'uart',
    'spi',
    'i2c',
    'real time systems',
  ],
  'electronics:control-systems': [
    'control systems',
    'feedback',
    'pid',
    'pid controller',
    'stability',
    'control theory',
    'bode',
    'root locus',
  ],
  'management:prioritisation-and-tradeoffs': [
    'prioritisation',
    'prioritization',
    'prioritise',
    'prioritize',
    'trade-offs',
    'tradeoffs',
    'dependencies',
    'cost of delay',
    'decision making',
  ],
  'management:metrics-and-business-cases': [
    'metrics',
    'kpis',
    'business case',
    'business cases',
    'product metrics',
    'analytics',
    'roi',
    'assumptions',
    'outcomes',
  ],
  'management:operations-and-process-improvement': [
    'operations',
    'process improvement',
    'bottlenecks',
    'lean',
    'six sigma',
    'throughput',
    'flow',
    'efficiency',
  ],
  'management:stakeholder-communication': [
    'stakeholder',
    'stakeholders',
    'communication',
    'presentations',
    'influencing',
    'negotiation',
    'audience',
  ],
  'hr:star-story-bank': [
    'star stories',
    'star story',
    'star method',
    'behavioural stories',
    'behavioral stories',
    'behavioural interview',
    'behavioral interview',
    'behavioural questions',
    'behavioral questions',
    'story bank',
    'situational interview',
  ],
  'hr:self-introduction-and-motivation': [
    'self introduction',
    'introduce yourself',
    'tell me about yourself',
    'motivation',
    'why this role',
    'why this company',
  ],
  'hr:conflict-and-teamwork': [
    'conflict',
    'conflict resolution',
    'teamwork',
    'team work',
    'collaboration',
    'influence',
    'disagreement',
  ],
  'hr:failure-and-growth': [
    'failure',
    'feedback',
    'growth',
    'mistake',
    'learning from failure',
    'accountability',
  ],
  'aptitude:percentages-ratios': [
    'percentages',
    'percentage',
    'ratios',
    'ratio',
    'proportion',
    'profit and loss',
  ],
  'aptitude:time-speed-work': [
    'time speed work',
    'time and work',
    'time and distance',
    'speed',
    'distance',
    'work problems',
    'pipes and cisterns',
    'trains',
  ],
  'aptitude:logical-reasoning': [
    'logical reasoning',
    'reasoning',
    'syllogisms',
    'puzzles',
    'deductions',
    'blood relations',
    'seating arrangement',
  ],
  'aptitude:probability-and-data-interpretation': [
    'probability',
    'data interpretation',
    'statistics',
    'combinations',
    'permutations',
    'counting',
    'tables',
    'charts',
  ],
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'to',
  'for',
  'of',
  'in',
  'on',
  'with',
  'your',
  'you',
  'this',
  'that',
  'from',
  'by',
  'using',
  'use',
  'apply',
  'practise',
  'practice',
  'learn',
  'learning',
  'build',
  'building',
  'create',
  'understand',
  'explain',
  'core',
  'key',
  'common',
  'basic',
  'foundation',
  'foundations',
  'prepare',
  'preparation',
  'placement',
  'interview',
  'interviews',
  'skill',
  'skills',
  'study',
  'review',
  'improve',
  'master',
  'task',
  'module',
  'session',
  'focus',
  'focused',
  'overview',
])

const IRREGULAR_STEMS: Record<string, string> = {
  analyses: 'analysis',
  children: 'child',
  criteria: 'criterion',
  data: 'data',
  people: 'person',
  processes: 'process',
  stories: 'story',
}

interface TopicEntry {
  domainId: RoadmapDomainId
  topic: RoadmapTopic
  aliases: readonly string[]
}

const TOPIC_ENTRIES: TopicEntry[] = roadmapDomains.flatMap((domain) =>
  domain.topics.map((topic) => ({
    domainId: domain.id,
    topic,
    aliases: CATALOG_TOPIC_KEYWORDS[`${domain.id}:${topic.id}`] ?? [],
  })),
)

const TOPIC_BY_KEY = new Map(
  TOPIC_ENTRIES.map((entry) => [`${entry.domainId}:${entry.topic.id}`, entry]),
)

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stem(word: string): string {
  const irregular = IRREGULAR_STEMS[word]
  if (irregular) return irregular
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2)
  if (word.length > 4 && word.endsWith('sses')) return word.slice(0, -2)
  if (word.length > 4 && /(ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
    .map(stem)
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0
  for (const value of left) {
    if (right.has(value)) count += 1
  }
  return count
}

function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false
  return ` ${haystack} `.includes(` ${needle} `)
}

function scoreTopic(task: RoadmapPlanTask, entry: TopicEntry): number {
  if (task.id === entry.topic.id) return 1_000

  const taskTitle = normalizeText(task.title)
  const taskText = normalizeText(`${task.title} ${task.description}`)
  const topicTitle = normalizeText(entry.topic.title)

  if (taskTitle === topicTitle) return 900

  let score = 0
  let hasStrongEvidence = false

  if (containsPhrase(taskText, topicTitle)) {
    score += 140
    hasStrongEvidence = true
  }

  for (const alias of entry.aliases) {
    const phrase = normalizeText(alias)
    if (phrase.length >= 4 && containsPhrase(taskText, phrase)) {
      score += 70 + Math.min(phrase.length, 20)
      hasStrongEvidence = true
    }
  }

  const titleTokens = new Set(tokenize(entry.topic.title))
  const taskTextTokens = new Set(tokenize(`${task.title} ${task.description}`))
  const taskTitleTokens = new Set(tokenize(task.title))

  const titleHits = intersectionSize(titleTokens, taskTextTokens)
  const titleHitsInTaskTitle = intersectionSize(titleTokens, taskTitleTokens)
  const titleCoverage = titleTokens.size > 0 ? titleHits / titleTokens.size : 0

  score += titleHits * 10 + titleCoverage * 20 + titleHitsInTaskTitle * 6

  const summaryTokens = new Set(tokenize(entry.topic.summary))
  score += intersectionSize(summaryTokens, taskTextTokens) * 2

  if (!hasStrongEvidence) {
    const enoughTitleOverlap =
      titleHits >= 2 || (titleHits >= 1 && titleCoverage >= 0.5)
    if (!enoughTitleOverlap) return 0
  }

  return score
}

interface RankedMatch {
  taskIndex: number
  catalogTopicId: string
  score: number
}

/**
 * Attach a curated catalog topic to every task that has a strong, unambiguous
 * match. Matching is one-to-one: a catalog topic is assigned to at most one task
 * in a plan, so completion keys cannot collide.
 */
export function withCatalogTopicMatches(plan: RoadmapPlan): RoadmapPlan {
  const ranked: RankedMatch[] = []

  plan.tasks.forEach((task, taskIndex) => {
    for (const entry of TOPIC_ENTRIES) {
      if (entry.domainId !== task.domainId) continue
      const score = scoreTopic(task, entry)
      if (score > 0) {
        ranked.push({
          taskIndex,
          catalogTopicId: entry.topic.id,
          score,
        })
      }
    }
  })

  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      left.taskIndex - right.taskIndex ||
      left.catalogTopicId.localeCompare(right.catalogTopicId),
  )

  const assignedTasks = new Set<number>()
  const assignedTopics = new Set<string>()
  const matchByTask = new Map<number, string>()

  for (const match of ranked) {
    const task = plan.tasks[match.taskIndex]
    if (!task) continue
    const topicKey = `${task.domainId}:${match.catalogTopicId}`
    if (assignedTasks.has(match.taskIndex) || assignedTopics.has(topicKey)) continue
    assignedTasks.add(match.taskIndex)
    assignedTopics.add(topicKey)
    matchByTask.set(match.taskIndex, match.catalogTopicId)
  }

  return {
    ...plan,
    tasks: plan.tasks.map((task, taskIndex) => ({
      ...task,
      catalogTopicId: matchByTask.get(taskIndex) ?? null,
    })),
  }
}

export function getTaskCatalogTopic(task: RoadmapPlanTask): RoadmapTopic | null {
  const topicId = task.catalogTopicId?.trim()
  if (!topicId) return null
  return TOPIC_BY_KEY.get(`${task.domainId}:${topicId}`)?.topic ?? null
}
