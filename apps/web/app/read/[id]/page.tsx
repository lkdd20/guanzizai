import { notFound } from 'next/navigation'
import { cache } from 'react'

import { ReaderShell } from '@/components/reader-shell'
import { heartSutra, siteConfig, termDefinitions } from '@/lib/content'
import { getPublicWorkById } from '@/lib/content-repository'

// Metadata and the page render ask for the same default reading window.
// Request-scoped memoization prevents duplicate Neon/R2 reads.
const getCachedPublicWorkById = cache((id: string, start?: number) => getPublicWorkById(id, start))

// Database publication status must be checked on every request so withdrawn
// works cannot remain readable from a previously generated route cache.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateStaticParams() {
  return [{ id: heartSutra.id }]
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getCachedPublicWorkById(id, undefined)
  if (!result) return { title: '经典暂未开放' }
  const sutra = result.work
  return {
    title: `${sutra.shortTitle}阅读`,
    description: `${sutra.title}原文阅读、AI 白话辅助与术语解释。`,
    alternates: {
      canonical: `${siteConfig.url}/read/${sutra.id}`,
    },
  }
}

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ start?: string }>
}) {
  const { id } = await params
  const { start } = await searchParams
  const startSequence = start ? Number(start) : undefined
  const result = await getCachedPublicWorkById(id, startSequence)
  if (!result) notFound()
  const sutra = result.work
  return <ReaderShell key={`${sutra.id}:${startSequence ?? 'start'}`} sutra={sutra} terms={termDefinitions} startSequence={startSequence} />
}
