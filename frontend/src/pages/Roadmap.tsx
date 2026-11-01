import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  Map as MapIcon,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Video,
} from 'lucide-react'
import { Badge, Button, Card, ProgressBar } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useInterviewAnalytics } from '../hooks/useInterviewAnalytics'
import { useRoadmapPlan } from '../hooks/useRoadmapPlan'
import { useRoadmapProgress } from '../hooks/useRoadmapProgress'
import { useRoadmapTopicResources } from '../hooks/useRoadmapTopicResources'
import { getRoadmapDomain, type RoadmapTopic } from '../data/roadmap'
import {
  buildFallbackRoadmapPlan,
  isSafeRoadmapResourceUrl,
  planProgress,
  planTaskProgressKey,
  planTaskTopicId,
  resolveSelectedTaskId,
  staleProgressKeys,
  type RoadmapPlanResource,
  type RoadmapPlanTask,
  type RoadmapResumeContext,
} from '../data/roadmap/plan'
import {
  getTaskCatalogTopic,
  withCatalogTopicMatches,
} from '../data/roadmap/taskMapping'
import {
  ROADMAP_TOPIC_RESOURCE_TYPE_LABELS,
  groupRoadmapTopicResources,
  isVerifiedRoadmapTopicResource,
  type RoadmapTopicResource,
  type RoadmapTopicResourceType,
} from '../data/roadmap/resources'
import { loadResumeAnalysis } from '../lib/resumeStore'

interface RoadmapProps {
  branch: string
}

function formatGeneratedAt(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function TaskRow({
  task,
  selected,
  completed,
  pending,
  progressReady,
  onSelect,
  onToggleCompleted,
}: {
  task: RoadmapPlanTask
  selected: boolean
  completed: boolean
  pending: boolean
  progressReady: boolean
  onSelect: () => void
  onToggleCompleted: () => void
}) {
  const domain = getRoadmapDomain(task.domainId)

  return (
    <div
      className={`flex items-start gap-3 border-b border-[var(--border)] px-4 py-4 last:border-b-0 transition-all-smooth ${
        selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]/50'
      }`}
    >
      <label
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] border-2 transition-all-smooth ${
          completed
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-[var(--border)] bg-[var(--surface)]'
        } ${!progressReady || pending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        title={progressReady ? undefined : 'Progress must load before tasks can be completed.'}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={completed}
          disabled={!progressReady || pending}
          aria-label={completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
          onChange={onToggleCompleted}
        />
        {pending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : completed ? (
          <Check size={13} strokeWidth={3} />
        ) : null}
      </label>

      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="min-w-0 flex-1 text-left cursor-pointer"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={`text-sm font-bold leading-snug ${
              completed ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'
            }`}
          >
            {task.title}
          </h3>
          <Badge className="!px-2 !py-0 !text-[10px]">{domain.shortLabel}</Badge>
          {task.catalogTopicId && (
            <Badge variant="info" className="!px-2 !py-0 !text-[10px]">
              Curated
            </Badge>
          )}
          {completed && <Badge variant="success">Done</Badge>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{task.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {task.estimatedMinutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <BookOpen size={11} /> {task.resources.length} resource{task.resources.length === 1 ? '' : 's'}
          </span>
        </div>
      </button>
    </div>
  )
}

function ResourceCard({ resource }: { resource: RoadmapPlanResource }) {
  const safe = isSafeRoadmapResourceUrl(resource.url)
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant="info">{resource.type}</Badge>
          <h3 className="mt-2 text-sm font-bold leading-snug text-[var(--text-primary)]">
            {resource.title}
          </h3>
        </div>
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-from)]">
          <ExternalLink size={14} />
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
        {resource.description}
      </p>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {resource.provider}
      </p>
    </>
  )

  if (!safe) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
        {content}
        <p className="mt-2 text-[10px] font-semibold text-amber-600">Link unavailable</p>
      </div>
    )
  }

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-all-smooth hover:border-[var(--accent-from)]/50 hover:shadow-[var(--shadow-sm)]"
    >
      {content}
      <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent-from)]">
        Open resource
        <ExternalLink size={11} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  )
}

