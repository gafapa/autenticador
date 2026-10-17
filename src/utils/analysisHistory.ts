import type { AnalysisResult } from '../types/analysis.js'
import { calculateScore } from '../analyzers/scoringEngine'
import { readLocalValue, writeLocalValue, removeLocalValue } from './browserStorage'

export const PERSISTED_RAW_TEXT_LIMIT = 5000
export const ANALYSIS_HISTORY_KEY = 'docforensics-analysis-history'
export const MAX_HISTORY_ENTRIES = 100
const MAX_HISTORY_CHARACTERS = 2_000_000

const numericMetrics = [
  'totalWords', 'totalSentences', 'totalParagraphs', 'avgSentenceLength', 'stdSentenceLength',
  'typeTokenRatio', 'hapaxPercentage', 'aiPhraseCount', 'slopPhraseCount', 'shannonEntropy',
  'avgParagraphLength', 'stdParagraphLength', 'avgWordLength', 'longWordPercentage',
  'pronounRatio', 'questionRatio', 'firstWordDiversity', 'zeroWidthCharCount', 'segmentCount',
  'styleChangeAverage', 'styleChangeMax', 'styleChangeHotspotCount',
]
const finiteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 200 &&
  value.every(item => typeof item === 'string' && item.length <= 1000)

function reviveAnalysisResult(value: unknown): AnalysisResult | undefined {
  if (!value || typeof value !== 'object') return
  const stored = value as Record<string, any>
  if (typeof stored.fileName !== 'string' || stored.fileName.length > 1000 ||
    !['pdf', 'docx', 'odt'].includes(stored.fileType) || !finiteNumber(stored.fileSize) ||
    typeof stored.rawText !== 'string' || typeof stored.analyzedAt !== 'string' ||
    !Number.isFinite(new Date(stored.analyzedAt).getTime())) return
  const metrics = stored.linguistic
  if (!metrics || typeof metrics !== 'object' || numericMetrics.some(key => !finiteNumber(metrics[key])) ||
    !stringList(metrics.aiPhrasesFound) || !stringList(metrics.slopPhrasesFound) ||
    !Array.isArray(metrics.styleChangeHotspots) || metrics.styleChangeHotspots.length > 5 ||
    metrics.styleChangeHotspots.some((item: any) => !item ||
      !finiteNumber(item.fromSegment) || !finiteNumber(item.toSegment) || !finiteNumber(item.distance))) return
  if (!stored.metadata || typeof stored.metadata !== 'object' || Array.isArray(stored.metadata)) return
  const metadata: Record<string, any> = {}
  const strings = ['author', 'lastModifiedBy', 'creator', 'producer', 'generator', 'title', 'subject', 'keywords', 'description']
  const numbers = ['revisions', 'editingTimeMinutes', 'wordCount', 'pageCount', 'paragraphCount', 'lineCount',
    'fontFamilyCount', 'rsidCount', 'rsidCoverageRatio', 'dominantRsidRatio', 'paragraphStyleCount',
    'tinyTextItemCount', 'tinyTextRatio', 'overlappingTextItemCount', 'suspiciousTextLayerPages']
  const booleans = ['hasTrackChanges', 'hasComments', 'hasRevisionIds', 'hasEmbeddedFiles', 'hasC2paManifest']
  for (const key of strings) {
    const item = stored.metadata[key]
    if (item !== undefined && (typeof item !== 'string' || item.length > 10000)) return
    if (item !== undefined) metadata[key] = item
  }
  for (const key of numbers) {
    const item = stored.metadata[key]
    if (item !== undefined && !finiteNumber(item)) return
    if (item !== undefined) metadata[key] = item
  }
  for (const key of booleans) {
    const item = stored.metadata[key]
    if (item !== undefined && typeof item !== 'boolean') return
    if (item !== undefined) metadata[key] = item
  }
  for (const key of ['fontFamilies', 'paragraphStyles']) {
    const item = stored.metadata[key]
    if (item !== undefined && !stringList(item)) return
    if (item !== undefined) metadata[key] = item
  }
  for (const key of ['createdAt', 'modifiedAt', 'lastPrintedAt']) {
    const item = stored.metadata[key]
    if (item !== undefined) {
      if (typeof item !== 'string' || !Number.isFinite(new Date(item).getTime())) return
      metadata[key] = new Date(item)
    }
  }
  // Recompute the index under the current rules rather than trusting stale scores.
  return {
    fileName: stored.fileName, fileType: stored.fileType, fileSize: stored.fileSize,
    analyzedAt: new Date(stored.analyzedAt), metadata, linguistic: metrics,
    rawText: stored.rawText.slice(0, PERSISTED_RAW_TEXT_LIMIT),
    score: calculateScore(metadata, metrics, stored.fileType),
  }
}

export function loadAnalysisHistory(): { history: AnalysisResult[]; damaged: boolean } {
  const raw = readLocalValue(ANALYSIS_HISTORY_KEY)
  if (!raw) return { history: [], damaged: false }
  try {
    if (raw.length > MAX_HISTORY_CHARACTERS) return { history: [], damaged: true }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length > MAX_HISTORY_ENTRIES) return { history: [], damaged: true }
    const history = parsed.map(reviveAnalysisResult).filter((item): item is AnalysisResult => !!item)
    return { history, damaged: history.length !== parsed.length }
  } catch { return { history: [], damaged: true } }
}

export function persistAnalysisHistory(history: AnalysisResult[]): boolean {
  if (history.length === 0) return removeLocalValue(ANALYSIS_HISTORY_KEY)
  if (history.length > MAX_HISTORY_ENTRIES) return false
  try {
    const serialized = JSON.stringify(buildPersistedAnalysisHistory(history))
    return serialized.length <= MAX_HISTORY_CHARACTERS && writeLocalValue(ANALYSIS_HISTORY_KEY, serialized)
  } catch { return false }
}

export function buildPersistedAnalysisHistory(history: AnalysisResult[]): AnalysisResult[] {
  return history.map((item) => ({
    ...item,
    rawText: item.rawText.slice(0, PERSISTED_RAW_TEXT_LIMIT),
  }))
}
