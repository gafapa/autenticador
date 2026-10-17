import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PERSISTED_RAW_TEXT_LIMIT,
  buildPersistedAnalysisHistory,
} from '../src/utils/analysisHistory.ts'
import { extractOdtText } from '../src/utils/odtText.ts'
import { parsePdfDate } from '../src/utils/pdfDate.ts'
import { getScoreBarFillWidth } from '../src/utils/scoreBar.ts'

test('PDF dates preserve timezone offsets before score comparisons', () => {
  const createdAt = parsePdfDate("D:20240512120000+02'00'")
  const modifiedAt = parsePdfDate("D:20240512111500+01'00'")

  assert.ok(createdAt)
  assert.ok(modifiedAt)
  assert.equal((modifiedAt.getTime() - createdAt.getTime()) / 60_000, 15)
})

test('ODT text extraction decodes entities and structural spacing', () => {
  const xml = [
    '<office:text>',
    '<text:h>Title &amp; intro</text:h>',
    '<text:p>Hello<text:s text:c="2"/>world&#33;<text:line-break/>Next</text:p>',
    '</office:text>',
  ].join('')

  assert.equal(extractOdtText(xml), 'Title & intro\nHello world!\nNext')
})

test('persisted analysis history keeps only the raw text preview', () => {
  const analysis = {
    fileName: 'sample.pdf',
    fileType: 'pdf',
    fileSize: 123,
    analyzedAt: new Date('2026-05-12T00:00:00.000Z'),
    metadata: {},
    linguistic: {
      totalWords: 0,
      totalSentences: 0,
      totalParagraphs: 0,
      avgSentenceLength: 0,
      stdSentenceLength: 0,
      typeTokenRatio: 0,
      hapaxPercentage: 0,
      aiPhraseCount: 0,
      aiPhrasesFound: [],
      slopPhraseCount: 0,
      slopPhrasesFound: [],
      shannonEntropy: 0,
      avgParagraphLength: 0,
      stdParagraphLength: 0,
      avgWordLength: 0,
      longWordPercentage: 0,
      pronounRatio: 0,
      questionRatio: 0,
      firstWordDiversity: 0,
      zeroWidthCharCount: 0,
      segmentCount: 0,
      styleChangeAverage: 0,
      styleChangeMax: 0,
      styleChangeHotspotCount: 0,
      styleChangeHotspots: [],
    },
    score: {
      metadataScore: 0,
      linguisticScore: 0,
      fingerprintScore: 0,
      total: 0,
      level: 'low',
      levelLabel: 'Low',
      flags: [],
    },
    rawText: 'x'.repeat(PERSISTED_RAW_TEXT_LIMIT + 25),
  }

  const [persisted] = buildPersistedAnalysisHistory([analysis])

  assert.equal(persisted.rawText.length, PERSISTED_RAW_TEXT_LIMIT)
  assert.equal(analysis.rawText.length, PERSISTED_RAW_TEXT_LIMIT + 25)
})

test('score bars do not render a fill for zero values', () => {
  assert.equal(getScoreBarFillWidth(0, 40, 100), 0)
  assert.equal(getScoreBarFillWidth(0.1, 40, 100), 2)
  assert.equal(getScoreBarFillWidth(20, 40, 100), 50)
})
