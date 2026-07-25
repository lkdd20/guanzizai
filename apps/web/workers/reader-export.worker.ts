import {
  buildReaderExportPayload,
  type ReaderExportDocument,
  type ReaderExportFormat,
  type ReaderExportSettings,
} from '../lib/reader-export'

interface ReaderExportWorkerRequest {
  id: string
  format: ReaderExportFormat
  document: ReaderExportDocument
  settings: ReaderExportSettings
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ReaderExportWorkerRequest>) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}

workerScope.onmessage = (event) => {
  const { id, format, document, settings } = event.data
  try {
    const payload = buildReaderExportPayload(format, document, settings)
    const response = { id, ok: true, format, payload }
    if (payload instanceof ArrayBuffer) workerScope.postMessage(response, [payload])
    else workerScope.postMessage(response)
  } catch (error) {
    workerScope.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : '文件生成失败。',
    })
  }
}
