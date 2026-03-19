import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
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

function parseDurationMinutes(s: unknown): number | undefined {
  if (s === undefined || s === null) return undefined
  // TotalTime en app.xml es en minutos (entero)
  const n = typeof s === 'string' ? parseInt(s, 10) : Number(s)
  return isNaN(n) ? undefined : n
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractParagraphData(xmlStr: string): DocxParagraphData[] {
  const paragraphMatches = [...xmlStr.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]

  return paragraphMatches.map((match) => {
    const paragraphXml = match[0]
      .replace(/<w:tab\b[^>]*\/>/g, ' ')
      .replace(/<w:br\b[^>]*\/>/g, ' ')
      .replace(/<w:cr\b[^>]*\/>/g, ' ')

    const text = [...paragraphXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((textMatch) => decodeXmlEntities(textMatch[1]))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()

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

// Detecta si existen atributos rsid (revision save IDs) → indica edición real en Word
function detectRsid(xmlStr: string): boolean {
  return /w:rsid/i.test(xmlStr)
}

// Detecta track changes
function detectTrackChanges(xmlStr: string): boolean {
  return /<w:ins\b|<w:del\b/i.test(xmlStr)
}

// Detecta comentarios
function detectComments(zip: JSZip): boolean {
  return zip.file('word/comments.xml') !== null
}

// Extrae fuentes tipográficas usadas en el documento (word/fontTable.xml)
// Múltiples fuentes muy distintas = copia-pega de varias fuentes
async function extractFontFamilies(zip: JSZip): Promise<string[]> {
  const fontFile = zip.file('word/fontTable.xml')
  if (!fontFile) return []
  const xml = await fontFile.async('string')
  // <w:font w:name="Arial"> → extrae el atributo w:name
  const matches = [...xml.matchAll(/w:name="([^"]+)"/g)]
  const fonts = matches
    .map((m) => m[1])
    .filter((f) => !f.startsWith('+') && !f.startsWith('@')) // excluir fuentes de sistema
  return [...new Set(fonts)]
}

export async function analyzeDocx(file: File): Promise<DocxAnalysisResult> {
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  // --- core.xml ---
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
    const coreXml = await coreFile.async('string')
    const core = parser.parse(coreXml)
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
    revisions = rev ? parseInt(String(rev), 10) : undefined
  }

  // --- app.xml ---
  let editingTimeMinutes: number | undefined
  let wordCount: number | undefined
  let pageCount: number | undefined
  let paragraphCount: number | undefined
  let lineCount: number | undefined
  let creator: string | undefined

  const appFile = zip.file('docProps/app.xml')
  if (appFile) {
    const appXml = await appFile.async('string')
    const app = parser.parse(appXml)
    const props = app['Properties'] ?? {}
    editingTimeMinutes = parseDurationMinutes(props['TotalTime'])
    wordCount = props['Words'] ? parseInt(String(props['Words']), 10) : undefined
    pageCount = props['Pages'] ? parseInt(String(props['Pages']), 10) : undefined
    paragraphCount = props['Paragraphs']
      ? parseInt(String(props['Paragraphs']), 10)
      : undefined
    lineCount = props['Lines'] ? parseInt(String(props['Lines']), 10) : undefined
    creator = props['Application'] ?? undefined
  }

  // --- document.xml para texto y rsid ---
  let text = ''
  let hasRevisionIds = false
  let hasTrackChanges = false
  let rsidCount: number | undefined
  let rsidCoverageRatio: number | undefined
  let dominantRsidRatio: number | undefined
  let paragraphStyleCount: number | undefined
  let paragraphStyles: string[] | undefined

  const docFile = zip.file('word/document.xml')
  if (docFile) {
    const docXml = await docFile.async('string')
    const paragraphs = extractParagraphData(docXml)
    const textParagraphs = paragraphs
      .map((paragraph) => paragraph.text)
      .filter(Boolean)

    text = textParagraphs.join('\n\n')
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
        ? Math.max(...rsidCounts.values()) / paragraphsWithRsid.length
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

    if (paragraphCount === undefined && paragraphsWithText.length > 0) {
      paragraphCount = paragraphsWithText.length
    }

    if (wordCount === undefined) {
      const extractedWordCount = textParagraphs.join(' ').split(/\s+/).filter(Boolean).length
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

  return {
    metadata,
    text: text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n'),
  }
}
