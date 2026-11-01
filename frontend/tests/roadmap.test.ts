import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROADMAP_DOMAIN_IDS,
  roadmapDomains,
  roadmapTopicCount,
  type RoadmapDomainId,
} from '../src/data/roadmap/index.ts'
import {
  completedKeySet,
  domainProgress,
  overallProgress,
  progressKey,
} from '../src/data/roadmap/progress.ts'
import { recommendRoadmapDomains } from '../src/data/roadmap/recommendation.ts'
import {
  buildFallbackRoadmapPlan,
  isSafeRoadmapResourceUrl,
  planProgress,
  planTaskProgressKey,
  planTaskTopicId,
  resolveSelectedTaskId,
  staleProgressKeys,
  type RoadmapPlan,
  type RoadmapPlanResource,
  type RoadmapPlanTask,
} from '../src/data/roadmap/plan.ts'
import {
  CATALOG_TOPIC_KEYWORDS,
  getTaskCatalogTopic,
  withCatalogTopicMatches,
} from '../src/data/roadmap/taskMapping.ts'
import {
  ROADMAP_TOPIC_RESOURCE_TYPES,
  asRoadmapTopicResources,
  groupRoadmapTopicResources,
  isVerifiedRoadmapTopicResource,
  type RoadmapTopicResource,
} from '../src/data/roadmap/resources.ts'

const TOPIC_SLUG = /^[a-z0-9-]{1,80}$/

test('catalog contains exactly the six audited domains in order', () => {
  assert.deepEqual(roadmapDomains.map((domain) => domain.id), [...ROADMAP_DOMAIN_IDS])
  assert.equal(roadmapDomains.length, 6)
  assert.equal(roadmapTopicCount, roadmapDomains.reduce((total, domain) => total + domain.topics.length, 0))
})

