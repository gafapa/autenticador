export type FileType = 'pdf' | 'docx' | 'odt' | 'unknown'

export interface DocumentMetadata {
  // Authorship fields
  author?: string
  lastModifiedBy?: string
  creator?: string         // creation software
  producer?: string        // PDF producer
  generator?: string       // ODT generator

  // Dates
  createdAt?: Date
  modifiedAt?: Date
  lastPrintedAt?: Date

  // Recorded editing history
  revisions?: number       // recorded revision count
  editingTimeMinutes?: number  // recorded editing minutes

  // Content statistics
  wordCount?: number
  pageCount?: number
  paragraphCount?: number
  lineCount?: number

  // Extras
  title?: string
  subject?: string
  keywords?: string
  description?: string
  hasTrackChanges?: boolean
  hasComments?: boolean
  hasRevisionIds?: boolean  // presence of Word revision markers
  fontFamilyCount?: number  // declared font family count
  fontFamilies?: string[]   // declared font families
  rsidCount?: number
  rsidCoverageRatio?: number
  dominantRsidRatio?: number
  paragraphStyleCount?: number
  paragraphStyles?: string[]
  hasEmbeddedFiles?: boolean
  hasC2paManifest?: boolean
  tinyTextItemCount?: number
  tinyTextRatio?: number
  overlappingTextItemCount?: number
  suspiciousTextLayerPages?: number
}

export interface StyleChangeHotspot {
  fromSegment: number
  toSegment: number
  distance: number
}

export interface LinguisticMetrics {
  totalWords: number
  totalSentences: number
  totalParagraphs: number

  // Burstiness
  avgSentenceLength: number
  stdSentenceLength: number    // sentence length standard deviation

  // Lexical diversity
  typeTokenRatio: number       // unique token ratio, 0-1
  hapaxPercentage: number      // percentage of types occurring once

  // Phrase dictionary matches
  aiPhraseCount: number
  aiPhrasesFound: string[]

  // Entropy
  shannonEntropy: number       // bits per Unicode code point

  // Paragraph length distribution
  avgParagraphLength: number
  stdParagraphLength: number

  // Additional descriptive metrics
  avgWordLength: number
  longWordPercentage: number   // percentage of words longer than eight letters

  // Descriptive style metrics
  pronounRatio: number         // first-person pronoun percentage
  questionRatio: number        // percentage of sentences ending in a question mark
  firstWordDiversity: number   // sentence-initial word diversity

  // Stock expression dictionary matches
  slopPhraseCount: number
  slopPhrasesFound: string[]

  // Invisible formatting character count
  zeroWidthCharCount: number

  // Local style changes between segments
  segmentCount: number
  styleChangeAverage: number
  styleChangeMax: number
  styleChangeHotspotCount: number
  styleChangeHotspots: StyleChangeHotspot[]
}

export interface RiskFlag {
  id: string
  category: 'metadata' | 'linguistic' | 'fingerprint'
  severity: 'low' | 'medium' | 'high'
  label: string
  detail: string
  points: number
}

export interface ScoreBreakdown {
  metadataScore: number     // 0-40
  linguisticScore: number   // 0-40
  fingerprintScore: number  // 0-20
  total: number             // 0-100
  level: 'low' | 'moderate' | 'high' | 'critical' | 'insufficient'
  levelLabel: string
  flags: RiskFlag[]
}

export interface AnalysisResult {
  fileName: string
  fileType: FileType
  fileSize: number
  analyzedAt: Date
  metadata: DocumentMetadata
  linguistic: LinguisticMetrics
  score: ScoreBreakdown
  rawText: string
}
