import { tokenizeWords } from '../utils/text'
import type { LinguisticMetrics, StyleChangeHotspot } from '../types/analysis'

const AI_PHRASES = [
  'moreover', 'furthermore', 'in conclusion', 'it is worth noting',
  'in summary', 'to summarize', 'in addition', 'it is important to note',
  'it is essential to', 'needless to say', 'as previously mentioned',
  'in this context', 'it is clear that', 'as a result', 'consequently',
  'in light of', 'it should be noted', 'to reiterate', 'as mentioned above',
  'in essence', 'undoubtedly', 'certainly', 'it is widely known',
  'as stated', 'due to the fact that', 'it is imperative', 'it goes without saying',
  'it is crucial', 'it is vital', 'it is noteworthy', 'one must consider',
  'en conclusión', 'en resumen', 'cabe destacar', 'es importante mencionar',
  'en este contexto', 'como se mencionó', 'en este sentido', 'sin duda',
  'por otro lado', 'en definitiva', 'en efecto', 'hay que señalar que',
  'a modo de conclusión', 'en lo que respecta a', 'es fundamental',
  'es necesario destacar', 'resulta evidente', 'en términos generales',
  'es crucial', 'es vital', 'cabe mencionar', 'es importante señalar',
  'en el contexto actual', 'a lo largo de', 'en primer lugar', 'finalmente',
]

const SLOP_PHRASES = [
  'dive into', 'delve into', 'in the realm of', 'in today\'s world',
  'in today\'s fast-paced', 'the landscape of', 'leverage', 'utilize',
  'cutting-edge', 'game-changing', 'paradigm shift', 'seamlessly',
  'robust solution', 'holistic approach', 'at the end of the day',
  'it\'s worth noting', 'rest assured', 'let\'s explore', 'let\'s dive',
  'let\'s delve', 'take a deep dive', 'unpack', 'shed light on',
  'foster', 'cultivate', 'harness the power', 'empower', 'multifaceted',
  'nuanced', 'in the ever-evolving', 'ever-changing', 'dynamic landscape',
  'navigate the complexities', 'unlock the potential', 'transformative',
  'groundbreaking', 'revolutionary', 'unprecedented', 'invaluable',
  'comprehensive guide', 'in conclusion, it is', 'it is important that we',
  'by doing so', 'moving forward', 'going forward', 'as we move forward',
  'in terms of', 'when it comes to', 'it\'s no secret that',
  'have a profound impact', 'plays a crucial role', 'plays a vital role',
  'it is worth mentioning', 'it cannot be overstated',
  'en el mundo actual', 'en la era digital', 'es un hecho innegable',
  'juega un papel crucial', 'juega un papel fundamental',
  'tiene un impacto profundo', 'es de vital importancia',
  'a medida que avanzamos', 'en el panorama actual', 'aprovechando',
  'potenciar', 'gestionar eficazmente', 'de manera integral',
  'de forma holística', 'no cabe duda de que', 'vale la pena mencionar',
  'es imprescindible', 'desempeña un papel', 'profundizar en',
]

const FIRST_PERSON_PRONOUNS = [
  'yo', 'mi', 'mí', 'me', 'nosotros', 'nosotras', 'nuestro', 'nuestra',
  'nuestros', 'nuestras', 'nos',
  'i', 'my', 'mine', 'me', 'myself', 'we', 'our', 'ours', 'ourselves',
]

interface SegmentStats {
  avgSentenceLength: number
  typeTokenRatio: number
  shannonEntropy: number
  pronounRatio: number
  firstWordDiversity: number
}

function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?…\n]+[.!?…]?/g) ?? []
  return raw.map((s) => s.trim()).filter((s) => tokenizeWords(s).length > 0)
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter((p) => tokenizeWords(p).length > 0)
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function buildStyleSegments(paragraphs: string[]): string[] {
  const segments: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean).length
    current.push(paragraph)
    currentWords += words

    if (current.length >= 2 && currentWords >= 120) {
      segments.push(current.join('\n\n'))
      current = []
      currentWords = 0
    }
  }

  if (current.length > 0) {
    if (segments.length > 0 && currentWords < 80) {
      segments[segments.length - 1] = `${segments[segments.length - 1]}\n\n${current.join('\n\n')}`
    } else {
      segments.push(current.join('\n\n'))
    }
  }

  return segments
}

function shannonEntropy(text: string): number {
  const freq: Record<string, number> = Object.create(null)
  let len = 0
  for (const ch of text) { freq[ch] = (freq[ch] ?? 0) + 1; len++ }
  if (len === 0) return 0
  return Object.values(freq).reduce((acc, count) => {
    const p = count / len
    return acc - p * Math.log2(p)
  }, 0)
}

function typeTokenRatio(words: string[]): number {
  if (words.length === 0) return 0
  const unique = new Set(words.map((w) => w.toLowerCase()))
  return unique.size / words.length
}

function hapaxPercentage(words: string[]): number {
  if (words.length === 0) return 0
  const freq: Record<string, number> = Object.create(null)
  for (const w of words) {
    const lw = w.toLowerCase()
    freq[lw] = (freq[lw] ?? 0) + 1
  }
  const hapax = Object.values(freq).filter((c) => c === 1).length
  return (hapax / Object.keys(freq).length) * 100
}

function countPhrases(text: string, phrases: string[]): { count: number; found: string[] } {
  const lower = text.toLowerCase()
  const found: string[] = []
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(lower)) found.push(phrase)
  }
  return { count: found.length, found }
}

