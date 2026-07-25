export interface CatalogWork {
  id: string
  sourceBatch: string
  sourceEdition: string
  sourcePath: string
  title: string
  author: string | null
  dynasty: string | null
  category: string | null
  contentHash: string
  characterCount: number
  passageCount: number
  importedAt: string
}

export interface DaizhigeCatalogManifest {
  generatedAt?: string
  batch: string
  source?: {
    repository?: string
    commit?: string
  }
  excludedByDir?: unknown[]
  excludedByContent?: unknown[]
  included: Array<Record<string, unknown>>
}

export interface CatalogDatabase {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
  transaction<T>(callback: (database: CatalogDatabase) => Promise<T>): Promise<T>
}

export function parseCatalogArgs(argv: string[], env?: NodeJS.ProcessEnv): {
  manifest: string
  limit: number
  offset: number
  databaseUrl: string
  plan: string
  dryRun: boolean
}

export function mapManifestEntry(
  entry: Record<string, unknown>,
  manifest: DaizhigeCatalogManifest,
): CatalogWork

export function classifyManifestEntry(entry: Record<string, unknown>): {
  kind: 'independent_work_candidate' | 'composite_section'
  reason: string | null
}

export function selectCatalogEntries(
  manifest: DaizhigeCatalogManifest,
  offset: number,
  limit: number,
): CatalogWork[]

export function buildCatalogPlan(
  manifest: DaizhigeCatalogManifest,
  manifestHash: string,
  works: CatalogWork[],
  offset: number,
): {
  generatedAt: string
  sourceBatch: string
  manifestHash: string
  offset: number
  defaults: {
    library: '国学'
    sourceVerification: 'unverified'
    publicationStatus: 'catalog_only'
    translations: 0
  }
  totals: {
    selectedWorks: number
    manifestSourceFiles: number
    independentWorkCandidates: number
    compositeSectionsExcluded: number
    passagesDeclared: number
    charactersDeclared: number
  }
  works: CatalogWork[]
}

export function buildCatalogUpsert(works: CatalogWork[]): {
  text: string
  params: unknown[]
}

export function importCatalogWorks(
  database: CatalogDatabase,
  input: {
    manifest: DaizhigeCatalogManifest
    manifestHash: string
    works: CatalogWork[]
  },
): Promise<{ jobId: unknown; importedCount: number }>
