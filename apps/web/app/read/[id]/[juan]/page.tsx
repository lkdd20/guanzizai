import { notFound } from 'next/navigation'

import { ReaderShell } from '@/components/reader-shell'
import { sampleWork, siteConfig, sutraById, termDefinitions } from '@/lib/content'

export async function generateStaticParams() {
  return [{ id: sampleWork.id, juan: '1' }]
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; juan: string }> }) {
  const { id, juan } = await params
  const sutra = sutraById(id)
  if (!sutra) return { title: '经典暂未开放' }
  return {
    title: `${sutra.shortTitle}卷${juan}阅读`,
    description: `${sutra.title}卷${juan}原文阅读、AI 白话辅助与术语解释。`,
    alternates: {
      canonical: `${siteConfig.url}/read/${sutra.id}/${juan}`,
    },
  }
}

export default async function ReadJuanPage({ params }: { params: Promise<{ id: string; juan: string }> }) {
  const { id, juan } = await params
  const sutra = sutraById(id)
  if (!sutra || juan !== '1') notFound()
  return <ReaderShell sutra={sutra} terms={termDefinitions} />
}
