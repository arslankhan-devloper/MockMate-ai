import type { RoadmapDomain } from './types'

export const hrDomain: RoadmapDomain = {
  id: 'hr',
  title: 'HR / Behavioral',
  shortLabel: 'HR / Behavioral',
  description: 'Build credible stories, communicate motivation, and handle interpersonal questions with evidence and self-awareness.',
  accent: '#10b981',
  topics: [
    {
      id: 'star-story-bank',
      title: 'Building a STAR story bank',
      summary: 'Prepare a small set of specific, evidence-backed stories that can answer many behavioral questions.',
      estimatedMinutes: 35,
      notes: [
        'STAR stands for Situation, Task, Action, Result. Spend most of the answer on the actions you personally took. The situation should be just enough context, and the result should show the outcome rather than ending at what the team planned.',
        'Prepare five or six stories covering teamwork, conflict, failure, ownership, ambiguity, and a technical challenge. The same story can answer different questions if you change the emphasis, but the facts must remain consistent.',
        'Use concrete details: the constraint, the decision you made, the trade-off, and the measurable result. If you do not have a hard metric, use a verifiable outcome such as reduced cycle time, fewer defects, or a successful launch.',
        'Never invent a result or claim sole credit for team work. Interviewers often probe follow-up details, and inconsistent stories damage trust more than an imperfect but honest example.',
      ],
      example: {
        title: 'A compact STAR answer',
        body: 'Situation: a campus project was slipping because two teams used different data formats. Task: I owned the integration. Action: I documented the contract, wrote a converter, and ran a joint test with both teams. Result: the handoff worked on the first integration run and the team avoided a two-day rework cycle. The answer stays focused on the specific action and the result.',
      },
      practice: [
        {
          id: 'star-result',
          prompt: 'What makes the Result part of a STAR answer credible?',
          difficulty: 'Easy',
          answer: 'A specific, verifiable outcome tied to the action you took, with a metric or observable change when possible.',
          explanation: 'A vague claim such as "it went well" is weak. A result such as "reduced failed handoffs from three to zero in the next sprint" is easier to believe and discuss.',
        },
        {
          id: 'star-no-metrics',
          prompt: 'What should you do if you do not have a numeric metric for a story?',
          difficulty: 'Easy',
          answer: 'Use a concrete, verifiable outcome and explain how you knew it improved. Do not invent a number.',
          explanation: 'Qualitative evidence can still be strong: a launch completed, a defect reproduced and fixed, or a stakeholder approving a decision after a review. Honesty is more important than sounding quantitative.',
        },
      ],
    },
    {
      id: 'self-introduction-and-motivation',
      title: 'Self-introduction and motivation',
      summary: 'Give a concise, role-relevant introduction and explain why this role and organization make sense for you.',
      estimatedMinutes: 30,
      notes: [
        'A useful introduction follows present, past, future. Start with who you are and the role you are targeting, then give the experiences that support it, and finish with why this opportunity is the logical next step.',
        'Keep it to roughly 60 to 90 seconds unless asked for more. Select two or three relevant experiences rather than listing every project. Connect your skills to the work the role actually does.',
        'Research the organization enough to be specific: its products, customers, engineering challenges, or recent work. A generic statement about innovation can be made about any company and therefore signals little.',
        'Motivation should be honest and role-specific. It is fine to value learning, impact, or a particular problem domain, but explain the connection to this role rather than giving a rehearsed speech.',
      ],
      example: {
        title: 'A role-focused introduction',
        body: 'I am a final-year computer science student who enjoys building reliable backend systems. In my last project I designed the API and database for a campus event platform, which taught me how to handle permissions and failure cases. I am looking for a role where I can deepen that experience while working on products used by real customers, which is why this backend position and your focus on reliable payments stood out to me.',
      },
      practice: [
        {
          id: 'intro-length',
          prompt: 'Why should a self-introduction usually be shorter than two minutes?',
          difficulty: 'Easy',
          answer: 'It should give the interviewer a clear frame and invite follow-up questions, not deliver your entire resume.',
          explanation: 'A concise introduction leaves room for dialogue and lets you go deeper where the interviewer is interested. Long introductions often repeat information already visible on the resume.',
        },
        {
          id: 'specific-motivation',
          prompt: 'How can you make your motivation for a company sound genuine?',
          difficulty: 'Medium',
          answer: 'Connect a specific product, problem, or working practice to your own experience and the role, and explain why it matters to you.',
          explanation: 'Specific research makes the answer credible. Avoid claims that could apply to every company, and do not pretend to have experience you do not have.',
        },
      ],
    },
    {
      id: 'conflict-and-teamwork',
      title: 'Conflict, teamwork, and influence',
      summary: 'Show that you can disagree productively, listen, and move a team toward a decision without avoiding the issue.',
      estimatedMinutes: 35,
      notes: [
        'Conflict is not automatically a failure. The interviewer wants to see how you separate the problem from the person, seek facts, and choose a path. Avoid stories where you were simply right and everyone else was unreasonable.',
        'Start with a direct, private conversation. Describe the impact and ask for the other person perspective before proposing a solution. If the disagreement is about priorities or technical direction, make the trade-off explicit and agree on the decision owner.',
        'Use evidence rather than labels. "The build failed three times after this change" is more useful than "you are careless." Focus on what can be changed and what the team learned.',
        'Escalate when the issue affects delivery, safety, or repeated behavior and the direct conversation has not resolved it. Escalation should be about getting a decision or support, not about winning.',
      ],
      example: {
        title: 'Disagreement about a release',
        body: 'A teammate wanted to ship a feature without a rollback plan. I asked to review the failure modes together, documented the two risks, and proposed a smaller release with a feature flag. We agreed on the smaller release, shipped on time, and avoided a risky full rollout. The result came from making the trade-off visible, not from escalating first.',
      },
      practice: [
        {
          id: 'conflict-first-step',
          prompt: 'What is a good first step when you disagree with a teammate about a technical decision?',
          difficulty: 'Easy',
          answer: 'Discuss it directly and privately, clarify the shared goal, and compare the evidence and trade-offs before escalating.',
          explanation: 'A direct conversation preserves trust and often surfaces missing information. Escalation is appropriate when the issue remains unresolved or has broader risk.',
        },
        {
          id: 'escalation-purpose',
          prompt: 'When is escalation appropriate in a team conflict?',
          difficulty: 'Medium',
          answer: 'When direct discussion has not resolved a delivery, safety, or repeated-behavior issue, or when a decision owner is needed.',
          explanation: 'Escalation should seek a decision or support, not punish the other person. Bring the facts, the options, and the impact rather than a personal complaint.',
        },
      ],
    },
    {
      id: 'failure-and-growth',
      title: 'Failure, feedback, and growth',
      summary: 'Discuss a real mistake with accountability and show the specific behavior you changed afterward.',
      estimatedMinutes: 30,
      notes: [
        'Choose a real failure that has a clear lesson and is safe to discuss. Avoid humblebrags such as "I cared too much" or blaming circumstances entirely. The interviewer is assessing accountability and learning, not looking for a perfect record.',
        'Explain what you expected, what happened, and what you did when you noticed. Distinguish the decision that was wrong from the outcome that was unlucky. Take responsibility for what was yours without accepting blame for everything.',
        'Describe the correction and the change you made afterward. A lesson is credible when it appears in later behavior: a new review step, a smaller experiment, a clearer escalation, or a different way of estimating.',
        'Feedback is useful when you can restate it accurately and act on it. Avoid defending immediately. Ask for an example, separate intent from impact, and decide what to try next.',
      ],
      example: {
        title: 'A missed deadline and the change that followed',
        body: 'I underestimated a data migration because I planned only for the happy path. When validation failures appeared, the deadline slipped. I told the team early, documented the failure modes, and added a dry-run and rollback check to the plan. On the next migration we caught two issues before production. The lesson was not "work harder"; it was to estimate and test failure paths explicitly.',
      },
      practice: [
        {
          id: 'failure-humblebrag',
          prompt: 'Why is "I work too hard" a weak answer to a failure question?',
          difficulty: 'Easy',
          answer: 'It avoids a real mistake and gives no evidence of accountability or changed behavior.',
          explanation: 'Interviewers hear it as a rehearsed strength. A genuine failure with a concrete correction demonstrates self-awareness and learning.',
        },
        {
          id: 'feedback-response',
          prompt: 'How should you respond when a teammate gives you difficult feedback?',
          difficulty: 'Medium',
          answer: 'Listen without immediately defending, ask for a specific example, restate what you understood, and agree on a concrete change or follow-up.',
          explanation: 'The goal is to understand impact and improve behavior. Separating intent from impact makes the conversation more useful and less personal.',
        },
      ],
    },
  ],
}
