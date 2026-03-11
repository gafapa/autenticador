import type { DocumentMetadata } from '../types/analysis'

// pdfjs-dist se carga dinámicamente para evitar problemas con workers
let pdfjsLib: typeof import('pdfjs-dist') | null = null

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist')
    // Usar worker local desde node_modules (CDN de respaldo)
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).href
  }
  return pdfjsLib
}

export interface PdfAnalysisResult {
  metadata: DocumentMetadata
  text: string
}

// Convierte la representación de fecha de pdfjs en Date
function parseDate(raw: unknown): Date | undefined {
  if (!raw) return undefined
  if (raw instanceof Date) return raw
  if (typeof raw === 'string') {
    // Formato PDF: "D:20240101120000+00'00'"
    const m = raw.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
    if (m) {
      return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`)
    }
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d
  }
  return undefined
}

function extractFromXmp(xmpStr: string, key: string): string | undefined {
  // Busca <key>value</key> o key="value"
  const tagMatch = xmpStr.match(new RegExp(`<[^>]*:?${key}[^>]*>([^<]+)<`, 'i'))
  if (tagMatch) return tagMatch[1].trim()
  const attrMatch = xmpStr.match(new RegExp(`${key}="([^"]+)"`, 'i'))
  if (attrMatch) return attrMatch[1].trim()
  return undefined
}

export async function analyzePdf(file: File): Promise<PdfAnalysisResult> {
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  // --- Metadata ---
  const metaData = await pdf.getMetadata()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info = (metaData?.info as Record<string, any>) ?? {}
  const xmpRaw = (metaData?.metadata as { getRaw?: () => string } | null)?.getRaw?.() ?? ''

  const metadata: DocumentMetadata = {
    author: info.Author || extractFromXmp(xmpRaw, 'dc:creator') || undefined,
    creator: info.Creator || extractFromXmp(xmpRaw, 'xmp:CreatorTool') || undefined,
    producer: info.Producer || undefined,
    title: info.Title || extractFromXmp(xmpRaw, 'dc:title') || undefined,
    subject: info.Subject || extractFromXmp(xmpRaw, 'dc:subject') || undefined,
    keywords: info.Keywords || undefined,
    createdAt: parseDate(info.CreationDate || extractFromXmp(xmpRaw, 'xmp:CreateDate')),
    modifiedAt: parseDate(info.ModDate || extractFromXmp(xmpRaw, 'xmp:ModifyDate')),
    pageCount: pdf.numPages,
  }

  // --- Text extraction ---
  const textParts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    textParts.push(pageText)
  }
  const text = textParts.join('\n\n')

  // Contar palabras aproximadas
  const words = text.trim().split(/\s+/).filter(Boolean)
  metadata.wordCount = words.length

  return { metadata, text }
}
