import type { DocumentMetadata, LinguisticMetrics, RiskFlag, ScoreBreakdown, FileType } from '../types/analysis'
import { findAiSoftware } from '../utils/softwareFingerprint'

// This index summarizes review signals. It is not a probability of AI authorship.
export function calculateScore(metadata: DocumentMetadata, linguistic: LinguisticMetrics, fileType: FileType): ScoreBreakdown {
  const flags: RiskFlag[] = []
  const add = (id: string, category: RiskFlag['category'], points: number, evidence: string) => {
    flags.push({ id, category, points, severity: points >= 8 ? 'medium' : 'low', label: id, detail: evidence })
  }
  const words = linguistic.totalWords
  const software = [metadata.creator, metadata.producer, metadata.generator].filter(Boolean).join(' ')
  const aiSoftware = findAiSoftware(software)
  if (aiSoftware) add('ai_generator', 'fingerprint', 10, aiSoftware)
  if (/\b(?:python[-_]?docx|reportlab|fpdf2?|weasyprint|pdfkit|jspdf|pandoc|(?:pdf|xe|lua)?latex|itext|apache poi)\b/i.test(software)) {
    add('programming_library', 'fingerprint', 0, software)
  }
  if (/\b(?:ilovepdf|smallpdf|pdf24|online2pdf|sodapdf|sejda)\b/i.test(software)) {
    add('converter_tool', 'fingerprint', 0, software)
  }
  // Missing authors and revision markers can result from normal privacy/export settings.
  if (!metadata.author?.trim()) add('no_author', 'metadata', 0, '—')
  if (fileType === 'docx' && metadata.hasRevisionIds === false) add('no_rsid', 'fingerprint', 0, '—')
  const duration = metadata.editingTimeMinutes
  if (duration !== undefined && duration < 3 && words > 200) {
    add('short_editing_time', 'metadata', 4, `${duration.toFixed(2)} min / ${words}`)
  }
  if (metadata.createdAt && metadata.modifiedAt) {
    const minutes = (metadata.modifiedAt.getTime() - metadata.createdAt.getTime()) / 60000
    if (minutes < 0) add('reversed_dates', 'metadata', 0, `${minutes.toFixed(1)} min`)
    else if (minutes < 1 && words > 100) add('dates_identical', 'metadata', 3, `${minutes.toFixed(1)} min`)
  }
  if (words < 80) add('insufficient_text', 'linguistic', 0, `${words} / 80`)
  else {
    if (linguistic.totalSentences >= 8 && linguistic.stdSentenceLength < 4) {
      add('low_burstiness', 'linguistic', 3, linguistic.stdSentenceLength.toFixed(2))
    }
    if (linguistic.typeTokenRatio < 0.4) add('low_ttr', 'linguistic', 3, `${(linguistic.typeTokenRatio * 100).toFixed(1)}%`)
    if (linguistic.aiPhraseCount >= 4) add('ai_phrases_high', 'linguistic', 2, linguistic.aiPhrasesFound.join(', '))
    if (linguistic.slopPhraseCount >= 5) add('slop_high', 'linguistic', 2, linguistic.slopPhrasesFound.join(', '))
    if (linguistic.zeroWidthCharCount > 0) add('zero_width_chars', 'linguistic', 0, String(linguistic.zeroWidthCharCount))
    if (linguistic.styleChangeHotspotCount > 0) {
      add('style_change_hotspots', 'linguistic', 4, `${linguistic.styleChangeHotspotCount} / ${linguistic.styleChangeMax.toFixed(2)}`)
    }
  }
  if (fileType === 'pdf' && metadata.hasEmbeddedFiles) add('pdf_embedded_files', 'fingerprint', 0, '—')
  if ((metadata.tinyTextItemCount ?? 0) >= 80 && (metadata.tinyTextRatio ?? 0) >= 0.35) {
    add('pdf_tiny_text_layer', 'fingerprint', 0, `${metadata.tinyTextItemCount} / ${((metadata.tinyTextRatio ?? 0) * 100).toFixed(0)}%`)
  }
  if ((metadata.overlappingTextItemCount ?? 0) >= 25) add('pdf_overlapping_text', 'fingerprint', 0, String(metadata.overlappingTextItemCount))
  const sum = (category: RiskFlag['category'], max: number) => Math.min(max, flags.filter(f => f.category === category).reduce((total, flag) => total + flag.points, 0))
  const metadataScore = sum('metadata', 40)
  const linguisticScore = sum('linguistic', 40)
  const fingerprintScore = sum('fingerprint', 20)
  const total = metadataScore + linguisticScore + fingerprintScore
  const level = words < 80 ? 'insufficient' : total <= 20 ? 'low' : total <= 40 ? 'moderate' : total <= 65 ? 'high' : 'critical'
  return { metadataScore, linguisticScore, fingerprintScore, total, level, levelLabel: level, flags }
}
