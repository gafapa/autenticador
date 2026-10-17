import { tokenizeWords } from '../utils/text'
import type JSZip from 'jszip'
import { parseDocumentXml, extractParagraphs, parseNonNegativeNumber } from '../utils/documentXml'
import { loadSafeZip, readZipXml } from '../utils/safeArchive'
import { checkFileSize, checkMetadataSize, DocumentInputError, INPUT_LIMITS } from '../utils/inputLimits'
import type { DocumentMetadata } from '../types/analysis'

export interface DocxAnalysisResult {
  metadata: DocumentMetadata
  text: string
}

interface DocxParagraphData {
  text: string
  rsids: string[]
  style?: string
}

function parseIsoDate(s: unknown): Date | undefined {
  if (!s || typeof s !== 'string') return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function extractParagraphData(xmlStr: string): DocxParagraphData[] {
  const paragraphMatches = [...xmlStr.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]

  return paragraphMatches.map((match) => {
    const paragraphXml = match[0]

    const text = extractParagraphs(paragraphXml, 'docx').join(' ')

    const rsids = [
      ...new Set(
        [...paragraphXml.matchAll(/w:rsid(?:RDefault|R|P)?="([^"]+)"/g)].map(
          (rsidMatch) => rsidMatch[1]
        )
      ),
    ]

    const style = paragraphXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1]

    return { text, rsids, style }
  })
}

function detectRsid(xmlStr: string): boolean {
  return /w:rsid/i.test(xmlStr)
}

function detectTrackChanges(xmlStr: string): boolean {
  return /<w:ins\b|<w:del\b/i.test(xmlStr)
}

function detectComments(zip: JSZip): boolean {
  return zip.file('word/comments.xml') !== null
}

async function extractFontFamilies(zip: JSZip): Promise<string[]> {
  const fontFile = zip.file('word/fontTable.xml')
  if (!fontFile) return []
  const xml = (await readZipXml(zip, 'word/fontTable.xml'))!
  const matches = [...xml.matchAll(/w:name="([^"]+)"/g)]
  const fonts = matches
    .map((m) => m[1])
    .filter((f) => !f.startsWith('+') && !f.startsWith('@'))
  return [...new Set(fonts)]
}