test('every domain and topic has complete, stable, non-placeholder content', () => {
  const topicIds = new Set<string>()
  for (const domain of roadmapDomains) {
    assert.ok(domain.title.trim())
    assert.ok(domain.description.trim())
    assert.ok(domain.accent.startsWith('#'))
    assert.ok(domain.topics.length >= 4 && domain.topics.length <= 6, `${domain.id} topic count`)

    for (const topic of domain.topics) {
      assert.match(topic.id, TOPIC_SLUG)
      assert.equal(topicIds.has(topic.id), false, `duplicate topic id: ${topic.id}`)
      topicIds.add(topic.id)
      assert.ok(topic.title.trim())
      assert.ok(topic.summary.trim())
      assert.ok(topic.estimatedMinutes > 0)
      assert.ok(topic.notes.length >= 2)
      assert.ok(topic.notes.every((note) => note.trim().length > 20))
      assert.ok(topic.example.title.trim())
      assert.ok(topic.example.body.trim().length > 20)
      assert.ok(topic.practice.length >= 2)

      const questionIds = new Set<string>()
      for (const question of topic.practice) {
        assert.match(question.id, TOPIC_SLUG)
        assert.equal(questionIds.has(question.id), false, `duplicate question id in ${topic.id}`)
        questionIds.add(question.id)
        assert.ok(['Easy', 'Medium', 'Hard'].includes(question.difficulty))
        assert.ok(question.prompt.trim())
        assert.ok(question.answer.trim())
        assert.ok(question.explanation.trim())
        assert.notEqual(question.answer.trim().toLowerCase(), question.prompt.trim().toLowerCase())
      }

      for (const resource of topic.resources ?? []) {
        assert.notEqual(resource.url.trim(), '#')
        assert.match(resource.url, /^https:\/\//)
      }
    }
  }
})

test('domain and overall progress are derived from completed topic keys', () => {
  const domain = roadmapDomains[0]
  const first = domain.topics[0]
  const second = domain.topics[1]
  const keys = new Set([
    progressKey(domain.id, first.id),
    progressKey(domain.id, second.id),
  ])

  const progress = domainProgress(domain, keys)
  assert.equal(progress.completed, 2)
  assert.equal(progress.total, domain.topics.length)
  assert.equal(progress.percent, Math.round((2 / domain.topics.length) * 100))

  const overall = overallProgress(roadmapDomains, keys)
  assert.equal(overall.completed, 2)
  assert.equal(overall.total, roadmapTopicCount)
  assert.equal(overall.percent, Math.round((2 / roadmapTopicCount) * 100))

  assert.deepEqual(domainProgress(domain, new Set()), {
    completed: 0,
    total: domain.topics.length,
    percent: 0,
  })
  assert.deepEqual(overallProgress([{ ...domain, topics: [] }], new Set()), {
    completed: 0,
    total: 0,
    percent: 0,
  })
})

test('completedKeySet ignores the timestamp for progress calculation', () => {
  const keys = completedKeySet([
    { domainId: 'it', topicId: 'complexity-and-data-structures' },
    { domainId: 'mechanical', topicId: 'thermodynamics' },
  ])
  assert.equal(keys.has(progressKey('it', 'complexity-and-data-structures')), true)
  assert.equal(keys.has(progressKey('mechanical', 'thermodynamics')), true)
  assert.equal(keys.size, 2)
})

test('recommends branch-matched domains without hiding the other tracks', () => {
  const cases: [string, RoadmapDomainId][] = [
    ['Computer Science', 'it'],
    ['Information Technology', 'it'],
    ['Data Science', 'it'],
    ['Mechanical', 'mechanical'],
    ['Electronics & Communication', 'electronics'],
    ['Electrical', 'electronics'],
    ['Business Management', 'management'],
    ['Human Resources', 'hr'],
  ]

  for (const [branch, expected] of cases) {
    const recommendation = recommendRoadmapDomains(branch)
    assert.equal(recommendation.domainIds[0], expected, branch)
    assert.match(recommendation.reason, /branch/i)
  }
})

test('Civil and unknown branches default to aptitude and HR without misclassification', () => {
  for (const branch of ['Civil', '', null, 'Unlisted Programme']) {
    const recommendation = recommendRoadmapDomains(branch)
    assert.deepEqual(recommendation.domainIds, ['aptitude', 'hr'])
    assert.match(recommendation.reason, /every branch/i)
  }
})

test('uses the weakest evaluated interview domain when no branch match exists', () => {
  const recommendation = recommendRoadmapDomains('Civil', [
    { key: 'technical', sessions: 4, evaluatedAnswers: 8, averageScore: 72 },
    { key: 'mechanical', sessions: 3, evaluatedAnswers: 6, averageScore: 58 },
    { key: 'hr', sessions: 2, evaluatedAnswers: 5, averageScore: 81 },
  ])
  assert.deepEqual(recommendation.domainIds, ['mechanical'])
  assert.match(recommendation.reason, /interview domains/i)
})

test('combines a branch match with a different low-scoring interview domain', () => {
  const recommendation = recommendRoadmapDomains('Computer Science', [
    { key: 'technical', sessions: 4, evaluatedAnswers: 8, averageScore: 74 },
    { key: 'mechanical', sessions: 2, evaluatedAnswers: 4, averageScore: 55 },
  ])
  assert.deepEqual(recommendation.domainIds, ['it', 'mechanical'])
  assert.match(recommendation.reason, /branch/i)
  assert.match(recommendation.reason, /interview domains/i)
})

test('ignores interview groups without a valid evaluated score', () => {
  const recommendation = recommendRoadmapDomains('Civil', [
    { key: 'mechanical', sessions: 3, evaluatedAnswers: 0, averageScore: null },
    { key: 'technical', sessions: 1, evaluatedAnswers: 0, averageScore: null },
  ])
  assert.deepEqual(recommendation.domainIds, ['aptitude', 'hr'])
})

test('fallback roadmap is a six-task checklist with safe external resources', () => {
  const plan = buildFallbackRoadmapPlan('Computer Science', [
    { key: 'mechanical', sessions: 2, evaluatedAnswers: 4, averageScore: 54 },
  ])

  assert.equal(plan.source, 'fallback')
  assert.equal(plan.tasks.length, 6)
  assert.ok(plan.focusAreas.length >= 1)

  const ids = new Set<string>()
  for (const task of plan.tasks) {
    const key = progressKey(task.domainId, task.id)
    assert.equal(ids.has(key), false)
    ids.add(key)
    assert.ok(task.title.trim())
    assert.ok(task.estimatedMinutes > 0)
    assert.ok(task.resources.length >= 1)
    for (const resource of task.resources) {
      assert.equal(isSafeRoadmapResourceUrl(resource.url), true, resource.url)
    }
  }
})

test('fallback resources reject unsafe and non-allowlisted links', () => {
  assert.equal(isSafeRoadmapResourceUrl('https://ocw.mit.edu/search/?q=physics'), true)
  assert.equal(isSafeRoadmapResourceUrl('https://learn.microsoft.com/en-us/search/?terms=sql'), true)
  assert.equal(isSafeRoadmapResourceUrl('https://www.youtube.com/results?search_query=os'), true)
  assert.equal(isSafeRoadmapResourceUrl('javascript:alert(1)'), false)
  assert.equal(isSafeRoadmapResourceUrl('http://ocw.mit.edu/search/?q=physics'), false)
  assert.equal(isSafeRoadmapResourceUrl('https://example.com/phishing'), false)
  assert.equal(isSafeRoadmapResourceUrl('https://user:pass@ocw.mit.edu/'), false)
  assert.equal(isSafeRoadmapResourceUrl('https://www.youtube.com.evil.example/results'), false)
  assert.equal(isSafeRoadmapResourceUrl('https://youtube.com.evil.example/results'), false)
})

test('plan progress counts only tasks in the current plan', () => {
  const plan = buildFallbackRoadmapPlan('Information Technology')
  const first = plan.tasks[0]
  const second = plan.tasks[1]
  const keys = new Set([
    progressKey(first.domainId, first.id),
    progressKey(second.domainId, second.id),
  ])

  assert.deepEqual(planProgress(plan, keys), {
    completed: 2,
    total: 6,
    percent: Math.round((2 / 6) * 100),
  })
  assert.deepEqual(planProgress({ ...plan, tasks: [] }, keys), {
    completed: 0,
    total: 0,
    percent: 0,
  })
})

const TEST_RESOURCE: RoadmapPlanResource = {
  title: 'Reference',
  description: 'A safe reference for the test task.',
  type: 'Article',
  provider: 'MDN Web Docs',
  url: 'https://developer.mozilla.org/en-US/search?q=test',
}

function testTask(
  details: Pick<RoadmapPlanTask, 'id' | 'domainId' | 'title'> &
    Partial<Pick<RoadmapPlanTask, 'description' | 'estimatedMinutes' | 'resources' | 'catalogTopicId'>>,
): RoadmapPlanTask {
  return {
    description: details.description ?? details.title,
    estimatedMinutes: details.estimatedMinutes ?? 40,
    resources: details.resources ?? [TEST_RESOURCE],
    ...details,
  }
}

function testPlan(tasks: RoadmapPlanTask[]): RoadmapPlan {
  return {
    source: 'ai',
    title: 'Test roadmap',
    summary: 'A plan used to exercise catalog mapping and progress behaviour.',
    focusAreas: [],
    tasks,
  }
}

test('every curated topic has mapping keywords and no stale keyword keys', () => {
  const topicKeys = roadmapDomains.flatMap((domain) =>
    domain.topics.map((topic) => `${domain.id}:${topic.id}`),
  )
  assert.deepEqual(Object.keys(CATALOG_TOPIC_KEYWORDS).sort(), topicKeys.sort())

  for (const key of topicKeys) {
    assert.ok(CATALOG_TOPIC_KEYWORDS[key].length > 0, key)
  }
})

test('maps recognizable AI tasks to curated topics and leaves unrelated tasks unmatched', () => {
  const plan = withCatalogTopicMatches(
    testPlan([
      testTask({
        id: 'it-master-dp',
        domainId: 'it',
        title: 'Master dynamic programming and graph traversal',
        description: 'Practise DP, BFS and DFS on interview-style problems.',
      }),
      testTask({
        id: 'hr-star-stories',
        domainId: 'hr',
        title: 'Prepare STAR stories for behavioural interviews',
        description: 'Build a small story bank with evidence-backed examples.',
      }),
      testTask({
        id: 'it-build-react-state',
        domainId: 'it',
        title: 'Build a React state management demo',
        description: 'Create a small component and test local state updates.',
      }),
    ]),
  )

  assert.equal(plan.tasks[0].catalogTopicId, 'algorithms-and-problem-solving')
  assert.equal(plan.tasks[1].catalogTopicId, 'star-story-bank')
  assert.equal(plan.tasks[2].catalogTopicId, null)
  assert.equal(getTaskCatalogTopic(plan.tasks[0])?.notes.length, 4)
  assert.equal(getTaskCatalogTopic(plan.tasks[2]), null)
})

test('catalog matching is one-to-one so progress keys cannot collide', () => {
  const plan = withCatalogTopicMatches(
    testPlan([
      testTask({
        id: 'it-system-design-a',
        domainId: 'it',
        title: 'Practice system design interviews',
        description: 'Design a scalable URL shortener.',
      }),
      testTask({
        id: 'it-system-design-b',
        domainId: 'it',
        title: 'Review system design fundamentals',
        description: 'Explain caching, queues and consistency trade-offs.',
      }),
    ]),
  )

  const mapped = plan.tasks.filter((task) => task.catalogTopicId === 'system-design-foundations')
  assert.equal(mapped.length, 1)
  assert.equal(planTaskProgressKey(plan.tasks[0]) === planTaskProgressKey(plan.tasks[1]), false)
})

test('fallback plan tasks map directly to their curated topics', () => {
  const plan = withCatalogTopicMatches(buildFallbackRoadmapPlan('Computer Science'))
  for (const task of plan.tasks) {
    assert.equal(task.catalogTopicId, task.id)
    assert.ok(getTaskCatalogTopic(task))
  }
})

test('task selection keeps the current task, otherwise picks the first incomplete task', () => {
  const tasks = [
    testTask({ id: 'first', domainId: 'it', title: 'First task' }),
    testTask({ id: 'second', domainId: 'it', title: 'Second task' }),
    testTask({ id: 'third', domainId: 'it', title: 'Third task' }),
  ]

  assert.equal(resolveSelectedTaskId(tasks, null, new Set()), 'first')
  assert.equal(resolveSelectedTaskId(tasks, 'second', new Set()), 'second')
  assert.equal(
    resolveSelectedTaskId(tasks, 'removed', new Set([planTaskProgressKey(tasks[0])])),
    'second',
  )
  assert.equal(
    resolveSelectedTaskId(tasks, 'removed', new Set(tasks.map(planTaskProgressKey))),
    'first',
  )
  assert.equal(resolveSelectedTaskId([], null, new Set()), null)
})

test('matched task completion survives regeneration while stale progress is only reported', () => {
  const before = withCatalogTopicMatches(
    testPlan([
      testTask({
        id: 'it-dp-old',
        domainId: 'it',
        title: 'Master dynamic programming',
        description: 'Practise DP patterns and recurrences.',
      }),
    ]),
  )
  const after = withCatalogTopicMatches(
    testPlan([
      testTask({
        id: 'it-dp-new',
        domainId: 'it',
        title: 'Practice dynamic programming patterns',
        description: 'Solve a new set of DP problems.',
      }),
    ]),
  )

  const carriedKey = planTaskProgressKey(before.tasks[0])
  assert.equal(carriedKey, progressKey('it', 'algorithms-and-problem-solving'))
  assert.deepEqual(planProgress(after, new Set([carriedKey])), {
    completed: 1,
    total: 1,
    percent: 100,
  })

  const unmatched = withCatalogTopicMatches(
    testPlan([
      testTask({
        id: 'it-react-demo',
        domainId: 'it',
        title: 'Build a React demo',
        description: 'Create a component with local state.',
      }),
    ]),
  )
  const unmatchedKey = planTaskProgressKey(unmatched.tasks[0])
  assert.equal(planTaskTopicId(unmatched.tasks[0]), 'it-react-demo')

  const savedKeys = new Set([carriedKey, unmatchedKey, progressKey('it', 'legacy-task')])
  assert.deepEqual(staleProgressKeys(after, savedKeys), [
    unmatchedKey,
    progressKey('it', 'legacy-task'),
  ])
  assert.equal(savedKeys.size, 3)
})

function topicResource(
  type: RoadmapTopicResource['type'],
  overrides: Partial<RoadmapTopicResource> = {},
): RoadmapTopicResource {
  const urls: Record<RoadmapTopicResource['type'], string> = {
    video: 'https://www.youtube.com/results?search_query=databases',
    roadmap: 'https://learn.microsoft.com/en-us/search/?terms=backend%20path',
    docs: 'https://developer.mozilla.org/en-US/search?q=sql',
    practice: 'https://www.khanacademy.org/search?page_search_query=sql',
  }
  return {
    domainId: 'it',
    topicId: 'databases-and-apis',
    type,
    title: `${type} suggestion`,
    description: `A ${type} resource for database practice.`,
    provider: 'Trusted provider',
    url: urls[type],
    verified: true,
    generatedAt: '2026-10-21T10:00:00.000Z',
    ...overrides,
  }
}

test('topic resources support exactly video, roadmap, docs and practice groups', () => {
  const resources = ROADMAP_TOPIC_RESOURCE_TYPES.map((type) => topicResource(type))
  const groups = groupRoadmapTopicResources(resources)

  assert.deepEqual(
    groups.map((group) => group.type),
    [...ROADMAP_TOPIC_RESOURCE_TYPES],
  )
  assert.deepEqual(groups.map((group) => group.resources.length), [1, 1, 1, 1])
  assert.equal(groups.find((group) => group.type === 'docs')?.label, 'Docs & reading')
  assert.deepEqual(groupRoadmapTopicResources([]).map((group) => group.resources.length), [0, 0, 0, 0])
})

test('topic resource verification requires both the server flag and a safe URL', () => {
  const video = topicResource('video')
  assert.equal(isVerifiedRoadmapTopicResource(video), true)
  assert.equal(
    isVerifiedRoadmapTopicResource({ ...video, url: 'https://evil.example/video' }),
    false,
  )
  assert.equal(
    isVerifiedRoadmapTopicResource({ ...video, url: 'javascript:alert(1)' }),
    false,
  )
  assert.equal(isVerifiedRoadmapTopicResource({ ...video, verified: false }), false)
})

test('topic resource parsing keeps four valid types and ignores malformed records', () => {
  const resources = ROADMAP_TOPIC_RESOURCE_TYPES.map((type) => topicResource(type))
  const parsed = asRoadmapTopicResources([
    ...resources,
    { ...resources[0], type: 'podcast' },
    { ...resources[0], topicId: 'UPPER' },
    { ...resources[0], title: '   ' },
    null,
  ])

  assert.equal(parsed.length, 4)
  assert.deepEqual(parsed.map((resource) => resource.type), [...ROADMAP_TOPIC_RESOURCE_TYPES])
  assert.deepEqual(asRoadmapTopicResources(null), [])
  assert.deepEqual(asRoadmapTopicResources('not-an-array'), [])
})
