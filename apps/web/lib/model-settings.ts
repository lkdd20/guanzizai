export interface ModelGatewayConfig {
  apiKey?: string
  baseUrl: string
  model: string
}

export interface GatewayModel {
  id: string
  ownedBy?: string
  created?: number
}

export interface AskModelSelection {
  model: string
  environmentModel: string
  source: 'runtime' | 'environment'
  storageAvailable: boolean
}

const defaultModel = 'configured-model'
const defaultBaseUrl = 'https://example.invalid'
const askModelSettingKey = 'ask.active_model'
const modelIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/u

export function modelGatewayConfigFromEnv(env = process.env): ModelGatewayConfig {
  return {
    apiKey: env.NEWAPI_API_KEY ?? env.DEEPSEEK_API_KEY,
    baseUrl: (env.NEWAPI_BASE_URL ?? defaultBaseUrl).replace(/\/+$/, ''),
    model: normalizeModelId(env.NEWAPI_MODEL) ?? defaultModel,
  }
}

export function normalizeModelId(value: unknown) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return modelIdPattern.test(normalized) ? normalized : undefined
}

export function normalizeGatewayModelsPayload(payload: unknown): GatewayModel[] {
  if (!payload || typeof payload !== 'object') return []
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const models = new Map<string, GatewayModel>()
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as { id?: unknown; owned_by?: unknown; created?: unknown }
    const id = normalizeModelId(candidate.id)
    if (!id) continue
    models.set(id, {
      id,
      ownedBy: typeof candidate.owned_by === 'string' ? candidate.owned_by.trim().slice(0, 80) || undefined : undefined,
      created: typeof candidate.created === 'number' && Number.isFinite(candidate.created) ? candidate.created : undefined,
    })
  }
  return [...models.values()].sort((left, right) => left.id.localeCompare(right.id, 'en'))
}

export async function fetchGatewayModels(config = modelGatewayConfigFromEnv()) {
  if (!config.apiKey) throw new Error('model_gateway_not_configured')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(`${config.baseUrl}/v1/models`, {
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`model_gateway_http_${response.status}`)
    const models = normalizeGatewayModelsPayload(await response.json())
    if (!models.length) throw new Error('model_gateway_empty')
    return models
  } finally {
    clearTimeout(timeout)
  }
}

export async function getAskModelSelection(env = process.env): Promise<AskModelSelection> {
  const environment = modelGatewayConfigFromEnv(env)
  const db = await runtimeSettingsSql()
  if (!db) {
    return {
      model: environment.model,
      environmentModel: environment.model,
      source: 'environment',
      storageAvailable: false,
    }
  }
  try {
    const rows = await db`
      SELECT setting_value->>'model' AS model
      FROM app_runtime_settings
      WHERE setting_key=${askModelSettingKey}
      LIMIT 1
    `
    const runtimeModel = normalizeModelId(rows[0]?.model)
    return {
      model: runtimeModel ?? environment.model,
      environmentModel: environment.model,
      source: runtimeModel ? 'runtime' : 'environment',
      storageAvailable: true,
    }
  } catch (error) {
    console.warn('[model-settings] runtime model selection unavailable', modelSettingsErrorCode(error))
    return {
      model: environment.model,
      environmentModel: environment.model,
      source: 'environment',
      storageAvailable: false,
    }
  }
}

export async function askModelConfigFromRuntime(env = process.env): Promise<ModelGatewayConfig> {
  const gateway = modelGatewayConfigFromEnv(env)
  const selection = await getAskModelSelection(env)
  return { ...gateway, model: selection.model }
}

export async function saveAskModelSelection(model: string | null) {
  const db = await runtimeSettingsSql()
  if (!db) throw new Error('model_settings_database_unavailable')
  if (model === null) {
    await db`DELETE FROM app_runtime_settings WHERE setting_key=${askModelSettingKey}`
    return
  }
  const normalized = normalizeModelId(model)
  if (!normalized) throw new Error('invalid_model_id')
  await db`
    INSERT INTO app_runtime_settings (setting_key, setting_value, updated_by)
    VALUES (${askModelSettingKey}, ${db.json({ model: normalized })}, 'admin')
    ON CONFLICT (setting_key) DO UPDATE SET
      setting_value=EXCLUDED.setting_value,
      updated_by=EXCLUDED.updated_by,
      updated_at=now()
  `
}

async function runtimeSettingsSql() {
  const { adminContentSql } = await import('./content-db')
  return adminContentSql()
}

function modelSettingsErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return 'unknown'
  const candidate = error as { code?: unknown; name?: unknown }
  if (typeof candidate.code === 'string') return candidate.code.slice(0, 32)
  if (typeof candidate.name === 'string') return candidate.name.slice(0, 32)
  return 'unknown'
}