function firstWordDiversity(sentences: string[]): number {
  if (sentences.length < 3) return 1
  const firstWords = sentences
    .map((s) => s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean) as string[]
  if (firstWords.length === 0) return 1
  const unique = new Set(firstWords)
  return unique.size / firstWords.length
}

function pronounRatio(words: string[]): number {
  if (words.length === 0) return 0
  const pronounSet = new Set(FIRST_PERSON_PRONOUNS)
  const count = words.filter((w) => pronounSet.has(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))).length
  return (count / words.length) * 100
}

function questionRatio(sentences: string[]): number {
  if (sentences.length === 0) return 0
  const questions = sentences.filter((s) => s.trimEnd().endsWith('?')).length
  return (questions / sentences.length) * 100
}

function countZeroWidthChars(text: string): number {
  const matches = text.match(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g)
  return matches?.length ?? 0
}

function calculateSegmentStats(text: string): SegmentStats {
  const words = tokenizeWords(text)
  const sentences = splitSentences(text)
  const sentenceLengths = sentences.map((sentence) => tokenizeWords(sentence).length)
  const avgSentenceLength =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((sum, length) => sum + length, 0) / sentenceLengths.length
      : 0

  return {
    avgSentenceLength,
    typeTokenRatio: typeTokenRatio(words),
    shannonEntropy: shannonEntropy(text.slice(0, 4000)),
    pronounRatio: pronounRatio(words),
    firstWordDiversity: firstWordDiversity(sentences),
  }
}

function segmentDistance(a: SegmentStats, b: SegmentStats): number {
  const deltas = [
    Math.min(Math.abs(a.avgSentenceLength - b.avgSentenceLength) / 12, 1),
    Math.min(Math.abs(a.typeTokenRatio - b.typeTokenRatio) / 0.2, 1),
    Math.min(Math.abs(a.shannonEntropy - b.shannonEntropy) / 0.6, 1),
    Math.min(Math.abs(a.pronounRatio - b.pronounRatio) / 1.5, 1),
    Math.min(Math.abs(a.firstWordDiversity - b.firstWordDiversity) / 0.25, 1),
  ]

  return deltas.reduce((sum, value) => sum + value, 0) / deltas.length
}

function analyzeStyleChanges(paragraphs: string[]) {
  const segments = buildStyleSegments(paragraphs)
  if (segments.length < 2) {
    return {
      segmentCount: segments.length,
      styleChangeAverage: 0,
      styleChangeMax: 0,
      styleChangeHotspotCount: 0,
      styleChangeHotspots: [] as StyleChangeHotspot[],
    }
  }

  const stats = segments.map(calculateSegmentStats)
  const distances = stats.slice(1).map((segmentStats, index) => ({
    fromSegment: index + 1,
    toSegment: index + 2,
    distance: segmentDistance(stats[index], segmentStats),
  }))

  const hotspots = distances
    .filter((distance) => distance.distance >= 0.45)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 5)

  const distanceValues = distances.map((distance) => distance.distance)
  const styleChangeAverage =
    distanceValues.reduce((sum, distance) => sum + distance, 0) / distanceValues.length

  return {
    segmentCount: segments.length,
    styleChangeAverage,
    styleChangeMax: Math.max(...distanceValues),
    styleChangeHotspotCount: hotspots.length,
    styleChangeHotspots: hotspots,
  }
}

export function analyzeLinguistics(text: string): LinguisticMetrics {
  const words = tokenizeWords(text)
  const sentences = splitSentences(text)
  const paragraphs = splitParagraphs(text)
  const styleChanges = analyzeStyleChanges(paragraphs)

  const sentenceLengths = sentences.map((s) => tokenizeWords(s).length)
  const paragraphLengths = paragraphs.map((p) => tokenizeWords(p).length)

  const avgSentenceLength =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
      : 0
  const avgParagraphLength =
    paragraphLengths.length > 0
      ? paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length
      : 0

  const wordLengths = words.map((w) => w.replace(/[^\p{L}]/gu, '').length)
  const avgWordLength =
    wordLengths.length > 0 ? wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length : 0
  const longWordPercentage =
    words.length > 0 ? (wordLengths.filter((l) => l > 8).length / words.length) * 100 : 0

  const { count: aiPhraseCount, found: aiPhrasesFound } = countPhrases(text, AI_PHRASES)
  const { count: slopPhraseCount, found: slopPhrasesFound } = countPhrases(text, SLOP_PHRASES)

  return {
    totalWords: words.length,
    totalSentences: sentences.length,
    totalParagraphs: paragraphs.length,
    avgSentenceLength,
    stdSentenceLength: stdDev(sentenceLengths),
    typeTokenRatio: typeTokenRatio(words),
    hapaxPercentage: hapaxPercentage(words),
    aiPhraseCount,
    aiPhrasesFound,
    slopPhraseCount,
    slopPhrasesFound,
    shannonEntropy: shannonEntropy(text.slice(0, 10000)),
    avgParagraphLength,
    stdParagraphLength: stdDev(paragraphLengths),
    avgWordLength,
    longWordPercentage,
    pronounRatio: pronounRatio(words),
    questionRatio: questionRatio(sentences),
    firstWordDiversity: firstWordDiversity(sentences),
    zeroWidthCharCount: countZeroWidthChars(text),
    segmentCount: styleChanges.segmentCount,
    styleChangeAverage: styleChanges.styleChangeAverage,
    styleChangeMax: styleChanges.styleChangeMax,
    styleChangeHotspotCount: styleChanges.styleChangeHotspotCount,
    styleChangeHotspots: styleChanges.styleChangeHotspots,
  }
}
