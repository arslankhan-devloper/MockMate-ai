// In-memory answer restoration for interview question navigation.
// Unsaved turns live in the persistence queue; confirmed turns live in the saved
// map. Navigation must show the most recent real answer and never invent one.

export interface StoredTurnSnapshot {
  answerText: string
  spokenSeconds: number
}

export interface RestoredAnswer {
  text: string
  spokenSeconds: number
}

export function resolveStoredAnswer(
  index: number,
  pending: ReadonlyMap<number, StoredTurnSnapshot>,
  saved: ReadonlyMap<number, string>,
): RestoredAnswer {
  const queued = pending.get(index)
  const queuedText = queued?.answerText ?? ''
  const savedText = saved.get(index)
  return {
    text: queuedText.trim() ? queuedText : savedText ?? queuedText,
    spokenSeconds: queued?.spokenSeconds ?? 0,
  }
}
