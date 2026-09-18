const defaultPassageTermLimit = 8
const blockedAutoTerms = new Set(['原文', '作品', '作者', '版本'])

function compactTerm(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s·•・、，。：；！？“”「」『』《》〈〉'"‘’()（）\[\]{}]/gu, '')
}

export function canonicalTermKey(note) {
  return compactTerm(note?.term_simplified || note?.term_traditional)
}

function noteSignature(note) {
  return JSON.stringify([
    note.term_traditional ?? '', note.term_simplified ?? '', note.pinyin ?? '',
    note.sanskrit_or_other_form ?? '', note.explanation ?? '', note.category ?? '',
    note.status ?? '', note.confidence ?? '',
  ])
}

function representativeNote(notes) {
  const frequencies = new Map()
  for (const note of notes) {
    const signature = noteSignature(note)
    const entry = frequencies.get(signature) ?? { count: 0, note }
    entry.count += 1
    frequencies.set(signature, entry)
  }
  return [...frequencies.values()].sort((left, right) => (
    right.count - left.count
    || String(left.note.note_id ?? '').localeCompare(String(right.note.note_id ?? ''), 'zh-CN')
  ))[0].note
}

function termForms(definition) {
  return [...new Set([definition.termTraditional, definition.termSimplified].map((value) => String(value ?? '').trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length || left.localeCompare(right, 'zh-CN'))
}

function allOccurrences(text, form) {
  const occurrences = []
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf(form, cursor)
    if (start < 0) break
    occurrences.push({ start, end: start + form.length, matchedText: form })
    cursor = start + Math.max(1, form.length)
  }
  return occurrences
}

function selectNonOverlapping(candidates) {
  const selected = []
  let occupiedUntil = -1
  for (const candidate of candidates.sort((left, right) => (
    left.start - right.start
    || (right.end - right.start) - (left.end - left.start)
    || Number(right.targeted) - Number(left.targeted)
    || left.canonicalKey.localeCompare(right.canonicalKey, 'zh-CN')
  ))) {
    if (candidate.start < occupiedUntil) continue
    selected.push(candidate)
    occupiedUntil = candidate.end
  }
  return selected
}

function sourceVariant(note) {
  return {
    noteId: note.note_id ?? null,
    termTraditional: note.term_traditional ?? '',
    termSimplified: note.term_simplified ?? '',
    pinyin: note.pinyin ?? '',
    sanskritOrOtherForm: note.sanskrit_or_other_form ?? '',
    explanation: note.explanation ?? '',
    category: note.category ?? '',
    status: note.status ?? 'machine_draft',
    confidence: note.confidence ?? '',
  }
}

function publicNote(definition, sourceMethod) {
  return {
    note_id: `glossary:${definition.canonicalKey}`,
    term_traditional: definition.termTraditional,
    term_simplified: definition.termSimplified,
    pinyin: definition.pinyin,
    sanskrit_or_other_form: definition.sanskritOrOtherForm,
    explanation: definition.explanation,
    category: definition.category,
    status: definition.reviewStatus,
    confidence: definition.confidence,
    interpretation_type: 'lexical_note',
    propagation: sourceMethod,
  }
}

export function buildWorkTermIndex({ notes, passages, passageTermLimit = defaultPassageTermLimit }) {
  const grouped = new Map()
  for (const note of notes ?? []) {
    const canonicalKey = canonicalTermKey(note)
    if (!canonicalKey || !String(note.explanation ?? '').trim()) continue
    const group = grouped.get(canonicalKey) ?? []
    group.push(note)
    grouped.set(canonicalKey, group)
  }

  const definitions = [...grouped.entries()].map(([canonicalKey, sourceNotes]) => {
    const representative = representativeNote(sourceNotes)
    const forms = [...new Set(sourceNotes.flatMap((note) => [note.term_traditional, note.term_simplified]).map((value) => String(value ?? '').trim()).filter(Boolean))]
    const longestForm = forms.reduce((longest, form) => form.length > longest.length ? form : longest, '')
    const autoPropagationEnabled = longestForm.length > 1 && !forms.some((form) => blockedAutoTerms.has(compactTerm(form)))
    return {
      canonicalKey,
      termTraditional: String(representative.term_traditional ?? representative.term_simplified ?? ''),
      termSimplified: String(representative.term_simplified ?? representative.term_traditional ?? ''),
      pinyin: String(representative.pinyin ?? ''),
      sanskritOrOtherForm: String(representative.sanskrit_or_other_form ?? ''),
      explanation: String(representative.explanation),
      category: String(representative.category ?? ''),
      sourceLabel: String(representative.status ?? 'machine_draft'),
      confidence: String(representative.confidence ?? ''),
      reviewStatus: representative.status === 'human_reviewed' ? 'reviewed' : 'machine_draft',
      sourceNoteCount: sourceNotes.length,
      sourceVariants: [...new Map(sourceNotes.map((note) => [noteSignature(note), sourceVariant(note)])).values()],
      autoPropagationEnabled,
    }
  }).sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey, 'zh-CN'))

  const definitionsByKey = new Map(definitions.map((definition) => [definition.canonicalKey, definition]))
  const mentions = []
  const notesByPassage = new Map()

  for (const passage of passages ?? []) {
    const text = String(passage.originalText ?? passage.original ?? '')
    const targetedKeys = new Set((passage.readingNotes ?? []).map(canonicalTermKey).filter(Boolean))
    const candidates = []
    for (const definition of definitions) {
      for (const form of termForms(definition)) {
        for (const occurrence of allOccurrences(text, form)) {
          candidates.push({
            ...occurrence,
            canonicalKey: definition.canonicalKey,
            targeted: targetedKeys.has(definition.canonicalKey),
          })
        }
      }
    }
    const uniqueCandidates = [...new Map(candidates.map((candidate) => [
      `${candidate.canonicalKey}:${candidate.start}:${candidate.end}`, candidate,
    ])).values()]
    const selectedMentions = selectNonOverlapping(uniqueCandidates)
    const mentionedKeys = [...new Set(selectedMentions
      .filter((mention) => mention.targeted || definitionsByKey.get(mention.canonicalKey)?.autoPropagationEnabled)
      .map((mention) => mention.canonicalKey))]
      .sort((leftKey, rightKey) => {
        const leftTargeted = targetedKeys.has(leftKey)
        const rightTargeted = targetedKeys.has(rightKey)
        if (leftTargeted !== rightTargeted) return Number(rightTargeted) - Number(leftTargeted)
        const left = definitionsByKey.get(leftKey)
        const right = definitionsByKey.get(rightKey)
        return Math.max(...termForms(right).map((term) => term.length)) - Math.max(...termForms(left).map((term) => term.length))
          || leftKey.localeCompare(rightKey, 'zh-CN')
      })
    const displayKeys = new Set(mentionedKeys.slice(0, Math.max(1, passageTermLimit)))
    const passageNotes = [...displayKeys].map((canonicalKey) => {
      const sourceMethod = targetedKeys.has(canonicalKey) ? 'source_binding' : 'exact_match'
      return publicNote(definitionsByKey.get(canonicalKey), sourceMethod)
    })
    if (passageNotes.length) notesByPassage.set(passage.id, passageNotes)
    for (const mention of selectedMentions) {
      const definition = definitionsByKey.get(mention.canonicalKey)
      mentions.push({
        canonicalKey: mention.canonicalKey,
        passageId: passage.id,
        startOffset: mention.start,
        endOffset: mention.end,
        matchedText: mention.matchedText,
        sourceMethod: mention.targeted ? 'source_binding' : 'exact_match',
        displayable: displayKeys.has(mention.canonicalKey) && (mention.targeted || definition.autoPropagationEnabled),
      })
    }
  }

  const mentionedDefinitionKeys = new Set(mentions.map((mention) => mention.canonicalKey))
  return {
    definitions,
    mentions,
    notesByPassage,
    metrics: {
      sourceNotes: [...grouped.values()].reduce((sum, group) => sum + group.length, 0),
      definitions: definitions.length,
      duplicateSourceNotes: [...grouped.values()].reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
      mentions: mentions.length,
      displayableMentions: mentions.filter((mention) => mention.displayable).length,
      coveredPassages: notesByPassage.size,
      orphanDefinitions: definitions.filter((definition) => !mentionedDefinitionKeys.has(definition.canonicalKey)).length,
    },
  }
}