export async function analyzeDocx(file: File): Promise<DocxAnalysisResult> {
  checkFileSize(file)
  const buffer = await file.arrayBuffer()
  const zip = await loadSafeZip(buffer)
  const typesXml = (await readZipXml(zip, '[Content_Types].xml', true))!
  const types = parseDocumentXml(typesXml)['Types']
  const overrides = types?.Override ? (Array.isArray(types.Override) ? types.Override : [types.Override]) : []
  if (!overrides.some((entry: Record<string, unknown>) => entry['@_PartName'] === '/word/document.xml' &&
    entry['@_ContentType'] === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')) {
    throw new DocumentInputError('invalid')
  }

  let author: string | undefined
  let lastModifiedBy: string | undefined
  let createdAt: Date | undefined
  let modifiedAt: Date | undefined
  let revisions: number | undefined
  let title: string | undefined
  let subject: string | undefined
  let keywords: string | undefined
  let description: string | undefined

  const coreFile = zip.file('docProps/core.xml')
  if (coreFile) {
    const coreXml = (await readZipXml(zip, 'docProps/core.xml'))!
    const core = parseDocumentXml(coreXml)
    const props = core['cp:coreProperties'] ?? core['coreProperties'] ?? {}
    author = props['dc:creator']?.['#text'] ?? props['dc:creator'] ?? undefined
    lastModifiedBy =
      props['cp:lastModifiedBy']?.['#text'] ?? props['cp:lastModifiedBy'] ?? undefined
    title = props['dc:title']?.['#text'] ?? props['dc:title'] ?? undefined
    subject = props['dc:subject']?.['#text'] ?? props['dc:subject'] ?? undefined
    description =
      props['dc:description']?.['#text'] ?? props['dc:description'] ?? undefined
    keywords =
      props['cp:keywords']?.['#text'] ?? props['cp:keywords'] ?? undefined
    createdAt = parseIsoDate(
      props['dcterms:created']?.['#text'] ?? props['dcterms:created']
    )
    modifiedAt = parseIsoDate(
      props['dcterms:modified']?.['#text'] ?? props['dcterms:modified']
    )
    const rev =
      props['cp:revision']?.['#text'] ?? props['cp:revision']
    revisions = parseNonNegativeNumber(rev)
  }

  let editingTimeMinutes: number | undefined
  let wordCount: number | undefined
  let pageCount: number | undefined
  let paragraphCount: number | undefined
  let lineCount: number | undefined
  let creator: string | undefined

  const appFile = zip.file('docProps/app.xml')
  if (appFile) {
    const appXml = (await readZipXml(zip, 'docProps/app.xml'))!
    const app = parseDocumentXml(appXml)
    const props = app['Properties'] ?? {}
    editingTimeMinutes = parseNonNegativeNumber(props['TotalTime'])
    wordCount = parseNonNegativeNumber(props['Words'])
    pageCount = parseNonNegativeNumber(props['Pages'])
    paragraphCount = parseNonNegativeNumber(props['Paragraphs'])
    lineCount = parseNonNegativeNumber(props['Lines'])
    creator = props['Application'] ?? undefined
  }

  let text = ''
  let hasRevisionIds = false
  let hasTrackChanges = false
  let rsidCount: number | undefined
  let rsidCoverageRatio: number | undefined
  let dominantRsidRatio: number | undefined
  let paragraphStyleCount: number | undefined
  let paragraphStyles: string[] | undefined

  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new DocumentInputError('invalid')
  if (docFile) {
    const docXml = (await readZipXml(zip, 'word/document.xml', true))!
    if (!parseDocumentXml(docXml)['w:document']) throw new DocumentInputError('invalid')
    const paragraphs = extractParagraphData(docXml)
    const textParagraphs = paragraphs
      .map((paragraph) => paragraph.text)
      .filter(Boolean)

    text = textParagraphs.join('\n\n')
    if (text.length > INPUT_LIMITS.textCharacters) throw new DocumentInputError('limit')
    hasRevisionIds = detectRsid(docXml)
    hasTrackChanges = detectTrackChanges(docXml)

    const paragraphsWithText = paragraphs.filter((paragraph) => paragraph.text)
    const paragraphsWithRsid = paragraphsWithText.filter((paragraph) => paragraph.rsids.length > 0)
    const rsidCounts = new Map<string, number>()

    for (const paragraph of paragraphsWithRsid) {
      for (const rsid of paragraph.rsids) {
        rsidCounts.set(rsid, (rsidCounts.get(rsid) ?? 0) + 1)
      }
    }

    rsidCount = rsidCounts.size || undefined
    rsidCoverageRatio = paragraphsWithText.length
      ? paragraphsWithRsid.length / paragraphsWithText.length
      : undefined
    dominantRsidRatio =
      paragraphsWithRsid.length && rsidCounts.size
        ? Array.from(rsidCounts.values()).reduce((maximum, count) => Math.max(maximum, count), 0) / paragraphsWithRsid.length
        : undefined

    const styles = [
      ...new Set(
        paragraphsWithText
          .map((paragraph) => paragraph.style)
          .filter((style): style is string => Boolean(style))
      ),
    ]
    paragraphStyleCount = styles.length || undefined
    paragraphStyles = styles.length ? styles.slice(0, 12) : undefined

    if (paragraphsWithText.length > 0) {
      paragraphCount = paragraphsWithText.length
    }

    {
      const extractedWordCount = tokenizeWords(text).length
      wordCount = extractedWordCount || undefined
    }
  }

  const hasComments = detectComments(zip)
  const fontFamilies = await extractFontFamilies(zip)

  const metadata: DocumentMetadata = {
    author: typeof author === 'string' && author ? author : undefined,
    lastModifiedBy:
      typeof lastModifiedBy === 'string' && lastModifiedBy
        ? lastModifiedBy
        : undefined,
    creator: typeof creator === 'string' && creator ? creator : undefined,
    createdAt,
    modifiedAt,
    revisions,
    editingTimeMinutes,
    wordCount,
    pageCount,
    paragraphCount,
    lineCount,
    title: typeof title === 'string' ? title : undefined,
    subject: typeof subject === 'string' ? subject : undefined,
    keywords: typeof keywords === 'string' ? keywords : undefined,
    description: typeof description === 'string' ? description : undefined,
    hasTrackChanges,
    hasComments,
    hasRevisionIds,
    fontFamilyCount: fontFamilies.length,
    fontFamilies,
    rsidCount,
    rsidCoverageRatio,
    dominantRsidRatio,
    paragraphStyleCount,
    paragraphStyles,
  }

  checkMetadataSize(metadata)
  return {
    metadata,
    text: text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n'),
  }
}
