import { tokenizeWords } from '../utils/text'
import { parseDocumentXml, parseNonNegativeNumber } from '../utils/documentXml'
import { loadSafeZip, readZipXml, readZipEntry } from '../utils/safeArchive'
import { checkFileSize, checkMetadataSize, DocumentInputError } from '../utils/inputLimits'
import type { DocumentMetadata } from '../types/analysis'
import { extractOdtText } from '../utils/odtText'

export interface OdtAnalysisResult {
  metadata: DocumentMetadata
  text: string
}

function parseIsoDate(s: unknown): Date | undefined {
  if (!s || typeof s !== 'string') return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function parseDurationToMinutes(s: unknown): number | undefined {
  if (!s || typeof s !== 'string') return undefined
  const m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/)
  if (!m) return undefined
  const h = parseInt(m[1] ?? '0', 10)
  const min = parseInt(m[2] ?? '0', 10)
  const minutes = h * 60 + min + Number(m[3] ?? 0) / 60
  return Number.isFinite(minutes) ? minutes : undefined
}

export async function analyzeOdt(file: File): Promise<OdtAnalysisResult> {
  checkFileSize(file)
  const buffer = await file.arrayBuffer()
  const zip = await loadSafeZip(buffer)
  const mimeEntry = zip.file('mimetype')
  if (!mimeEntry || new TextDecoder().decode(await readZipEntry(mimeEntry, 256)) !== 'application/vnd.oasis.opendocument.text') {
    throw new DocumentInputError('invalid')
  }

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

  const metaFile = zip.file('meta.xml')
  if (metaFile) {
    const metaXml = (await readZipXml(zip, 'meta.xml'))!
    const meta = parseDocumentXml(metaXml)
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
    revisions = parseNonNegativeNumber(cycles)

    title = m['dc:title']?.['#text'] ?? m['dc:title'] ?? undefined
    subject = m['dc:subject']?.['#text'] ?? m['dc:subject'] ?? undefined
    description =
      m['dc:description']?.['#text'] ?? m['dc:description'] ?? undefined
    keywords = m['meta:keyword']?.['#text'] ?? m['meta:keyword'] ?? undefined

    const stats = m['meta:document-statistic']
    if (stats) {
      const attr = stats['@_meta:word-count'] ?? stats['@_word-count']
      wordCount = parseNonNegativeNumber(attr)
      const pg = stats['@_meta:page-count'] ?? stats['@_page-count']
      pageCount = parseNonNegativeNumber(pg)
    }
  }

  let text = ''
  const contentFile = zip.file('content.xml')
  if (!contentFile) throw new DocumentInputError('invalid')
  if (contentFile) {
    const contentXml = (await readZipXml(zip, 'content.xml', true))!
    if (!parseDocumentXml(contentXml)['office:document-content']) throw new DocumentInputError('invalid')
    text = extractOdtText(contentXml)
    {
      wordCount = tokenizeWords(text).length
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

  checkMetadataSize(metadata)
  return {
    metadata,
    text: text
      .split(/\n+/)
      .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n'),
  }
}
