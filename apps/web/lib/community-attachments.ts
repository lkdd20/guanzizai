export const maxAttachmentBytes = 50 * 1024 * 1024

export const allowedAttachmentExtensions = new Set([
  '.txt', '.md', '.markdown', '.pdf', '.epub', '.doc', '.docx', '.rtf', '.odt',
  '.json', '.jsonl', '.csv', '.xml', '.html', '.htm', '.fb2', '.mobi', '.azw', '.azw3', '.zip',
  '.png', '.jpg', '.jpeg', '.webp',
])

export type AttachmentMetadata = {
  id: string
  key: string
  name: string
  type: string
  size: number
  sha256: string
}

export function safeAttachmentFileName(value: string) {
  const normalized = value.normalize('NFKC').replace(/[\\/\0-\x1f\x7f]/g, '').trim()
  return normalized.slice(-160) || 'attachment'
}

export function attachmentError(file: File | null) {
  if (!file || file.size === 0) return null
  if (file.size > maxAttachmentBytes) return 'attachment_too_large'
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  return allowedAttachmentExtensions.has(extension) ? null : 'attachment_type_not_allowed'
}

export function attachmentMetadataError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'attachment_invalid'
  const candidate = value as Partial<AttachmentMetadata>
  if (typeof candidate.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(candidate.id)) return 'attachment_invalid'
  if (typeof candidate.name !== 'string' || !candidate.name || safeAttachmentFileName(candidate.name) !== candidate.name) return 'attachment_invalid'
  if (typeof candidate.key !== 'string' || candidate.key !== `community-contributions/${candidate.id}/${candidate.name}`) return 'attachment_invalid'
  if (typeof candidate.type !== 'string' || !candidate.type) return 'attachment_invalid'
  if (typeof candidate.size !== 'number' || !Number.isSafeInteger(candidate.size) || candidate.size <= 0 || candidate.size > maxAttachmentBytes) return 'attachment_invalid'
  if (typeof candidate.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(candidate.sha256)) return 'attachment_invalid'
  const extension = candidate.name.slice(candidate.name.lastIndexOf('.')).toLowerCase()
  return allowedAttachmentExtensions.has(extension) ? null : 'attachment_type_not_allowed'
}
