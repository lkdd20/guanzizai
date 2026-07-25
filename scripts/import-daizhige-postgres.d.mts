export interface QueryResult<Row = Record<string, unknown>> { rows: Row[] }
export interface DatabaseAdapter {
  query(text: string, params?: unknown[]): Promise<QueryResult>
  transaction<T>(callback: (transaction: DatabaseAdapter) => Promise<T>): Promise<T>
}
export interface DaizhigeImportInput {
  manifest: { batch: string; source: { repository: string; commit: string } }
  manifestHash: string
  works: Array<{ sutra: Record<string, any>; passages: Array<Record<string, any>> }>
}
export function importWorks(
  database: DatabaseAdapter,
  input: DaizhigeImportInput,
  options?: { passageChunkSize?: number; metadataOnly?: boolean },
): Promise<unknown>
