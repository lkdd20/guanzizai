import 'server-only'

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

interface StoredPassage {
  id: string
  juan: number
  sequence: number
  original: string
  contentHash: string
  characterCount: number
}

export interface StoredWorkObject {
  format: 'guanzizai-work-v1'
  id: string
  sourceBatch: string
  contentHash: string
  passages: StoredPassage[]
}

let client: S3Client | undefined

function config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const bucket = process.env.R2_CONTENT_BUCKET?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null
  return { accountId, bucket, accessKeyId, secretAccessKey }
}

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function getStore() {
  const settings = config()
  if (!settings) return null
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  })
  return { client, bucket: settings.bucket }
}

export async function putPrivateObject(key: string, body: Uint8Array, contentType: string) {
  const store = getStore()
  if (!store) throw new Error('R2 storage is not configured')
  await store.client.send(new PutObjectCommand({
    Bucket: store.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentLength: body.byteLength,
    CacheControl: 'private, no-store',
  }))
}

export async function createPrivateUploadUrl(key: string, contentType: string, sha256: string) {
  const store = getStore()
  if (!store) throw new Error('R2 storage is not configured')
  return getSignedUrl(store.client, new PutObjectCommand({
    Bucket: store.bucket,
    Key: key,
    ContentType: contentType,
    Metadata: { sha256 },
    CacheControl: 'private, no-store',
  }), { expiresIn: 600 })
}

export async function headPrivateObject(key: string) {
  const store = getStore()
  if (!store) return null
  return store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: key }))
}

export async function deletePrivateObject(key: string) {
  const store = getStore()
  if (!store) return
  await store.client.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key }))
}

export async function readPrivateObject(key: string) {
  const store = getStore()
  if (!store) return null
  const response = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key }))
  return response.Body ? response.Body.transformToByteArray() : null
}

export async function readWorkObject(key: string, expectedObjectHash: string, expectedContentHash: string) {
  const body = await readPrivateObject(key)
  if (!body) return null
  const isGzip = body[0] === 0x1f && body[1] === 0x8b
  if (isGzip && sha256(body) !== expectedObjectHash) throw new Error(`R2 object hash mismatch: ${key}`)
  const json = isGzip ? gunzipSync(body).toString('utf8') : Buffer.from(body).toString('utf8')
  const parsed = JSON.parse(json) as StoredWorkObject
  if (parsed.format !== 'guanzizai-work-v1' || parsed.contentHash !== expectedContentHash) {
    throw new Error(`R2 content metadata mismatch: ${key}`)
  }
  const fullText = parsed.passages.map((passage) => passage.original).join('')
  if (sha256(fullText) !== expectedContentHash) throw new Error(`R2 content hash mismatch: ${key}`)
  return parsed
}