function TopicResourceTypeIcon({ type }: { type: RoadmapTopicResourceType }) {
  if (type === 'video') return <Video size={14} />
  if (type === 'roadmap') return <MapIcon size={14} />
  if (type === 'docs') return <FileText size={14} />
  return <Pencil size={14} />
}

function TopicResourceCard({ resource }: { resource: RoadmapTopicResource }) {
  const usable = isVerifiedRoadmapTopicResource(resource)
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="info">
              {ROADMAP_TOPIC_RESOURCE_TYPE_LABELS[resource.type]}
            </Badge>
            {usable ? (
              <Badge variant="success" className="!px-2 !py-0 !text-[10px]">
                Verified provider
              </Badge>
            ) : (
              <Badge variant="warning" className="!px-2 !py-0 !text-[10px]">
                Unverified link
              </Badge>
            )}
          </div>
          <h5 className="mt-2 text-xs font-bold leading-snug text-[var(--text-primary)]">
            {resource.title}
          </h5>
        </div>
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-from)]">
          {usable ? <ExternalLink size={14} /> : <ShieldCheck size={14} />}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
        {resource.description}
      </p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {resource.provider}
      </p>
    </>
  )

  if (!usable) {
    return (
      <div className="rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 p-3">
        {content}
        <p className="mt-2 text-[10px] font-semibold text-amber-600">
          This link failed verification and cannot be opened. Refresh the resources to try again.
        </p>
      </div>
    )
  }

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 transition-all-smooth hover:border-[var(--accent-from)]/50 hover:shadow-[var(--shadow-sm)]"
    >
      {content}
      <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--accent-from)]">
        Open resource
        <ExternalLink size={10} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  )
}

