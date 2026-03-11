import type { LinguisticMetrics } from '../types/analysis'

// Frases de transición típicas de IA (señal clásica)
const AI_PHRASES = [
  // Inglés
  'moreover', 'furthermore', 'in conclusion', 'it is worth noting',
  'in summary', 'to summarize', 'in addition', 'it is important to note',
  'it is essential to', 'needless to say', 'as previously mentioned',
  'in this context', 'it is clear that', 'as a result', 'consequently',
  'in light of', 'it should be noted', 'to reiterate', 'as mentioned above',
  'in essence', 'undoubtedly', 'certainly', 'it is widely known',
  'as stated', 'due to the fact that', 'it is imperative', 'it goes without saying',
  'it is crucial', 'it is vital', 'it is noteworthy', 'one must consider',
  // Español
  'en conclusión', 'en resumen', 'cabe destacar', 'es importante mencionar',
  'en este contexto', 'como se mencionó', 'en este sentido', 'sin duda',
  'por otro lado', 'en definitiva', 'en efecto', 'hay que señalar que',
  'a modo de conclusión', 'en lo que respecta a', 'es fundamental',
  'es necesario destacar', 'resulta evidente', 'en términos generales',
  'es crucial', 'es vital', 'cabe mencionar', 'es importante señalar',
  'en el contexto actual', 'a lo largo de', 'en primer lugar', 'finalmente',
]

// Patrones "slop" — frases repetitivas 1000x más frecuentes en IA que en humanos
// (basado en investigación arXiv:2510.15061 Anti-Slop Framework, 8000+ patrones)
const SLOP_PHRASES = [
  // Inglés — patrones de slop documentados
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
  // Español — equivalentes documentados
  'en el mundo actual', 'en la era digital', 'es un hecho innegable',
  'juega un papel crucial', 'juega un papel fundamental',
  'tiene un impacto profundo', 'es de vital importancia',
  'a medida que avanzamos', 'en el panorama actual', 'aprovechando',
  'potenciar', 'gestionar eficazmente', 'de manera integral',
  'de forma holística', 'no cabe duda de que', 'vale la pena mencionar',
  'es imprescindible', 'desempeña un papel', 'profundizar en',
]

// Pronombres de 1ª persona (los humanos los usan; la IA los evita)
const FIRST_PERSON_PRONOUNS = [
  // Español
  'yo', 'mi', 'mí', 'me', 'nosotros', 'nosotras', 'nuestro', 'nuestra',
  'nuestros', 'nuestras', 'nos',
  // Inglés
  'i', 'my', 'mine', 'me', 'myself', 'we', 'our', 'ours', 'ourselves',
]

function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?…]+[.!?…]+/g) ?? []
  return raw.map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3)
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).length >= 5)
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function shannonEntropy(text: string): number {
  const freq: Record<string, number> = {}
  for (const ch of text) freq[ch] = (freq[ch] ?? 0) + 1
  const len = text.length
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
  const freq: Record<string, number> = {}
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
    if (lower.includes(phrase)) found.push(phrase)
  }
  return { count: found.length, found }
}

// TTR de las primeras palabras de cada frase — la IA tiende a repetir inicios
function firstWordDiversity(sentences: string[]): number {
  if (sentences.length < 3) return 1
  const firstWords = sentences
    .map((s) => s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-záéíóúüñ]/g, ''))
    .filter(Boolean) as string[]
  if (firstWords.length === 0) return 1
  const unique = new Set(firstWords)
  return unique.size / firstWords.length
}

// % de pronombres 1ª persona sobre total de palabras
function pronounRatio(words: string[]): number {
  if (words.length === 0) return 0
  const pronounSet = new Set(FIRST_PERSON_PRONOUNS)
  const count = words.filter((w) => pronounSet.has(w.toLowerCase().replace(/[^a-záéíóúüñ]/g, ''))).length
  return (count / words.length) * 100
}

// % de frases que terminan en signo de pregunta
function questionRatio(sentences: string[]): number {
  if (sentences.length === 0) return 0
  const questions = sentences.filter((s) => s.trimEnd().endsWith('?')).length
  return (questions / sentences.length) * 100
}

// Detección de caracteres invisibles/zero-width (marcas de agua o manipulación)
function countZeroWidthChars(text: string): number {
  // U+200B zero-width space, U+200C zero-width non-joiner, U+200D zero-width joiner
  // U+FEFF BOM/zero-width no-break space, U+00AD soft hyphen, U+2060 word joiner
  // U+180E mongolian vowel separator (usado en algunos watermarks)
  const matches = text.match(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E\u2028\u2029]/g)
  return matches?.length ?? 0
}

export function analyzeLinguistics(text: string): LinguisticMetrics {
  const words = text.trim().split(/\s+/).filter((w) => /\w/.test(w))
  const sentences = splitSentences(text)
  const paragraphs = splitParagraphs(text)

  const sentenceLengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length)
  const paragraphLengths = paragraphs.map((p) => p.split(/\s+/).filter(Boolean).length)

  const avgSentenceLength =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
      : 0
  const avgParagraphLength =
    paragraphLengths.length > 0
      ? paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length
      : 0

  const wordLengths = words.map((w) => w.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/g, '').length)
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
  }
}
