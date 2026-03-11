import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { DocumentMetadata } from '../types/analysis'

export interface DocxAnalysisResult {
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

function parseDurationMinutes(s: unknown): number | undefined {
  if (s === undefined || s === null) return undefined
  // TotalTime en app.xml es en minutos (entero)
  const n = typeof s === 'string' ? parseInt(s, 10) : Number(s)
  return isNaN(n) ? undefined : n
}

function extractText(obj: unknown): string {
  if (typeof obj === 'string') return obj
  if (Array.isArray(obj)) return obj.map(extractText).join(' ')
  if (obj && typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>)
      .map(extractText)
      .join(' ')
  }
  return ''
}

// Extrae el texto de todos los elementos w:t dentro del XML del documento
function extractDocumentText(xmlStr: string): string {
  const matches = [...xmlStr.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
  return matches.map((m) => m[1]).join(' ')
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

  const docFile = zip.file('word/document.xml')
  if (docFile) {
    const docXml = await docFile.async('string')
    text = extractDocumentText(docXml)
    hasRevisionIds = detectRsid(docXml)
    hasTrackChanges = detectTrackChanges(docXml)
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
  }

  return { metadata, text: text.replace(/\s+/g, ' ').trim() }
}
