import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchGatewayModels,
  modelGatewayConfigFromEnv,
  normalizeGatewayModelsPayload,
  normalizeModelId,
} from '../apps/web/lib/model-settings'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('后台模型设置', () => {
  it('只接受可安全传给兼容网关的模型 ID', () => {
    expect(normalizeModelId(' provider/example-model ')).toBe('provider/example-model')
    expect(normalizeModelId('provider/example-model:thinking')).toBe('provider/example-model:thinking')
    expect(normalizeModelId('model with spaces')).toBeUndefined()
    expect(normalizeModelId('../model')).toBeUndefined()
    expect(normalizeModelId('<script>')).toBeUndefined()
  })

  it('规范化、去重并排序网关模型列表', () => {
    const models = normalizeGatewayModelsPayload({
      data: [
        { id: 'z-model', owned_by: 'provider-z', created: 2 },
        { id: 'a-model', owned_by: 'provider-a', created: 1 },
        { id: 'a-model', owned_by: 'provider-a-new' },
        { id: 'bad model' },
      ],
    })

    expect(models).toEqual([
      { id: 'a-model', ownedBy: 'provider-a-new', created: undefined },
      { id: 'z-model', ownedBy: 'provider-z', created: 2 },
    ])
  })

  it('从服务端兼容接口读取模型且不暴露密钥', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'model-b' }, { id: 'model-a', owned_by: 'gateway' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchGatewayModels({ apiKey: 'server-secret', baseUrl: 'https://gateway.example', model: 'model-a' })
    expect(models.map((item) => item.id)).toEqual(['model-a', 'model-b'])
    expect(fetchMock).toHaveBeenCalledWith('https://gateway.example/v1/models', expect.objectContaining({ cache: 'no-store' }))
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer server-secret')
    expect(JSON.stringify(models)).not.toContain('server-secret')
  })

  it('环境变量仍是安全回退配置', () => {
    expect(modelGatewayConfigFromEnv({} as NodeJS.ProcessEnv)).toMatchObject({
      baseUrl: 'https://example.invalid',
      model: 'configured-model',
    })
    expect(modelGatewayConfigFromEnv({
      NEWAPI_API_KEY: 'secret',
      NEWAPI_BASE_URL: 'https://gateway.example/v1/',
      NEWAPI_MODEL: 'model-a',
    } as NodeJS.ProcessEnv)).toEqual({
      apiKey: 'secret',
      baseUrl: 'https://gateway.example/v1',
      model: 'model-a',
    })
  })

  it('生产迁移包含非密钥运行时设置表', () => {
    const migration = readFileSync('postgres/migrations/0015_runtime_model_settings.sql', 'utf8')
    const runner = readFileSync('scripts/apply-reader-platform-migrations.mjs', 'utf8')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS app_runtime_settings')
    expect(migration).not.toMatch(/api_key|secret_key|access_token/iu)
    expect(runner).toContain('0015_runtime_model_settings.sql')
  })
})
