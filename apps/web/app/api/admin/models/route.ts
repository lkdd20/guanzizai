import { NextResponse } from 'next/server'

import { hasAdminAccess } from '@/lib/admin-auth'
import { adminEntryParam, hasValidAdminEntry } from '@/lib/admin-paths'
import {
  fetchGatewayModels,
  getAskModelSelection,
  modelGatewayConfigFromEnv,
  normalizeModelId,
  saveAskModelSelection,
} from '@/lib/model-settings'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const responseHeaders = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
}

export async function GET(request: Request) {
  const authorization = await authorize(request)
  if (authorization) return authorization

  const gateway = modelGatewayConfigFromEnv()
  const [selection, modelsResult] = await Promise.all([
    getAskModelSelection(),
    fetchGatewayModels(gateway).then(
      (models) => ({ models, error: undefined }),
      (error: unknown) => ({ models: [], error: publicGatewayError(error) }),
    ),
  ])

  return NextResponse.json({
    ...selection,
    models: modelsResult.models,
    listError: modelsResult.error,
    gatewayHost: safeGatewayHost(gateway.baseUrl),
    fetchedAt: new Date().toISOString(),
  }, { headers: responseHeaders })
}

export async function PATCH(request: Request) {
  const authorization = await authorize(request)
  if (authorization) return authorization
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'origin_not_allowed' }, { status: 403, headers: responseHeaders })
  }

  const body = (await request.json().catch(() => null)) as { model?: unknown; reset?: unknown } | null
  const reset = body?.reset === true
  const requestedModel = normalizeModelId(body?.model)
  if (!reset && !requestedModel) {
    return NextResponse.json({ error: 'invalid_model_id' }, { status: 400, headers: responseHeaders })
  }
  const model: string | null = reset ? null : requestedModel!

  if (model) {
    const gateway = modelGatewayConfigFromEnv()
    const availableModels = await fetchGatewayModels(gateway).catch(() => [])
    if (!availableModels.some((candidate) => candidate.id === model)) {
      return NextResponse.json({ error: 'model_not_available' }, { status: 409, headers: responseHeaders })
    }
  }

  try {
    await saveAskModelSelection(model)
  } catch {
    return NextResponse.json({ error: 'model_settings_unavailable' }, { status: 503, headers: responseHeaders })
  }

  return NextResponse.json(await getAskModelSelection(), { headers: responseHeaders })
}

async function authorize(request: Request) {
  const requestUrl = new URL(request.url)
  if (!hasValidAdminEntry(requestUrl.searchParams.get(adminEntryParam))) {
    return new NextResponse('Not Found', { status: 404, headers: responseHeaders })
  }
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: 'admin authorization required' }, { status: 401, headers: responseHeaders })
  }
  return undefined
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const requestUrl = new URL(request.url)
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    const requestHost = forwardedHost || request.headers.get('host') || requestUrl.host
    const requestProtocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol
    const originUrl = new URL(origin)
    return originUrl.host === requestHost && originUrl.protocol === requestProtocol
  } catch {
    return false
  }
}

function safeGatewayHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host
  } catch {
    return '已配置模型网关'
  }
}

function publicGatewayError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return '模型网关请求超时，请重试。'
  if (error instanceof Error && error.message === 'model_gateway_not_configured') return '尚未配置模型访问密钥。'
  return '暂时无法读取模型列表，请检查网关状态后重试。'
}
