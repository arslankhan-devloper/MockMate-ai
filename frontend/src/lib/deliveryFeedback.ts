export type AnswerStructureLabel =
  | 'Not enough words yet'
  | 'No clear cues yet'
  | 'Some structure cues'
  | 'Clear structure cues'

export interface AnswerStructureEstimate {
  label: AnswerStructureLabel
  cueCount: number
  cues: string[]
  wordCount: number
  detail: string
}

const CUE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: 'context',
    pattern:
      /\b(when|during|at the time|in my role|the situation|on a project)\b|जब|के दौरान|मेरी भूमिका|स्थिति|प्रोजेक्ट|\b(jab|ke dauran|meri role|situation|project)\b/i,
  },
  {
    label: 'sequence',
    pattern:
      /\b(first|second|third|next|then|finally|to start|after that)\b|पहले|दूसरे|तीसरे|फिर|अगले|अंत में|शुरू में|उसके बाद|\b(pehle|dusre|teesre|phir|agla|aakhir mein|shuru mein|uske baad)\b/i,
  },
  {
    label: 'reason',
    pattern:
      /\b(because|since|therefore|as a result|which means|so that)\b|क्योंकि|चूंकि|इसलिए|नतीजतन|जिसका मतलब|ताकि|\b(kyunki|chunki|isliye|nateejatan|jiska matlab|taaki)\b/i,
  },
  {
    label: 'example',
    pattern:
      /\b(for example|for instance|such as|specifically|in one case)\b|उदाहरण के लिए|जैसे|विशेष रूप से|एक मामले में|\b(udaharan ke liye|jaise|vishesh roop se|ek maamle mein)\b/i,
  },
  {
    label: 'action',
    pattern:
      /\b(i (built|led|implemented|coordinated|decided|created|worked|designed|resolved|analysed|analyzed|tested))\b|मैंने|हमने|\b(maine|humne)\b/i,
  },
  {
    label: 'outcome',
    pattern:
      /\b(outcome|impact|result|improved|reduced|achieved|learned|delivered)\b|परिणाम|प्रभाव|सुधार|कम किया|हासिल किया|सीखा|पूरा किया|डिलीवर किया|\b(nateeja|prabhav|sudhar|kam kiya|haasil kiya|seekha|poora kiya|deliver kiya)\b/i,
  },
]

export function countAnswerWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0
}

export function estimateAnswerStructure(text: string): AnswerStructureEstimate {
  const wordCount = countAnswerWords(text)
  if (wordCount < 12) {
    return {
      label: 'Not enough words yet',
      cueCount: 0,
      cues: [],
      wordCount,
      detail: 'Keep speaking — a few sentences are needed for a cue estimate.',
    }
  }

  const cues = CUE_PATTERNS.filter(cue => cue.pattern.test(text)).map(cue => cue.label)
  if (cues.length === 0) {
    return {
      label: 'No clear cues yet',
      cueCount: 0,
      cues,
      wordCount,
      detail: 'Try a short context, a specific action, and a result.',
    }
  }

  const label: AnswerStructureLabel =
    cues.length >= 3 && wordCount >= 25 ? 'Clear structure cues' : 'Some structure cues'

  return {
    label,
    cueCount: cues.length,
    cues,
    wordCount,
    detail: `Observed: ${cues.join(', ')}.`,
  }
}
