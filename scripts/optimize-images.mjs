#!/usr/bin/env node
import { access, copyFile, mkdtemp, readdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

async function loadSharp() {
  try {
    return require('sharp')
  } catch {
    const store = resolve(process.cwd(), 'node_modules/.pnpm')
    const entry = (await readdir(store)).find((name) => name.startsWith('sharp@'))
    if (!entry) throw new Error('sharp is required; run pnpm install before optimizing images')
    return require(join(store, entry, 'node_modules/sharp'))
  }
}

const specs = [
  { path: 'apps/web/public/hero-mural.webp', transform: (image) => image.resize({ width: 820, withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 90, effort: 6, smartSubsample: true }) },
  { path: 'apps/web/public/brand-logo.png', transform: (image) => image.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 100, colours: 256, dither: 0.5, effort: 10 }) },
  { path: 'apps/web/public/favicon.png', transform: (image) => image.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 100, colours: 256, dither: 0.5, effort: 10 }) },
]

async function main() {
  const sharp = await loadSharp()
  const temporary = await mkdtemp(join(tmpdir(), 'guanzizai-images-'))
  try {
    for (const spec of specs) {
      const input = resolve(process.cwd(), spec.path)
      await access(input)
      const output = join(temporary, basename(input))
      await spec.transform(sharp(input)).toFile(output)
      const replacement = `${input}.optimized`
      await copyFile(output, replacement)
      await rename(replacement, input)
      console.log(`Optimized ${spec.path}`)
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
