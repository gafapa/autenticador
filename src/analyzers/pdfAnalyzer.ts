import { tokenizeWords } from '../utils/text'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

import type { DocumentMetadata } from '../types/analysis'
import { parsePdfDate } from '../utils/pdfDate'
import { checkFileSize, checkMetadataSize, DocumentInputError, INPUT_LIMITS } from '../utils/inputLimits'

let pdfjsLib: typeof import('pdfjs-dist') | null = null

async function getPdfjs() {
  pdfjsLib ??= await import('pdfjs-dist')
  return pdfjsLib
}

export interface PdfAnalysisResult {
  metadata: DocumentMetadata
  text: string
}

function scanPdfStructure(arrayBuffer: ArrayBuffer) {
  const rawPdf = new TextDecoder('latin1').decode(new Uint8Array(arrayBuffer))

  return {
    hasC2paManifest: /c2pa/i.test(rawPdf),
    hasEmbeddedFiles: /\/EmbeddedFiles\b|\/Filespec\b|\/AF\b/.test(rawPdf),
  }
}

export async function analyzePdf(file: File): Promise<PdfAnalysisResult> {
  checkFileSize(file)
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const structure = scanPdfStructure(arrayBuffer)
  const workerPort = new PdfWorker()
  const worker = pdfjs.PDFWorker.create({ port: workerPort })
  const task = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), worker,
    disableFontFace: true, useSystemFonts: false })
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true
      reject(new DocumentInputError('limit'))
    }, 30_000)
  })
  const extract = async (): Promise<PdfAnalysisResult> => {
    const pdf = await task.promise
    if (pdf.numPages > INPUT_LIMITS.pdfPages) throw new DocumentInputError('limit')

    // --- Metadata ---
    const metaData = await pdf.getMetadata()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = (metaData?.info as Record<string, any>) ?? {}
    const xmpValue = (key: string): string | undefined => {
      const value = metaData?.metadata?.get(key)
      return typeof value === 'string' ? value : Array.isArray(value) ? value.filter(item => typeof item === 'string').join(', ') : undefined
    }
    const stringValue = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined

    const metadata: DocumentMetadata = {
      author: stringValue(info.Author) || xmpValue('dc:creator') || undefined,
      creator: stringValue(info.Creator) || xmpValue('xmp:CreatorTool') || undefined,
      producer: stringValue(info.Producer) || undefined,
      title: stringValue(info.Title) || xmpValue('dc:title') || undefined,
      subject: stringValue(info.Subject) || xmpValue('dc:subject') || undefined,
      keywords: stringValue(info.Keywords) || undefined,
      createdAt: parsePdfDate(info.CreationDate || xmpValue('xmp:CreateDate')),
      modifiedAt: parsePdfDate(info.ModDate || xmpValue('xmp:ModifyDate')),
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
    let extractedCharacters = 0

    for (let i = 1; i <= pdf.numPages; i++) {
      const seenTextItems = new Set<string>()
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
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
        .join('')
      extractedCharacters += pageText.length
      if (extractedCharacters > INPUT_LIMITS.textCharacters) throw new DocumentInputError('limit')
      page.cleanup()
      textParts.push(pageText)
    }
    const text = textParts.join('\n\n')

    // Approximate word count
    const words = tokenizeWords(text)
    metadata.wordCount = words.length
    metadata.tinyTextItemCount = tinyTextItemCount || undefined
    metadata.tinyTextRatio = totalTextItems ? tinyTextItemCount / totalTextItems : undefined
    metadata.overlappingTextItemCount = overlappingTextItemCount || undefined
    metadata.suspiciousTextLayerPages = suspiciousTextLayerPages || undefined

    checkMetadataSize(metadata)
    return { metadata, text }
  }
  try {
    return await Promise.race([extract(), deadline])
  } finally {
    clearTimeout(timeout!)
    if (timedOut) {
      void task.destroy().catch(() => {})
      worker.destroy()
      workerPort.terminate()
    } else {
      try { await task.destroy() } finally { worker.destroy(); workerPort.terminate() }
    }
  }
}
