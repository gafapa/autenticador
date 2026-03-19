export type FileType = 'pdf' | 'docx' | 'odt' | 'unknown'

export interface DocumentMetadata {
  // Autoría
  author?: string
  lastModifiedBy?: string
  creator?: string         // software de creación
  producer?: string        // para PDF
  generator?: string       // para ODT

  // Fechas
  createdAt?: Date
  modifiedAt?: Date
  lastPrintedAt?: Date

  // Historial de edición
  revisions?: number       // número de revisiones guardadas
  editingTimeMinutes?: number  // minutos totales editando

  // Contenido
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
  hasRevisionIds?: boolean  // rsid en DOCX = presencia de historial Word
  fontFamilyCount?: number  // nº de fuentes distintas (mezcla = copia-pega)
  fontFamilies?: string[]   // lista de fuentes detectadas
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
  stdSentenceLength: number    // varianza alta = más humano

  // Riqueza léxica
  typeTokenRatio: number       // 0-1; humanos ~0.45-0.70
  hapaxPercentage: number      // % palabras únicas en el texto

  // Frases típicas de IA
  aiPhraseCount: number
  aiPhrasesFound: string[]

  // Entropía
  shannonEntropy: number       // bits por carácter; humanos ~4.0-4.8

  // Uniformidad de párrafos
  avgParagraphLength: number
  stdParagraphLength: number

  // Métricas extra
  avgWordLength: number
  longWordPercentage: number   // % palabras >8 letras

  // Estilo formal / impersonal (señal IA)
  pronounRatio: number         // % pronombres 1ª persona (yo/I/nosotros) — IA evita
  questionRatio: number        // % frases que terminan en ? — IA raramente pregunta
  firstWordDiversity: number   // TTR de primeras palabras de frases — IA repite inicios

  // Patrones "slop" (arXiv:2510.15061 — 1000x más frecuentes en IA)
  slopPhraseCount: number
  slopPhrasesFound: string[]

  // Caracteres invisibles (posibles marcas de agua o manipulación)
  zeroWidthCharCount: number

  // Cambio de estilo por segmentos
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
  level: 'low' | 'moderate' | 'high' | 'critical'
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
