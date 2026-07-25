export interface StructurePassage {
  seq: number
  original: string
  char_count: number
}

export interface StructureWork {
  sutra: { title_zh: string }
  passages: StructurePassage[]
}

export interface WorkStructureNode {
  key: string
  kind: 'body' | 'volume' | 'chapter'
  level: number
  parentKey: string | null
  title: string
  juan: number
  sequence: number
  endSequence: number
  contentHash: string
  characterCount: number
}

export function deriveWorkStructure(work: StructureWork): WorkStructureNode[]
export function sectionForPassage(structure: WorkStructureNode[], sequence: number): WorkStructureNode | undefined
