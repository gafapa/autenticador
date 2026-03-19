import type { AnalysisResult, RiskFlag } from '../types/analysis'
import type { Locale } from '../i18n'

interface ReportLabels {
  title: string
  generatedAt: string
  sessionSummary: string
  reviewedDocuments: string
  averageScore: string
  riskDistribution: string
  fileName: string
  fileType: string
  analyzedAt: string
  fileSize: string
  score: string
  metadataSummary: string
  author: string
  revisions: string
  editingTime: string
  createdAt: string
  modifiedAt: string
  software: string
  linguisticSummary: string
  words: string
  sentences: string
  paragraphs: string
  styleHotspots: string
  aiPhrases: string
  slopPhrases: string
  flags: string
  noFlags: string
  riskLevelLabel: string
  riskLevelName: (level: AnalysisResult['score']['level']) => string
  sectionLabel: (index: number, total: number) => string
  outputFileName: (stamp: string) => string
}

interface ReportOptions {
  analyses: AnalysisResult[]
  locale: Locale
  labels: ReportLabels
}

function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatMinutes(minutes?: number): string {
  if (minutes === undefined) return '-'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`
}

function summarizeSoftware(result: AnalysisResult): string {
  const values = [result.metadata.creator, result.metadata.producer, result.metadata.generator]
    .filter(Boolean)
    .map((value) => value?.trim())
    .filter(Boolean) as string[]

  return values.length > 0 ? values.join(' | ') : '-'
}

function joinPhrases(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '-'
}

function severityPrefix(flag: RiskFlag): string {
  return `[${flag.severity.toUpperCase()}]`
}

export async function generateAnalysisPdfReport({
  analyses,
  locale,
  labels,
}: ReportOptions): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ compress: true, unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  const lineHeight = 5
  let y = margin

  const ensureSpace = (requiredHeight: number) => {
    if (y + requiredHeight <= pageHeight - margin) return
    doc.addPage()
    y = margin
  }

  const addTextBlock = (
    text: string,
    fontSize = 10,
    fontStyle: 'normal' | 'bold' = 'normal',
    color: [number, number, number] = [55, 65, 81]
  ) => {
    doc.setFont('helvetica', fontStyle)
    doc.setFontSize(fontSize)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(text, contentWidth)
    ensureSpace(lines.length * lineHeight + 2)
    doc.text(lines, margin, y)
    y += lines.length * lineHeight + 2
  }

  const addDivider = () => {
    ensureSpace(4)
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, y, pageWidth - margin, y)
    y += 4
  }

  const addKeyValue = (label: string, value: string) => {
    addTextBlock(`${label}: ${value}`)
  }

  const averageScore =
    analyses.reduce((sum, analysis) => sum + analysis.score.total, 0) / Math.max(analyses.length, 1)

  const riskCounts = analyses.reduce<Record<string, number>>((acc, analysis) => {
    acc[analysis.score.level] = (acc[analysis.score.level] ?? 0) + 1
    return acc
  }, {})

  const timestamp = new Date()
  const fileStamp = timestamp
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(15, 23, 42)
  doc.text(labels.title, margin, y)
  y += 10

  addTextBlock(`${labels.generatedAt}: ${formatDate(timestamp, locale)}`, 10)
  addDivider()
  addTextBlock(labels.sessionSummary, 13, 'bold', [30, 41, 59])
  addKeyValue(labels.reviewedDocuments, String(analyses.length))
  addKeyValue(labels.averageScore, `${averageScore.toFixed(1)}/100`)
  addKeyValue(
    labels.riskDistribution,
    ['low', 'moderate', 'high', 'critical']
      .map((level) => `${labels.riskLevelName(level as AnalysisResult['score']['level'])}: ${riskCounts[level] ?? 0}`)
      .join(' | ')
  )

  analyses.forEach((analysis, index) => {
    addDivider()
    addTextBlock(labels.sectionLabel(index + 1, analyses.length), 13, 'bold', [15, 23, 42])
    addKeyValue(labels.fileName, analysis.fileName)
    addKeyValue(labels.fileType, analysis.fileType.toUpperCase())
    addKeyValue(labels.analyzedAt, formatDate(analysis.analyzedAt, locale))
    addKeyValue(labels.fileSize, formatSize(analysis.fileSize))
    addKeyValue(
      labels.score,
      `${analysis.score.total}/100 | ${labels.riskLevelLabel}: ${labels.riskLevelName(analysis.score.level)}`
    )

    y += 1
    addTextBlock(labels.metadataSummary, 11, 'bold', [30, 41, 59])
    addKeyValue(labels.author, analysis.metadata.author?.trim() || '-')
    addKeyValue(labels.revisions, analysis.metadata.revisions?.toString() ?? '-')
    addKeyValue(labels.editingTime, formatMinutes(analysis.metadata.editingTimeMinutes))
    addKeyValue(
      labels.createdAt,
      analysis.metadata.createdAt ? formatDate(analysis.metadata.createdAt, locale) : '-'
    )
    addKeyValue(
      labels.modifiedAt,
      analysis.metadata.modifiedAt ? formatDate(analysis.metadata.modifiedAt, locale) : '-'
    )
    addKeyValue(labels.software, summarizeSoftware(analysis))

    y += 1
    addTextBlock(labels.linguisticSummary, 11, 'bold', [30, 41, 59])
    addKeyValue(labels.words, String(analysis.linguistic.totalWords))
    addKeyValue(labels.sentences, String(analysis.linguistic.totalSentences))
    addKeyValue(labels.paragraphs, String(analysis.linguistic.totalParagraphs))
    addKeyValue(labels.styleHotspots, String(analysis.linguistic.styleChangeHotspotCount))
    addKeyValue(labels.aiPhrases, joinPhrases(analysis.linguistic.aiPhrasesFound))
    addKeyValue(labels.slopPhrases, joinPhrases(analysis.linguistic.slopPhrasesFound))

    y += 1
    addTextBlock(labels.flags, 11, 'bold', [30, 41, 59])
    if (analysis.score.flags.length === 0) {
      addTextBlock(labels.noFlags)
    } else {
      analysis.score.flags.forEach((flag) => {
        addTextBlock(`${severityPrefix(flag)} ${flag.label}: ${flag.detail}`, 9)
      })
    }
  })

  doc.save(labels.outputFileName(fileStamp))
}
