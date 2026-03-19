import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

import type { DocumentMetadata } from '../types/analysis'

// pdfjs-dist se carga dinámicamente para evitar problemas con workers
let pdfjsLib: typeof import('pdfjs-dist') | null = null
let pdfWorker: Worker | null = null

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist')
  }

  if (!pdfWorker) {
    pdfWorker = new PdfWorker()
    pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorker
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

function scanPdfStructure(arrayBuffer: ArrayBuffer) {
  const rawPdf = new TextDecoder('latin1').decode(new Uint8Array(arrayBuffer))

  return {
    hasC2paManifest: /c2pa/i.test(rawPdf),
    hasEmbeddedFiles: /\/EmbeddedFiles\b|\/Filespec\b|\/AF\b/.test(rawPdf),
  }
}

export async function analyzePdf(file: File): Promise<PdfAnalysisResult> {
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const structure = scanPdfStructure(arrayBuffer)

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
    hasC2paManifest: structure.hasC2paManifest,
    hasEmbeddedFiles: structure.hasEmbeddedFiles,
  }

  // --- Text extraction ---
  const textParts: string[] = []
  let totalTextItems = 0
  let tinyTextItemCount = 0
  let overlappingTextItemCount = 0
  let suspiciousTextLayerPages = 0
  const seenTextItems = new Set<string>()

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    let pageTextItems = 0
    let pageTinyTextItems = 0

    for (const item of content.items) {
      if (!('str' in item)) continue
      const text = item.str.trim()
      if (!text) continue

      const transform = Array.isArray(item.transform) ? item.transform : [0, 0, 0, 0, 0, 0]
      const height =
        typeof item.height === 'number' && Number.isFinite(item.height)
          ? item.height
          : Math.abs(transform[3] ?? 0)

      pageTextItems += 1
      totalTextItems += 1

      if (height > 0 && height < 3) {
        tinyTextItemCount += 1
        pageTinyTextItems += 1
      }

      const positionKey = [
        i,
        Math.round((transform[4] ?? 0) * 10),
        Math.round((transform[5] ?? 0) * 10),
        Math.round(height * 10),
        text,
      ].join(':')

      if (seenTextItems.has(positionKey)) {
        overlappingTextItemCount += 1
      } else {
        seenTextItems.add(positionKey)
      }
    }

    if (pageTextItems >= 40 && pageTinyTextItems / pageTextItems >= 0.5) {
      suspiciousTextLayerPages += 1
    }

    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    textParts.push(pageText)
  }
  const text = textParts.join('\n\n')

  // Contar palabras aproximadas
  const words = text.trim().split(/\s+/).filter(Boolean)
  metadata.wordCount = words.length
  metadata.tinyTextItemCount = tinyTextItemCount || undefined
  metadata.tinyTextRatio = totalTextItems ? tinyTextItemCount / totalTextItems : undefined
  metadata.overlappingTextItemCount = overlappingTextItemCount || undefined
  metadata.suspiciousTextLayerPages = suspiciousTextLayerPages || undefined

  return { metadata, text }
}
