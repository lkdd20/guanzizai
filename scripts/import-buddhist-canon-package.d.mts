export interface ImportDatabase {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  transaction<T>(callback: (tx: ImportDatabase) => Promise<T>): Promise<T>
}

export interface BuddhistCanonPackageData {
  batchId: string
  manifest: Record<string, unknown>
  manifestHash: string
  attributionText: string
  licenseText: string
  replacementMap: { entries: Record<string, unknown>[] }
  works: Record<string, unknown>[]
  totals: {
    works: number
    records: number
    passages: number
    translations: number
    enrichments: number
    translationSegments: number
    readingTranslationSegments: number
    primarySourceComponents: number
    notes: number
    readingNotes: number
    uniqueTermDefinitions: number
    termMentions: number
    termCoveredPassages: number
    duplicateSourceNotes: number
    sourceHanCharacters: number
    readingHanCharacters: number
    checkedFiles: number
  }
}

export function loadBuddhistCanonPackage(
  input: string,
  options?: { zip?: string; expectedZipSha256?: string },
): Promise<BuddhistCanonPackageData>

export function groupRecordSegments(record: Record<string, any>): Record<string, any>[][]

export function importBuddhistCanonPackage(
  db: ImportDatabase,
  packageData: BuddhistCanonPackageData,
  options?: { chunkSize?: number },
): Promise<{ jobId: string; importedWorks: number }>

export function verifyBuddhistCanonImport(
  db: ImportDatabase,
  packageData: BuddhistCanonPackageData,
): Promise<Record<string, unknown>>
