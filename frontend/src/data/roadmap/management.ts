import type { RoadmapDomain } from './types'

export const managementDomain: RoadmapDomain = {
  id: 'management',
  title: 'Management / Business',
  shortLabel: 'Management',
  description: 'Prioritize work, read business metrics, improve operations, and communicate decisions clearly.',
  accent: '#0ea5e9',
  topics: [
    {
      id: 'prioritisation-and-tradeoffs',
      title: 'Prioritisation and trade-offs',
      summary: 'Choose what to do first using explicit criteria, dependencies, and the cost of delay.',
      estimatedMinutes: 35,
      notes: [
        'Prioritisation is a resource-allocation decision, not a list of good ideas. Start with the objective, constraints, and time horizon. If everything is important, the team has not defined what it is optimizing.',
        'Impact/effort is simple but can hide uncertainty. RICE adds reach, impact, confidence, and effort: score = (reach × impact × confidence) / effort. The number is not truth; it forces assumptions into the open so they can be challenged.',
        'Dependencies and sequencing matter. A lower-value foundational task may need to happen before a high-value feature can ship. Opportunity cost is the value of the best alternative not chosen.',
        'Prefer reversible decisions where possible. A reversible experiment can be run quickly and stopped; an irreversible commitment deserves more analysis. This reduces the cost of learning without ignoring high-stakes choices.',
      ],
      example: {
        title: 'Comparing two initiatives with RICE',
        body: 'Initiative A reaches 2,000 users, has impact 2, confidence 0.8, and effort 4: (2000 × 2 × 0.8)/4 = 800. Initiative B reaches 800 users, has impact 3, confidence 0.5, and effort 2: (800 × 3 × 0.5)/2 = 600. A scores higher, but the confidence estimates should be tested before committing the full team.',
      },
      practice: [
        {
          id: 'rice-confidence',
          prompt: 'Why is the confidence term important in a RICE score?',
          difficulty: 'Easy',
          answer: 'It prevents uncertain ideas from looking as attractive as well-supported ones with similar reach, impact, and effort.',
          explanation: 'Without confidence, a speculative large-reach idea can dominate. The score should be a conversation tool, not a substitute for judgment or validation.',
        },
        {
          id: 'opportunity-cost',
          prompt: 'What is opportunity cost when choosing a project?',
          difficulty: 'Easy',
          answer: 'It is the value of the best alternative that is given up because the team chooses this project instead.',
          explanation: 'A project can look positive in isolation while still being the wrong choice if a better use of the same people and time is available.',
        },
      ],
    },
    {
      id: 'metrics-and-business-cases',
      title: 'Metrics and business cases',
      summary: 'Connect product activity to outcomes, test assumptions, and build a business case that can be defended.',
      estimatedMinutes: 40,
      notes: [
        'A north-star metric represents the value customers receive and the business wants to grow. Supporting metrics explain the mechanism. Avoid vanity metrics that rise without improving the outcome.',
        'A funnel shows where users drop between steps. Segmenting by cohort, channel, or customer type prevents a blended average from hiding a failing group. Compare rates and distributions, not only totals.',
        'Unit economics describe the economics of one customer or unit: revenue, variable cost, contribution margin, acquisition cost, retention, and lifetime value. Payback period is acquisition cost divided by monthly contribution per customer.',
        'A business case states the problem, proposed option, expected benefits, costs, risks, assumptions, and decision criteria. Sensitivity analysis shows which assumptions most affect the result. A precise forecast built on an untested assumption is still fragile.',
      ],
      example: {
        title: 'Customer acquisition payback',
        body: 'If acquiring a customer costs ₹1,200 and the monthly contribution margin is ₹150, the simple payback period is 1,200/150 = 8 months. If retention usually ends before 8 months, the channel may not be viable without reducing acquisition cost or improving contribution margin.',
      },
      practice: [
        {
          id: 'north-star-purpose',
          prompt: 'What makes a good north-star metric?',
          difficulty: 'Medium',
          answer: 'It should reflect delivered customer value, connect to sustainable business value, and be influenceable by the team without being trivially gamed.',
          explanation: 'The metric should guide trade-offs rather than reward local activity. It usually needs supporting metrics for quality, retention, and guardrails.',
        },
        {
          id: 'cohort-analysis',
          prompt: 'Why can a blended retention rate hide a serious problem?',
          difficulty: 'Easy',
          answer: 'Growth in a new, poorly retained cohort can be masked by strong historical cohorts, so the overall average stays high while recent behavior worsens.',
          explanation: 'Cohort analysis follows groups by signup period or channel. It reveals whether retention is changing and which segments are responsible.',
        },
      ],
    },
    {
      id: 'operations-and-process-improvement',
      title: 'Operations and process improvement',
      summary: 'Find bottlenecks, measure flow, and improve a process without optimizing the wrong step.',
      estimatedMinutes: 35,
      notes: [
        'A process has capacity, cycle time, throughput, work in progress, and quality. Improving a non-bottleneck step does not increase total throughput if the bottleneck remains unchanged. Find the constraint first.',
        'Little law relates average work in progress (WIP), throughput, and cycle time: cycle time = WIP / throughput when the system is stable. If 20 items are in progress and 5 finish per day, average cycle time is about 4 days.',
        'Reducing WIP often reduces cycle time and exposes problems that were hidden by queues. Standard work, clear handoffs, and visual limits make variation visible. Quality defects at one step create rework that consumes capacity downstream.',
        'Improvement should be measured against a baseline. Plan a change, run it, check the result, and standardize what works. An SLA is a commitment about service levels; it needs monitoring, escalation, and a definition of what counts as met.',
      ],
      example: {
        title: 'Bottleneck analysis',
        body: 'A support process receives 100 tickets per day. Triage can handle 140, investigation 90, and resolution 120. Investigation is the bottleneck, so adding capacity only to triage will increase queues, not completed tickets. The team should reduce investigation time, shift work, or add trained investigators.',
      },
      practice: [
        {
          id: 'little-law',
          prompt: 'A stable team has 30 items in progress and completes 6 per day. What is the approximate average cycle time?',
          difficulty: 'Easy',
          answer: 'About 5 days, using cycle time = WIP / throughput = 30/6.',
          explanation: 'The relationship is an average for a stable system. It shows that reducing WIP is one way to reduce waiting time without changing throughput.',
        },
        {
          id: 'bottleneck',
          prompt: 'Why is optimizing a non-bottleneck step usually ineffective?',
          difficulty: 'Medium',
          answer: 'The bottleneck still limits total output, so extra capacity elsewhere only creates more waiting work in front of the constraint.',
          explanation: 'Throughput is set by the constraint. Improvement should first increase bottleneck capacity or reduce demand on it, then re-evaluate the new constraint.',
        },
      ],
    },
    {
      id: 'stakeholder-communication',
      title: 'Stakeholder communication and decisions',
      summary: 'Explain trade-offs to different audiences and create decisions that people can act on.',
      estimatedMinutes: 30,
      notes: [
        'Start with the decision or recommendation, then give the supporting reasons. Executives and busy stakeholders usually need the conclusion first and detail second, not a chronological replay of the analysis.',
        'Translate technical trade-offs into user, cost, risk, and time consequences. Avoid unexplained jargon, but do not hide uncertainty. A simple statement of what is known, what is assumed, and what would change the recommendation is more credible than false precision.',
        'When stakeholders disagree, separate the shared goal from the proposed solution. Ask what evidence would change each person view. Present options with explicit trade-offs instead of framing the discussion as one correct answer against a wrong one.',
        'Record important decisions, owners, dates, and consequences. A short decision record prevents the same debate from recurring and makes it clear when an assumption has changed. Communication is complete only when the audience knows what happens next.',
      ],
      example: {
        title: 'A one-page decision memo',
        body: 'State the decision needed, the recommendation, the two strongest alternatives, the key costs and risks, and the deadline. Add the evidence that supports the recommendation and the condition that would trigger a review. This format respects the reader time and makes disagreement specific.',
      },
      practice: [
        {
          id: 'conclusion-first',
          prompt: 'Why is a conclusion-first structure usually better for a busy stakeholder?',
          difficulty: 'Easy',
          answer: 'It lets the reader understand the recommendation and decision quickly, then choose how much supporting detail to read.',
          explanation: 'Chronological narratives can bury the point. A clear recommendation with structured evidence is easier to evaluate and act on.',
        },
        {
          id: 'disagreement-evidence',
          prompt: 'What is a productive way to handle a stakeholder who rejects a well-supported recommendation?',
          difficulty: 'Medium',
          answer: 'Clarify the shared goal, surface the assumptions or values behind the disagreement, and ask what evidence would change their view. Then present a bounded next step or test.',
          explanation: 'Treating the disagreement as a factual dispute when it is really about priorities or risk appetite leads to repeated arguments. Make the trade-off explicit and record the decision.',
        },
      ],
    },
  ],
}