function TopicLearningResources({
  domainId,
  topicId,
}: {
  domainId: RoadmapPlanTask['domainId']
  topicId: string
}) {
  const state = useRoadmapTopicResources(domainId, topicId)
  const groups = groupRoadmapTopicResources(state.resources)
  const hasResources = state.resources.length > 0
  const generatedLabel = formatGeneratedAt(state.generatedAt)

  return (
    <div className="mt-6 border-t border-[var(--border)] pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[var(--accent-from)]" />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
              AI learning resources
            </h4>
            {hasResources && (
              <Badge className="!px-2 !py-0 !text-[10px]">{state.resources.length}</Badge>
            )}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
            One video, roadmap, docs and practice suggestion for this topic.
          </p>
          {generatedLabel && (
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
              Generated {generatedLabel}
            </p>
          )}
        </div>
        {!state.loading && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { void state.generate() }}
            loading={state.generating}
            disabled={state.generating}
          >
            {!state.generating && <RefreshCw size={13} />}
            {state.generating
              ? 'Generating…'
              : hasResources
                ? 'Refresh resources'
                : 'Generate resources'}
          </Button>
        )}
      </div>

      {state.error && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/5 p-3">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-[var(--text-primary)]">
              Resource request failed
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {state.error}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={state.reload}>
            Reload
          </Button>
        </div>
      )}

      {(!state.storageAvailable || !state.persisted) && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 p-3">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {state.storageAvailable
              ? 'These resources could not be saved and may disappear after a refresh. Retry generation.'
              : 'Learning-resource storage is not configured. Apply the roadmap-resources migration to save these suggestions.'}
          </p>
        </div>
      )}

      {state.loading ? (
        <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-xs font-semibold text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading saved resources
        </div>
      ) : hasResources ? (
        <div className="mt-3 space-y-4">
          {groups.map((group) => (
            <div key={group.type}>
              <div className="flex items-center gap-2">
                <span className="text-[var(--accent-from)]">
                  <TopicResourceTypeIcon type={group.type} />
                </span>
                <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                  {group.label}
                </h5>
                <Badge className="!px-2 !py-0 !text-[10px]">{group.resources.length}</Badge>
              </div>
              {group.resources.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {group.resources.map((resource) => (
                    <TopicResourceCard key={`${group.type}-${resource.url}`} resource={resource} />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                  No {group.label.toLowerCase()} suggestion is stored for this topic.
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs font-bold text-[var(--text-primary)]">
            No AI learning resources yet
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            Generate four topic-specific suggestions: a video, a learning roadmap, docs or reading,
            and practice material. Repeated generation replaces the same four slots instead of adding
            duplicates.
          </p>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
        AI selects the title and search query. Links are built by the server from trusted provider
        domains, so they are marked “Verified provider”; review the destination before relying on
        its content.
      </p>
    </div>
  )
}

function difficultyVariant(
  difficulty: RoadmapTopic['practice'][number]['difficulty'],
): 'success' | 'warning' | 'error' {
  if (difficulty === 'Easy') return 'success'
  if (difficulty === 'Medium') return 'warning'
  return 'error'
}

function CuratedStudyMaterial({ topic }: { topic: RoadmapTopic }) {
  return (
    <div>
      <div className="mt-5">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-[var(--accent-from)]" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
            Study notes
          </h4>
        </div>
        <div className="mt-3 space-y-2.5">
          {topic.notes.map((note, index) => (
            <div key={`${topic.id}-note-${index}`} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent-from)]" />
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-[var(--accent-from)]" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
            Worked example
          </h4>
        </div>
        <h5 className="mt-2 text-sm font-bold leading-snug text-[var(--text-primary)]">
          {topic.example.title}
        </h5>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
          {topic.example.body}
        </p>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2">
          <ListChecks size={15} className="text-[var(--accent-from)]" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
            Practice questions
          </h4>
          <Badge className="!px-2 !py-0 !text-[10px]">{topic.practice.length}</Badge>
        </div>
        <div className="mt-3 space-y-2.5">
          {topic.practice.map((question) => (
            <details
              key={`${topic.id}-${question.id}`}
              className="group rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold leading-relaxed text-[var(--text-primary)]">
                    {question.prompt}
                  </p>
                  <Badge variant={difficultyVariant(question.difficulty)} className="!px-2 !py-0 !text-[10px]">
                    {question.difficulty}
                  </Badge>
                </div>
                <span className="mt-2 inline-block text-[10px] font-bold text-[var(--accent-from)] group-open:hidden">
                  Show answer
                </span>
                <span className="mt-2 hidden text-[10px] font-bold text-[var(--accent-from)] group-open:inline-block">
                  Hide answer
                </span>
              </summary>
              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Answer
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {question.answer}
                </p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Why this matters
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {question.explanation}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}

function StudyMaterials({ task }: { task: RoadmapPlanTask | null }) {
  const domain = task ? getRoadmapDomain(task.domainId) : null
  const catalogTopic = task ? getTaskCatalogTopic(task) : null

  return (
    <Card className="overflow-hidden lg:sticky lg:top-6">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-[var(--accent-from)]" />
          <h2 className="text-sm font-extrabold text-[var(--text-primary)]">Study Materials</h2>
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {task
            ? catalogTopic
              ? 'Curated notes, worked example, AI learning resources and practice.'
              : 'External resources for this AI task.'
            : 'Select a task to see its study materials.'}
        </p>
      </div>

      {!task || !domain ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <BookOpen size={24} className="mb-2 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No task selected</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Choose a task from your checklist.</p>
        </div>
      ) : (
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{domain.shortLabel}</Badge>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)]">
              <Clock size={11} /> {task.estimatedMinutes} min
            </span>
            {catalogTopic && <Badge variant="info">Curated guide</Badge>}
          </div>
          <h3 className="mt-3 text-lg font-extrabold leading-snug text-[var(--text-primary)]">
            {task.title}
          </h3>
          {catalogTopic && catalogTopic.title !== task.title && (
            <p className="mt-1 text-[11px] font-semibold text-[var(--accent-from)]">
              Catalog topic: {catalogTopic.title}
            </p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {task.description}
          </p>

          {catalogTopic ? (
            <>
              <CuratedStudyMaterial topic={catalogTopic} />
              <TopicLearningResources domainId={task.domainId} topicId={catalogTopic.id} />
            </>
          ) : (
            <div className="mt-5 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    No curated catalog match yet
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                    This AI task does not map closely enough to one of the curated topics. Use the
                    external resources below, or pick a related curated task from the roadmap.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-center gap-2">
              <ExternalLink size={15} className="text-[var(--accent-from)]" />
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                External resources
              </h4>
              <Badge className="!px-2 !py-0 !text-[10px]">{task.resources.length}</Badge>
            </div>
            {task.resources.length === 0 ? (
              <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
                No safe external links were provided for this task. Use the task description above and
                ask your placement mentor for a specific resource.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {task.resources.map((resource, index) => (
                  <ResourceCard key={`${resource.url}-${index}`} resource={resource} />
                ))}
              </div>
            )}
          </div>

          <p className="mt-4 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Links open trusted learning providers in a new tab. Content, pricing and availability are
            controlled by each provider.
          </p>
        </div>
      )}
    </Card>
  )
}

export default function Roadmap({ branch }: RoadmapProps) {
  const { user } = useAuth()
  const progress = useRoadmapProgress()
  const analytics = useInterviewAnalytics('all')
  const planState = useRoadmapPlan()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const fallbackPlan = useMemo(
    () => buildFallbackRoadmapPlan(branch, analytics.data?.byDomain ?? []),
    [branch, analytics.data],
  )
  const plan = useMemo(
    () => withCatalogTopicMatches(planState.plan ?? fallbackPlan),
    [planState.plan, fallbackPlan],
  )
  const overall = planProgress(plan, progress.completedKeys)
  const staleCount = useMemo(
    () => staleProgressKeys(plan, progress.completedKeys).length,
    [plan, progress.completedKeys],
  )
  const selectedTask =
    plan.tasks.find((task) => task.id === selectedTaskId) ?? plan.tasks[0] ?? null
  const generatedLabel = formatGeneratedAt(planState.generatedAt)
  const planIsAi = plan.source === 'ai'

  useEffect(() => {
    setSelectedTaskId((current) =>
      resolveSelectedTaskId(plan.tasks, current, progress.completedKeys),
    )
  }, [plan, progress.completedKeys])

  const handleGenerate = async () => {
    const stored = user ? loadResumeAnalysis(user.id) : null
    let context: RoadmapResumeContext | null = null

    if (stored) {
      const seen = new Set<string>()
      const skills: string[] = []
      for (const skill of [...stored.analysis.technicalSkills, ...stored.analysis.softSkills]) {
        const trimmed = skill.trim()
        const key = trimmed.toLowerCase()
        if (!trimmed || seen.has(key)) continue
        seen.add(key)
        skills.push(trimmed)
        if (skills.length >= 20) break
      }
      const jobTitle = stored.jobTitle.trim()
      context = {
        targetRole: jobTitle || null,
        jobTitle: jobTitle || null,
        skills,
      }
    }

    await planState.generate(context)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Learning Roadmap</h1>
            <Badge variant={planIsAi ? 'success' : 'default'}>
              {planIsAi ? 'AI personalized' : 'Starter plan'}
            </Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
            {plan.summary}
          </p>
          {plan.focusAreas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {plan.focusAreas.map((area) => (
                <span
                  key={area}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]"
                >
                  {area}
                </span>
              ))}
            </div>
          )}
        </div>

        <Button onClick={() => { void handleGenerate() }} disabled={planState.generating} loading={planState.generating}>
          {!planState.generating && <Sparkles size={15} />}
          {planState.generating
            ? 'Building your plan…'
            : planIsAi
              ? 'Regenerate plan'
              : 'Generate AI plan'}
        </Button>
      </div>

      {planState.error && (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle size={17} className="mt-0.5 flex-shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--text-primary)]">Roadmap generation failed</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              {planState.error} Your current plan is still available.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={planState.clearError}>Dismiss</Button>
        </div>
      )}

      {planIsAi && !planState.persisted && (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertCircle size={17} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            This plan was generated but could not be saved. Apply the roadmap AI-plan migration to keep
            it after a refresh.
          </p>
        </div>
      )}

      {!planState.storageAvailable && !planIsAi && (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertCircle size={17} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            AI plan storage is not configured yet. You can still generate a plan, but it will last only
            for this visit until the migration is applied.
          </p>
        </div>
      )}

      {progress.error && (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle size={17} className="mt-0.5 flex-shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--text-primary)]">Progress could not be loaded</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              {progress.error} Completion controls stay disabled until progress loads.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={progress.reload}>
            <RefreshCw size={13} /> Retry
          </Button>
        </div>
      )}

      {progress.mutationError && (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertCircle size={17} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            {progress.mutationError}
          </p>
          <Button variant="ghost" size="sm" onClick={progress.clearMutationError}>Dismiss</Button>
        </div>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Overall progress
            </p>
            <div className="mt-1 flex items-end gap-2">
              <p className="text-3xl font-extrabold leading-none gradient-text">{overall.percent}%</p>
              <p className="pb-0.5 text-xs font-semibold text-[var(--text-muted)]">
                {overall.completed} of {overall.total} tasks complete
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              {planState.loading ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
                  <Loader2 size={12} className="animate-spin" /> Checking saved plan
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
                  <Target size={12} /> {planIsAi ? 'Based on your profile' : 'Branch-aware starter'}
                </span>
              )}
            </div>
            {generatedLabel && (
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">Generated {generatedLabel}</p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <ProgressBar value={overall.percent} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {progress.loading
            ? 'Loading saved completion from your account.'
            : overall.completed === 0
              ? 'Tick a task when you finish it. Completion is saved to your account.'
              : 'Completed tasks are saved and survive a refresh. Regenerating may change the checklist, but saved completions are never deleted.'}
        </p>
      </Card>

      {progress.ready && staleCount > 0 && (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-blue-500/20 bg-blue-500/5 p-4">
          <RefreshCw size={17} className="mt-0.5 flex-shrink-0 text-blue-500" />
          <p className="flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            {staleCount} saved completion{staleCount === 1 ? '' : 's'} from an earlier roadmap no
            longer match{staleCount === 1 ? 'es' : ''} this checklist. They are still saved to your
            account and are not counted here; regenerating never deletes progress.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[var(--accent-from)]" />
                <h2 className="text-sm font-extrabold text-[var(--text-primary)]">My Roadmap</h2>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Select a task to see its study materials.
              </p>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent-from)]">
              {overall.completed}/{overall.total}
            </span>
          </div>

          <div>
            {plan.tasks.map((task) => {
              const key = planTaskProgressKey(task)
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={task.id === selectedTask?.id}
                  completed={progress.completedKeys.has(key)}
                  pending={progress.pendingKeys.has(key)}
                  progressReady={progress.ready}
                  onSelect={() => setSelectedTaskId(task.id)}
                  onToggleCompleted={() => {
                    void progress.setCompleted(
                      task.domainId,
                      planTaskTopicId(task),
                      !progress.completedKeys.has(key),
                    )
                  }}
                />
              )
            })}
          </div>
        </Card>

        <StudyMaterials task={selectedTask} />
      </div>
    </div>
  )
}
