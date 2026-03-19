import type { AnalysisResult, RiskFlag } from '../types/analysis'
import { TRANSLATIONS, type Locale } from '../i18n'

type RgbColor = [number, number, number]

interface ReportOptions {
  analyses: AnalysisResult[]
  locale: Locale
}

const PAGE_MARGIN = 14
const FOOTER_HEIGHT = 10
const LINE_HEIGHT = 4.5

const LEVEL_STYLES: Record<
  AnalysisResult['score']['level'],
  { fill: RgbColor; soft: RgbColor; text: RgbColor; bar: RgbColor }
> = {
  low: {
    fill: [22, 163, 74],
    soft: [220, 252, 231],
    text: [21, 128, 61],
    bar: [34, 197, 94],
  },
  moderate: {
    fill: [217, 119, 6],
    soft: [254, 243, 199],
    text: [180, 83, 9],
    bar: [245, 158, 11],
  },
  high: {
    fill: [234, 88, 12],
    soft: [255, 237, 213],
    text: [194, 65, 12],
    bar: [249, 115, 22],
  },
  critical: {
    fill: [220, 38, 38],
    soft: [254, 226, 226],
    text: [185, 28, 28],
    bar: [239, 68, 68],
  },
}

const SEVERITY_STYLES: Record<RiskFlag['severity'], { fill: RgbColor; text: RgbColor }> = {
  high: { fill: [254, 226, 226], text: [185, 28, 28] },
  medium: { fill: [254, 243, 199], text: [180, 83, 9] },
  low: { fill: [219, 234, 254], text: [29, 78, 216] },
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

function formatPercent(value?: number): string {
  return value === undefined ? '-' : `${(value * 100).toFixed(0)}%`
}

function formatBoolean(value: boolean | undefined, yesLabel: string, noLabel: string): string {
  if (value === undefined) return '-'
  return value ? yesLabel : noLabel
}

function truncateText(value: string, maxLength = 150): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function joinList(values: string[], maxItems = 5): string {
  if (values.length === 0) return '-'
  const slice = values.slice(0, maxItems)
  return values.length > maxItems ? `${slice.join(', ')}…` : slice.join(', ')
}

function summarizeSoftware(result: AnalysisResult): string {
  const values = [result.metadata.creator, result.metadata.producer, result.metadata.generator]
    .filter(Boolean)
    .map((value) => value?.trim())
    .filter(Boolean) as string[]

  return values.length > 0 ? values.join(' | ') : '-'
}

function splitText(doc: any, text: string, width: number): string[] {
  return doc.splitTextToSize(text || '-', width) as string[]
}

export async function generateAnalysisPdfReport({
  analyses,
  locale,
}: ReportOptions): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const t = TRANSLATIONS[locale] as (typeof TRANSLATIONS)['es']
  const doc = new jsPDF({ compress: true, unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - PAGE_MARGIN * 2
  const cardGap = 4
  const columnGap = 4
  const columnWidth = (contentWidth - columnGap) / 2
  const timestamp = new Date()
  const fileStamp = timestamp
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '')

  let y = PAGE_MARGIN

  const ensureSpace = (requiredHeight: number) => {
    if (y + requiredHeight <= pageHeight - PAGE_MARGIN - FOOTER_HEIGHT) return
    doc.addPage()
    y = PAGE_MARGIN
  }

  const startNewPage = () => {
    doc.addPage()
    y = PAGE_MARGIN
  }

  const drawTextBlock = (
    text: string,
    x: number,
    width: number,
    options?: {
      fontSize?: number
      fontStyle?: 'normal' | 'bold'
      color?: RgbColor
      lineHeight?: number
    }
  ): number => {
    const fontSize = options?.fontSize ?? 10
    const fontStyle = options?.fontStyle ?? 'normal'
    const color = options?.color ?? [51, 65, 85]
    const lineHeight = options?.lineHeight ?? LINE_HEIGHT
    const lines = splitText(doc, text, width)

    doc.setFont('helvetica', fontStyle)
    doc.setFontSize(fontSize)
    doc.setTextColor(...color)
    doc.text(lines, x, y)

    return lines.length * lineHeight
  }

  const drawMetricCard = (
    x: number,
    top: number,
    width: number,
    label: string,
    value: string,
    accent: RgbColor,
    soft: RgbColor
  ) => {
    const height = 24
    doc.setFillColor(...soft)
    doc.roundedRect(x, top, width, height, 3, 3, 'F')
    doc.setFillColor(...accent)
    doc.roundedRect(x, top, width, 4, 3, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(71, 85, 105)
    doc.text(label, x + 4, top + 10)
    doc.setFontSize(16)
    doc.setTextColor(...accent)
    doc.text(value, x + 4, top + 18)
  }

  const drawLabeledRowsCard = (
    title: string,
    rows: Array<{ label: string; value: string }>,
    accent: RgbColor,
    soft: RgbColor
  ) => {
    const bodyWidth = contentWidth - 12
    const labelWidth = 42
    const valueWidth = bodyWidth - labelWidth

    const rowHeights = rows.map((row) => {
      const labelLines = splitText(doc, row.label, labelWidth)
      const valueLines = splitText(doc, row.value, valueWidth)
      return Math.max(labelLines.length, valueLines.length) * LINE_HEIGHT + 2
    })

    const height = 12 + rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + 4
    ensureSpace(height + cardGap)

    const top = y
    doc.setFillColor(...soft)
    doc.roundedRect(PAGE_MARGIN, top, contentWidth, height, 3, 3, 'F')
    doc.setFillColor(...accent)
    doc.roundedRect(PAGE_MARGIN, top, contentWidth, 9, 3, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text(title, PAGE_MARGIN + 4, top + 6)

    let currentY = top + 14
    rows.forEach((row, index) => {
      const labelLines = splitText(doc, row.label, labelWidth)
      const valueLines = splitText(doc, row.value, valueWidth)
      const blockHeight = rowHeights[index]

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(71, 85, 105)
      doc.text(labelLines, PAGE_MARGIN + 4, currentY)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(15, 23, 42)
      doc.text(valueLines, PAGE_MARGIN + 4 + labelWidth + 4, currentY)

      currentY += blockHeight
      if (index < rows.length - 1) {
        doc.setDrawColor(226, 232, 240)
        doc.line(PAGE_MARGIN + 4, currentY - 1.5, pageWidth - PAGE_MARGIN - 4, currentY - 1.5)
      }
    })

    y += height + cardGap
  }

  const drawScoreBreakdownCard = (analysis: AnalysisResult) => {
    const style = LEVEL_STYLES[analysis.score.level]
    const top = y
    const height = 42
    ensureSpace(height + cardGap)

    doc.setFillColor(248, 250, 252)
    doc.roundedRect(PAGE_MARGIN, top, contentWidth, height, 3, 3, 'F')
    doc.setFillColor(...style.fill)
    doc.roundedRect(PAGE_MARGIN, top, contentWidth, 7, 3, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text(t.report.scoreBreakdown, PAGE_MARGIN + 4, top + 5)

    doc.setFontSize(18)
    doc.setTextColor(...style.text)
    doc.text(`${analysis.score.total}/100`, PAGE_MARGIN + 4, top + 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    doc.text(t.score.levels[analysis.score.level], PAGE_MARGIN + 4, top + 24)

    const barX = PAGE_MARGIN + 4
    const barYStart = top + 30
    const barWidth = contentWidth - 8
    const rows = [
      { label: t.score.metadata, value: analysis.score.metadataScore, max: 40 },
      { label: t.score.linguistic, value: analysis.score.linguisticScore, max: 40 },
      { label: t.score.fingerprint, value: analysis.score.fingerprintScore, max: 20 },
    ]

    rows.forEach((row, index) => {
      const currentY = barYStart + index * 4
      const railX = barX + 36
      const railWidth = barWidth - 36
      const fillWidth = Math.max((row.value / row.max) * railWidth, 2)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(51, 65, 85)
      doc.text(`${row.label} ${row.value}/${row.max}`, barX, currentY - 0.6)

      doc.setFillColor(226, 232, 240)
      doc.roundedRect(railX, currentY - 2.2, railWidth, 2.4, 1.2, 1.2, 'F')
      doc.setFillColor(...style.bar)
      doc.roundedRect(railX, currentY - 2.2, fillWidth, 2.4, 1.2, 1.2, 'F')
    })

    y += height + cardGap
  }

  const drawSeveritySummaryCard = (analysis: AnalysisResult) => {
    const counts = {
      high: analysis.score.flags.filter((flag) => flag.severity === 'high').length,
      medium: analysis.score.flags.filter((flag) => flag.severity === 'medium').length,
      low: analysis.score.flags.filter((flag) => flag.severity === 'low').length,
    }

    drawLabeledRowsCard(
      t.report.severityBreakdown,
      [
        { label: t.score.sevHigh, value: String(counts.high) },
        { label: t.score.sevMedium, value: String(counts.medium) },
        { label: t.score.sevLow, value: String(counts.low) },
      ],
      [71, 85, 105],
      [248, 250, 252]
    )
  }

  const drawFlagCard = (analysis: AnalysisResult) => {
    const style = LEVEL_STYLES[analysis.score.level]
    const topSignals = analysis.score.flags
      .slice()
      .sort((left, right) => right.points - left.points)
      .slice(0, 3)

    drawLabeledRowsCard(
      t.report.topSignals,
      topSignals.length > 0
        ? topSignals.map((flag) => ({
            label: flag.label,
            value: truncateText(flag.detail, 220),
          }))
        : [{ label: t.report.topSignals, value: t.report.noTopSignals }],
      style.fill,
      style.soft
    )

    if (analysis.score.flags.length === 0) {
      return
    }

    ensureSpace(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(30, 41, 59)
    doc.text(t.report.flags, PAGE_MARGIN, y + 4)
    y += 8

    analysis.score.flags.forEach((flag) => {
      const severityStyle = SEVERITY_STYLES[flag.severity]
      const text = `${flag.label}: ${flag.detail}`
      const lines = splitText(doc, text, contentWidth - 10)
      const height = lines.length * LINE_HEIGHT + 7
      ensureSpace(height + 2)

      doc.setFillColor(...severityStyle.fill)
      doc.roundedRect(PAGE_MARGIN, y, contentWidth, height, 2, 2, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...severityStyle.text)
      doc.text(flag.severity.toUpperCase(), PAGE_MARGIN + 3, y + 5)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.text(lines, PAGE_MARGIN + 16, y + 5)
      y += height + 2
    })
  }

  const drawSummaryPage = () => {
    const averageScore =
      analyses.reduce((sum, analysis) => sum + analysis.score.total, 0) / Math.max(analyses.length, 1)
    const flaggedDocuments = analyses.filter((analysis) => analysis.score.flags.length > 0).length
    const totalAlerts = analyses.reduce((sum, analysis) => sum + analysis.score.flags.length, 0)
    const riskCounts = analyses.reduce<Record<AnalysisResult['score']['level'], number>>(
      (acc, analysis) => {
        acc[analysis.score.level] += 1
        return acc
      },
      { low: 0, moderate: 0, high: 0, critical: 0 }
    )
    const highestRiskDocuments = analyses
      .slice()
      .sort((left, right) => right.score.total - left.score.total)
      .slice(0, 5)

    doc.setFillColor(15, 23, 42)
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, 34, 4, 4, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(255, 255, 255)
    doc.text(t.report.title, PAGE_MARGIN + 5, y + 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(t.report.subtitle, PAGE_MARGIN + 5, y + 19)
    doc.text(`${t.report.generatedAt}: ${formatDate(timestamp, locale)}`, PAGE_MARGIN + 5, y + 26)
    y += 40

    const summaryStyle = LEVEL_STYLES.high
    drawMetricCard(
      PAGE_MARGIN,
      y,
      columnWidth,
      t.report.reviewedDocuments,
      String(analyses.length),
      summaryStyle.fill,
      [255, 237, 213]
    )
    drawMetricCard(
      PAGE_MARGIN + columnWidth + columnGap,
      y,
      columnWidth,
      t.report.averageScore,
      `${averageScore.toFixed(1)}/100`,
      [37, 99, 235],
      [219, 234, 254]
    )
    y += 28

    drawMetricCard(
      PAGE_MARGIN,
      y,
      columnWidth,
      t.report.flaggedDocuments,
      String(flaggedDocuments),
      [124, 58, 237],
      [237, 233, 254]
    )
    drawMetricCard(
      PAGE_MARGIN + columnWidth + columnGap,
      y,
      columnWidth,
      t.report.totalAlerts,
      String(totalAlerts),
      [220, 38, 38],
      [254, 226, 226]
    )
    y += 32

    drawLabeledRowsCard(
      t.report.riskDistribution,
      (['low', 'moderate', 'high', 'critical'] as const).map((level) => ({
        label: t.report.riskLevelNames[level],
        value: String(riskCounts[level]),
      })),
      [51, 65, 85],
      [248, 250, 252]
    )

    drawLabeledRowsCard(
      t.report.highestRiskDocuments,
      highestRiskDocuments.length > 0
        ? highestRiskDocuments.map((analysis) => ({
            label: truncateText(analysis.fileName, 60),
            value: `${analysis.score.total}/100 | ${t.report.riskLevelNames[analysis.score.level]}`,
          }))
        : [{ label: t.report.highestRiskDocuments, value: t.report.noData }],
      [30, 41, 59],
      [241, 245, 249]
    )
  }

  const drawDocumentPage = (analysis: AnalysisResult, index: number) => {
    const style = LEVEL_STYLES[analysis.score.level]

    startNewPage()

    doc.setFillColor(...style.fill)
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, 28, 4, 4, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.text(t.report.sectionLabel(index + 1, analyses.length), PAGE_MARGIN + 5, y + 9)
    doc.setFontSize(12)
    doc.text(truncateText(analysis.fileName, 80), PAGE_MARGIN + 5, y + 17)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(
      `${analysis.fileType.toUpperCase()} | ${formatSize(analysis.fileSize)} | ${formatDate(analysis.analyzedAt, locale)}`,
      PAGE_MARGIN + 5,
      y + 24
    )

    doc.setFillColor(255, 255, 255)
    doc.roundedRect(pageWidth - PAGE_MARGIN - 34, y + 5, 28, 12, 3, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...style.text)
    doc.text(String(analysis.score.total), pageWidth - PAGE_MARGIN - 25, y + 13, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('/100', pageWidth - PAGE_MARGIN - 25, y + 17, { align: 'center' })

    y += 34

    drawScoreBreakdownCard(analysis)
    drawSeveritySummaryCard(analysis)

    drawLabeledRowsCard(
      t.report.documentOverview,
      [
        { label: t.report.fileName, value: analysis.fileName },
        { label: t.report.fileType, value: analysis.fileType.toUpperCase() },
        { label: t.report.fileSize, value: formatSize(analysis.fileSize) },
        { label: t.report.score, value: `${analysis.score.total}/100` },
      ],
      [37, 99, 235],
      [239, 246, 255]
    )

    drawLabeledRowsCard(
      t.report.metadataDetails,
      [
        { label: t.metadata.author, value: analysis.metadata.author?.trim() || '-' },
        { label: t.metadata.lastModifiedBy, value: analysis.metadata.lastModifiedBy?.trim() || '-' },
        { label: t.metadata.title, value: analysis.metadata.title?.trim() || '-' },
        { label: t.metadata.creator, value: analysis.metadata.creator?.trim() || '-' },
        { label: t.metadata.producer, value: analysis.metadata.producer?.trim() || '-' },
        { label: t.metadata.generator, value: analysis.metadata.generator?.trim() || '-' },
        {
          label: t.metadata.createdAt,
          value: analysis.metadata.createdAt ? formatDate(analysis.metadata.createdAt, locale) : '-',
        },
        {
          label: t.metadata.modifiedAt,
          value: analysis.metadata.modifiedAt ? formatDate(analysis.metadata.modifiedAt, locale) : '-',
        },
        { label: t.metadata.editingTime, value: formatMinutes(analysis.metadata.editingTimeMinutes) },
        { label: t.metadata.revisions, value: analysis.metadata.revisions?.toString() ?? '-' },
      ],
      [14, 116, 144],
      [236, 254, 255]
    )

    drawLabeledRowsCard(
      t.report.linguisticSummary,
      [
        { label: t.linguistic.words, value: String(analysis.linguistic.totalWords) },
        { label: t.linguistic.sentences, value: String(analysis.linguistic.totalSentences) },
        { label: t.linguistic.paragraphs, value: String(analysis.linguistic.totalParagraphs) },
        { label: t.linguistic.burstiness, value: analysis.linguistic.stdSentenceLength.toFixed(2) },
        { label: t.linguistic.avgSentence, value: analysis.linguistic.avgSentenceLength.toFixed(2) },
        { label: t.linguistic.ttr, value: `${(analysis.linguistic.typeTokenRatio * 100).toFixed(1)}%` },
        { label: t.linguistic.entropy, value: analysis.linguistic.shannonEntropy.toFixed(2) },
        { label: t.linguistic.pronouns, value: `${analysis.linguistic.pronounRatio.toFixed(2)}%` },
        { label: t.linguistic.questions, value: `${analysis.linguistic.questionRatio.toFixed(1)}%` },
        { label: t.linguistic.styleHotspots, value: String(analysis.linguistic.styleChangeHotspotCount) },
        { label: t.linguistic.aiPhrases, value: joinList(analysis.linguistic.aiPhrasesFound) },
        { label: t.linguistic.slopPhrases, value: joinList(analysis.linguistic.slopPhrasesFound) },
      ],
      [126, 34, 206],
      [250, 245, 255]
    )

    drawLabeledRowsCard(
      t.report.fingerprintSummary,
      [
        { label: t.report.software, value: summarizeSoftware(analysis) },
        {
          label: t.metadata.hasTrackChanges,
          value: formatBoolean(analysis.metadata.hasTrackChanges, t.metadata.yes, t.metadata.no),
        },
        {
          label: t.metadata.hasComments,
          value: formatBoolean(analysis.metadata.hasComments, t.metadata.yes, t.metadata.no),
        },
        {
          label: t.metadata.hasRevisionIds,
          value: formatBoolean(analysis.metadata.hasRevisionIds, t.metadata.yes, t.metadata.no),
        },
        { label: t.fingerprint.rsidCount, value: analysis.metadata.rsidCount?.toString() ?? '-' },
        { label: t.fingerprint.rsidCoverage, value: formatPercent(analysis.metadata.rsidCoverageRatio) },
        { label: t.fingerprint.dominantRsid, value: formatPercent(analysis.metadata.dominantRsidRatio) },
        {
          label: t.fingerprint.paragraphStyles,
          value: analysis.metadata.paragraphStyles?.length
            ? `${analysis.metadata.paragraphStyleCount ?? analysis.metadata.paragraphStyles.length} | ${joinList(analysis.metadata.paragraphStyles, 4)}`
            : analysis.metadata.paragraphStyleCount?.toString() ?? '-',
        },
        {
          label: t.fingerprint.provenanceManifest,
          value: formatBoolean(analysis.metadata.hasC2paManifest, t.metadata.yes, t.metadata.no),
        },
        {
          label: t.fingerprint.embeddedFiles,
          value: formatBoolean(analysis.metadata.hasEmbeddedFiles, t.metadata.yes, t.metadata.no),
        },
        {
          label: t.fingerprint.tinyText,
          value:
            analysis.metadata.tinyTextItemCount !== undefined
              ? `${analysis.metadata.tinyTextItemCount} | ${formatPercent(analysis.metadata.tinyTextRatio)}`
              : '-',
        },
        {
          label: t.fingerprint.overlappingText,
          value: analysis.metadata.overlappingTextItemCount?.toString() ?? '-',
        },
        {
          label: t.fingerprint.suspiciousPages,
          value: analysis.metadata.suspiciousTextLayerPages?.toString() ?? '-',
        },
      ],
      [194, 65, 12],
      [255, 247, 237]
    )

    drawFlagCard(analysis)
  }

  drawSummaryPage()
  analyses.forEach(drawDocumentPage)

  const totalPages = doc.getNumberOfPages()
  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
    doc.setPage(pageIndex)
    doc.setDrawColor(226, 232, 240)
    doc.line(PAGE_MARGIN, pageHeight - FOOTER_HEIGHT, pageWidth - PAGE_MARGIN, pageHeight - FOOTER_HEIGHT)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(t.report.title, PAGE_MARGIN, pageHeight - 4)
    doc.text(`${pageIndex}/${totalPages}`, pageWidth - PAGE_MARGIN, pageHeight - 4, { align: 'right' })
  }

  doc.save(t.report.outputFileName(fileStamp))
}
