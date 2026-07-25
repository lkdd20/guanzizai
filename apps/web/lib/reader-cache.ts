'use client'

const databaseName = 'guanzizai-reader-cache'
const storeName = 'resources'
const databaseVersion = 1
const maxEntries = 240
const maxBytes = 75 * 1024 * 1024

interface CacheRecord<T = unknown> {
  key: string
  value: T
  bytes: number
  accessedAt: number
}

function openCache() {
  if (!('indexedDB' in window)) return Promise.resolve<IDBDatabase | null>(null)
  return new Promise<IDBDatabase | null>((resolve) => {
    const request = window.indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: 'key' })
        store.createIndex('accessedAt', 'accessedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

export async function getReaderCache<T>(key: string): Promise<T | null> {
  const database = await openCache()
  if (!database) return null
  return new Promise((resolve) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.get(key)
    request.onsuccess = () => {
      const record = request.result as CacheRecord<T> | undefined
      if (!record) {
        resolve(null)
        return
      }
      store.put({ ...record, accessedAt: Date.now() })
      resolve(record.value)
    }
    request.onerror = () => resolve(null)
  })
}

export async function putReaderCache<T>(key: string, value: T) {
  const database = await openCache()
  if (!database) return
  const bytes = new Blob([JSON.stringify(value)]).size
  if (bytes > maxBytes) return
  const estimate = await navigator.storage?.estimate?.().catch(() => null)
  if (estimate?.quota && estimate.usage && estimate.quota - estimate.usage < bytes * 1.2) return
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put({ key, value, bytes, accessedAt: Date.now() } satisfies CacheRecord<T>)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
  })
  await trimReaderCache(database)
}

export async function pruneReaderWorkVersions(workId: string, contentVersion: string) {
  const database = await openCache()
  if (!database) return
  const records = await new Promise<CacheRecord[]>((resolve) => {
    const request = database.transaction(storeName).objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as CacheRecord[])
    request.onerror = () => resolve([])
  })
  const currentPrefix = `${workId}:${contentVersion}:`
  const currentEnrichmentPrefix = `enrichment:${workId}:${contentVersion}:`
  const remove = records
    .filter((record) => (
      (record.key.startsWith(`${workId}:`) && !record.key.startsWith(currentPrefix))
      || (record.key.startsWith(`enrichment:${workId}:`) && !record.key.startsWith(currentEnrichmentPrefix))
    ))
    .map((record) => record.key)
  if (!remove.length) return
  const transaction = database.transaction(storeName, 'readwrite')
  remove.forEach((key) => transaction.objectStore(storeName).delete(key))
}

export async function clearReaderCache() {
  const database = await openCache()
  if (!database) return
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
  })
}

async function trimReaderCache(database: IDBDatabase) {
  const records = await new Promise<CacheRecord[]>((resolve) => {
    const request = database.transaction(storeName).objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as CacheRecord[])
    request.onerror = () => resolve([])
  })
  records.sort((left, right) => right.accessedAt - left.accessedAt)
  let bytes = 0
  const remove: string[] = []
  records.forEach((record, index) => {
    bytes += record.bytes
    if (index >= maxEntries || bytes > maxBytes) remove.push(record.key)
  })
  if (!remove.length) return
  const transaction = database.transaction(storeName, 'readwrite')
  remove.forEach((key) => transaction.objectStore(storeName).delete(key))
}
