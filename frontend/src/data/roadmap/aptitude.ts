import type { RoadmapDomain } from './types'

export const aptitudeDomain: RoadmapDomain = {
  id: 'aptitude',
  title: 'Aptitude',
  shortLabel: 'Aptitude',
  description: 'Sharpen quantitative, reasoning, and data-interpretation skills with reliable methods rather than shortcuts.',
  accent: '#ef4444',
  topics: [
    {
      id: 'percentages-ratios',
      title: 'Percentages and ratios',
      summary: 'Identify the correct base, combine percentage changes multiplicatively, and convert ratios into concrete quantities.',
      estimatedMinutes: 30,
      notes: [
        'A percentage is always relative to a base. A 20% discount means the final price is 80% of the original, not that the discount equals 20% of the final price. Write the base explicitly before calculating.',
        'Successive percentage changes multiply rather than add. A 20% increase followed by a 20% decrease gives 1.20 × 0.80 = 0.96, a net 4% decrease. The second change applies to the new value, not the original.',
        'To reverse a percentage change, divide by the multiplier. If a price after a 20% discount is 1,800, the original is 1,800/0.80 = 2,250. Adding 20% to 1,800 would be wrong because the base is different.',
        'Ratios describe relative parts. If two quantities are in the ratio 3:4 and their total is 63, there are 7 parts, each worth 9, so the quantities are 27 and 36. Keep units consistent when converting a ratio into real amounts.',
      ],
      example: {
        title: 'Original price after a discount',
        body: 'A shirt costs ₹1,800 after a 20% discount. The discounted price is 80% of the original, so original × 0.80 = 1,800. Dividing gives original = ₹2,250. The discount was ₹450, which is 20% of ₹2,250.',
      },
      practice: [
        {
          id: 'successive-percent',
          prompt: 'A price increases by 20% and then decreases by 20%. What is the net change?',
          difficulty: 'Easy',
          answer: 'A 4% decrease, because 1.20 × 0.80 = 0.96.',
          explanation: 'The decrease applies to the increased price. Adding and subtracting 20% would incorrectly give no change.',
        },
        {
          id: 'ratio-total',
          prompt: 'Two amounts are in the ratio 3:4 and their total is 63. What are the amounts?',
          difficulty: 'Easy',
          answer: '27 and 36.',
          explanation: 'The ratio has 7 equal parts, so each part is 63/7 = 9. The amounts are 3 × 9 and 4 × 9.',
        },
      ],
    },
    {
      id: 'time-speed-work',
      title: 'Time, speed, and work',
      summary: 'Use unit-consistent rates and combined-work equations to solve motion and work problems reliably.',
      estimatedMinutes: 35,
      notes: [
        'Convert speed units before mixing them. To convert km/h to m/s, multiply by 5/18; to convert m/s to km/h, multiply by 18/5. A train crossing a pole travels its own length; crossing a platform travels train length plus platform length.',
        'For relative motion, add speeds when moving in opposite directions and subtract when moving in the same direction. Set up the equation around the distance that actually changes.',
        'Work problems are rate problems. If A finishes a job in 10 days, the rate is 1/10 job per day. Combined rates add: 1/10 + 1/15 = 1/6, so together they take 6 days. Do not average the completion times.',
        'Pipes and cisterns follow the same logic, with filling rates positive and draining rates negative. Check that the units and the job size are consistent before solving.',
      ],
      example: {
        title: 'Two pipes filling a tank',
        body: 'Pipe A fills a tank in 12 hours, so its rate is 1/12 tank per hour. Pipe B takes 18 hours, so its rate is 1/18. Together the rate is 1/12 + 1/18 = 3/36 + 2/36 = 5/36 tank per hour. The time is 36/5 = 7.2 hours, or 7 hours 12 minutes.',
      },
      practice: [
        {
          id: 'train-pole',
          prompt: 'A 120 m train travels at 54 km/h. How long does it take to pass a pole?',
          difficulty: 'Easy',
          answer: '8 seconds.',
          explanation: '54 km/h = 54 × 5/18 = 15 m/s. Passing a pole means covering the train length: 120/15 = 8 seconds.',
        },
        {
          id: 'combined-work',
          prompt: 'A can finish a task in 10 days and B in 15 days. How long will they take working together?',
          difficulty: 'Medium',
          answer: '6 days.',
          explanation: 'Their combined rate is 1/10 + 1/15 = 1/6 task per day, so the reciprocal gives 6 days. Averaging 10 and 15 would be incorrect.',
        },
      ],
    },
    {
      id: 'logical-reasoning',
      title: 'Logical reasoning',
      summary: 'Separate what must be true from what merely could be true, and justify each conclusion with a rule.',
      estimatedMinutes: 35,
      notes: [
        'Number series often use differences, ratios, alternating patterns, or squares and cubes. Check the differences first, then the second differences, before assuming a more complex rule.',
        'In syllogisms, a conclusion is valid only if it must follow from the premises. "All A are B" and "some B are C" does not imply "some A are C." Draw the smallest possible sets that satisfy the premises and look for a counterexample.',
        'Arrangement puzzles are easier with a table or diagram. Record fixed positions, eliminate impossible options, and propagate each clue. Do not assume an unstated ordering.',
        'For assumptions and conclusions, identify the evidence and the claim separately. A conclusion can be plausible but unsupported. The question is usually about the strength of the link, not your personal agreement.',
      ],
      example: {
        title: 'Finding the next term',
        body: 'For 2, 6, 12, 20, 30, the first differences are 4, 6, 8, 10. The differences increase by 2, so the next difference is 12 and the next term is 42. Writing the differences explicitly is faster and safer than guessing a formula.',
      },
      practice: [
        {
          id: 'square-series',
          prompt: 'What is the next term in 1, 4, 9, 16, ___?',
          difficulty: 'Easy',
          answer: '25.',
          explanation: 'The terms are the squares 1², 2², 3², 4², so the next is 5² = 25.',
        },
        {
          id: 'syllogism-validity',
          prompt: 'All roses are flowers. Some flowers fade quickly. Does it necessarily follow that some roses fade quickly?',
          difficulty: 'Medium',
          answer: 'No. The flowers that fade quickly may be other kinds of flowers, and the premises do not guarantee that any rose is among them.',
          explanation: 'A valid conclusion must hold in every model of the premises. A counterexample with roses that do not fade quickly shows the conclusion is not necessary.',
        },
      ],
    },
    {
      id: 'probability-and-data-interpretation',
      title: 'Probability and data interpretation',
      summary: 'Count outcomes carefully, handle dependent events, and read tables without confusing percentages with percentage points.',
      estimatedMinutes: 35,
      notes: [
        'Probability is favorable outcomes divided by total equally likely outcomes. The complement rule is often faster: P(at least one) = 1 - P(none). Check whether outcomes are equally likely before counting.',
        'For independent events, multiply probabilities. For draws without replacement, the denominator and often the numerator change after each draw. With replacement, the probabilities reset.',
        'A percentage point is an absolute difference between percentages; a percent change is relative to the starting value. Going from 20% to 25% is 5 percentage points, but a 25% relative increase.',
        'In data interpretation, read the units, totals, and footnotes before calculating. A row percentage and a column percentage answer different questions. Estimate first so a calculation error is easier to catch.',
      ],
      example: {
        title: 'Two draws without replacement',
        body: 'A bag has 5 red and 3 blue balls. The probability the first draw is red is 5/8. Given that, 4 red and 3 blue remain, so the second red probability is 4/7. Both red is (5/8)(4/7) = 20/56 = 5/14.',
      },
      practice: [
        {
          id: 'die-even',
          prompt: 'A fair six-sided die is rolled once. What is the probability of an even number?',
          difficulty: 'Easy',
          answer: '1/2, because 2, 4, and 6 are three of the six equally likely outcomes.',
          explanation: 'The favorable outcomes are distinct and the die is fair. Probability is 3/6, which simplifies to 1/2.',
        },
        {
          id: 'data-percentage',
          prompt: 'In a survey of 200 people, 120 prefer tea and 70 of those tea drinkers are students. What percentage of all respondents are students who prefer tea?',
          difficulty: 'Medium',
          answer: '35%.',
          explanation: 'The group is 70 people out of 200 total, so 70/200 = 0.35. Do not divide 70 by 120, which would answer a different question about tea drinkers.',
        },
      ],
    },
  ],
}
