import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { DocumentMetadata } from '../types/analysis'

export interface OdtAnalysisResult {
  metadata: DocumentMetadata
  text: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: false,
})

function parseIsoDate(s: unknown): Date | undefined {
  if (!s || typeof s !== 'string') return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

// ISO 8601 duration: PT1H30M → 90 minutos
function parseDurationToMinutes(s: unknown): number | undefined {
  if (!s || typeof s !== 'string') return undefined
  const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return undefined
  const h = parseInt(m[1] ?? '0', 10)
  const min = parseInt(m[2] ?? '0', 10)
  return h * 60 + min
}

// Extrae texto plano de XML ODT (text:p y text:span)
function extractOdtText(xmlStr: string): string {
  const matches = [
    ...xmlStr.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g),
    ...xmlStr.matchAll(/<text:h[^>]*>([\s\S]*?)<\/text:h>/g),
  ]
  return matches
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export async function analyzeOdt(file: File): Promise<OdtAnalysisResult> {
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  let author: string | undefined
  let createdAt: Date | undefined
  let modifiedAt: Date | undefined
  let editingTimeMinutes: number | undefined
  let revisions: number | undefined
  let generator: string | undefined
  let wordCount: number | undefined
  let pageCount: number | undefined
  let title: string | undefined
  let subject: string | undefined
  let keywords: string | undefined
  let description: string | undefined

  // --- meta.xml ---
  const metaFile = zip.file('meta.xml')
  if (metaFile) {
    const metaXml = await metaFile.async('string')
    const meta = parser.parse(metaXml)
    const office = meta['office:document-meta'] ?? {}
    const m = office['office:meta'] ?? {}

    generator = m['meta:generator'] ?? undefined
    author =
      m['dc:creator']?.['#text'] ?? m['dc:creator'] ?? m['meta:initial-creator'] ?? undefined
    createdAt = parseIsoDate(
      m['meta:creation-date']?.['#text'] ?? m['meta:creation-date']
    )
    modifiedAt = parseIsoDate(m['dc:date']?.['#text'] ?? m['dc:date'])

    editingTimeMinutes = parseDurationToMinutes(
      m['meta:editing-duration']?.['#text'] ?? m['meta:editing-duration']
    )
    const cycles =
      m['meta:editing-cycles']?.['#text'] ?? m['meta:editing-cycles']
    revisions = cycles ? parseInt(String(cycles), 10) : undefined

    title = m['dc:title']?.['#text'] ?? m['dc:title'] ?? undefined
    subject = m['dc:subject']?.['#text'] ?? m['dc:subject'] ?? undefined
    description =
      m['dc:description']?.['#text'] ?? m['dc:description'] ?? undefined
    keywords = m['meta:keyword']?.['#text'] ?? m['meta:keyword'] ?? undefined

    // Estadísticas de documento
    const stats = m['meta:document-statistic']
    if (stats) {
      const attr = stats['@_meta:word-count'] ?? stats['@_word-count']
      if (attr) wordCount = parseInt(String(attr), 10)
      const pg = stats['@_meta:page-count'] ?? stats['@_page-count']
      if (pg) pageCount = parseInt(String(pg), 10)
    }
  }

  // --- content.xml para texto ---
  let text = ''
  const contentFile = zip.file('content.xml')
  if (contentFile) {
    const contentXml = await contentFile.async('string')
    text = extractOdtText(contentXml)
    if (!wordCount) {
      wordCount = text.trim().split(/\s+/).filter(Boolean).length
    }
  }

  const metadata: DocumentMetadata = {
    author: typeof author === 'string' && author ? author : undefined,
    generator: typeof generator === 'string' && generator ? generator : undefined,
    createdAt,
    modifiedAt,
    revisions,
    editingTimeMinutes,
    wordCount,
    pageCount,
    title: typeof title === 'string' ? title : undefined,
    subject: typeof subject === 'string' ? subject : undefined,
    keywords: typeof keywords === 'string' ? keywords : undefined,
    description: typeof description === 'string' ? description : undefined,
  }

  return { metadata, text: text.replace(/\s+/g, ' ').trim() }
}
