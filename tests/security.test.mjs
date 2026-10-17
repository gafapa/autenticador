import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { analyzeDocx } from '../src/analyzers/docxAnalyzer.ts'
import { analyzeOdt } from '../src/analyzers/odtAnalyzer.ts'
import { analyzeLinguistics } from '../src/analyzers/linguisticAnalyzer.ts'
import { calculateScore } from '../src/analyzers/scoringEngine.ts'
import { findAiSoftware } from '../src/utils/softwareFingerprint.ts'
import { loadSafeZip, readZipEntry } from '../src/utils/safeArchive.ts'
import { expandUploadedFiles } from '../src/utils/fileIntake.ts'
import { extractOdtText } from '../src/utils/odtText.ts'
import { parseDocumentXml } from '../src/utils/documentXml.ts'
import { DocumentInputError, INPUT_LIMITS } from '../src/utils/inputLimits.ts'
import { parsePdfDate } from '../src/utils/pdfDate.ts'
import { tokenizeWords } from '../src/utils/text.ts'
import { parseNonNegativeNumber } from '../src/utils/documentXml.ts'
import { ANALYSIS_HISTORY_KEY, loadAnalysisHistory, persistAnalysisHistory } from '../src/utils/analysisHistory.ts'

const docxXml = text => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r>${text}</w:r></w:p></w:body></w:document>`
const odtXml = text => `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>${text}</text:p></office:text></office:body></office:document-content>`
async function archive(name, entries) {
  const zip = new JSZip()
  if (name.endsWith('.docx')) zip.file('[Content_Types].xml', '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  if (name.endsWith('.odt')) zip.file('mimetype', 'application/vnd.oasis.opendocument.text')
  for (const [path, content] of Object.entries(entries)) zip.file(path, content)
  return new File([await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })], name)
}
const isInputError = code => error => error instanceof DocumentInputError && error.code === code

test('AI software matching respects Unicode word boundaries and literal dots', () => {
  for (const producer of ['Bardwell Publishing', 'Geminiature', 'GPTools', 'élLaMa', 'copyXai']) assert.equal(findAiSoftware(producer), undefined)
  assert.equal(findAiSoftware('Exported with ChatGPT 5'), 'chatgpt')
  assert.equal(findAiSoftware('copy.ai exporter'), 'copy.ai')
})

test('empty or short text cannot produce an authenticity assessment', () => {
  for (const text of ['', 'A few words.']) {
    const score = calculateScore({ producer: 'Microsoft Word' }, analyzeLinguistics(text), 'pdf')
    assert.equal(score.level, 'insufficient')
    assert.ok(score.flags.some(flag => flag.id === 'insufficient_text'))
  }
})

test('ordinary libraries, converters and missing private metadata carry no suspicion points', () => {
  const linguistic = analyzeLinguistics('A diverse collection of factual observations is recorded here. '.repeat(30))
  const baseline = calculateScore({}, linguistic, 'docx')
  for (const producer of ['LaTeX', 'ReportLab', 'pdf24', 'Microsoft Word']) {
    const score = calculateScore({ producer, hasRevisionIds: false, fontFamilyCount: 30, revisions: 0 }, linguistic, 'docx')
    assert.equal(score.total, baseline.total)
    assert.equal(score.fingerprintScore, 0)
  }
})

test('phrase matching does not count pieces of larger words', () => {
  const metrics = analyzeLinguistics('The unpacked samples fostered growth and utilized tools.')
  assert.deepEqual(metrics.slopPhrasesFound, [])
  assert.equal(analyzeLinguistics('We unpack findings and foster discussion.').slopPhraseCount, 2)
  assert.equal(analyzeLinguistics('Été à île.').totalWords, 3)
  assert.equal(analyzeLinguistics('Line\u2028break').zeroWidthCharCount, 0)
})

test('DOCX preserves tabs, breaks, adjacent runs, entities and excludes deleted text', async () => {
  const file = await archive('fixture.docx', { 'word/document.xml': docxXml('<w:t>Hello</w:t><w:tab/><w:t>world</w:t><w:br/><w:t>Next &amp; &#33;</w:t>') })
  const result = await analyzeDocx(file)
  assert.equal(result.text, 'Hello world Next & !')
  assert.equal(result.metadata.wordCount, 3)
  const runs = await analyzeDocx(await archive('runs.docx', { 'word/document.xml': docxXml('<w:t>inter</w:t><w:t>national</w:t>') }))
  assert.equal(runs.text, 'international')
  const deleted = await analyzeDocx(await archive('deleted.docx', { 'word/document.xml': docxXml('<w:del><w:r><w:t>deleted</w:t></w:r></w:del><w:t>visible</w:t>') }))
  assert.equal(deleted.text, 'visible')
})

test('ODT preserves inline styled words and fractional editing duration', async () => {
  const result = await analyzeOdt(await archive('sample.odt', {
    'content.xml': odtXml('inter<text:span>national</text:span><text:tab/>text'),
    'meta.xml': '<office:document-meta><office:meta><meta:editing-duration>PT45S</meta:editing-duration></office:meta></office:document-meta>',
  }))
  assert.equal(result.text, 'international text')
  assert.equal(result.metadata.editingTimeMinutes, 0.75)
})

test('renamed empty ZIPs and incorrect roots are rejected as documents', async () => {
  for (const [name, analyzer, entries] of [
    ['empty.docx', analyzeDocx, {}], ['empty.odt', analyzeOdt, {}],
    ['wrong.docx', analyzeDocx, { 'word/document.xml': '<not-a-document/>' }],
    ['wrong.odt', analyzeOdt, { 'content.xml': '<not-a-document/>' }],
  ]) await assert.rejects(analyzer(await archive(name, entries)), isInputError('invalid'))
})

test('DTD, external entities, malformed and deeply nested XML are rejected', () => {
  for (const xml of ['<!DOCTYPE x [<!ENTITY x SYSTEM "https://example.invalid/secret">]><x>&x;</x>', '<a><b></a>', '<a>'.repeat(130) + '</a>'.repeat(130)]) {
    assert.throws(() => parseDocumentXml(xml), DocumentInputError)
  }
  assert.throws(() => extractOdtText('<text:p><text:s text:c="999999999"/></text:p>'), isInputError('limit'))
})

test('ZIP directory limits reject entry floods, oversized declarations and traversal paths', async () => {
  const entries = Object.fromEntries(Array.from({ length: INPUT_LIMITS.archiveEntries + 1 }, (_, i) => [`${i}.txt`, '']))
  await assert.rejects(loadSafeZip(await (await archive('many.zip', entries)).arrayBuffer()), isInputError('limit'))
  await assert.rejects(loadSafeZip(await (await archive('paths.zip', { '../secret.pdf': 'x' })).arrayBuffer()), isInputError('invalid'))
  const bytes = new Uint8Array(await (await archive('size.zip', { 'a.pdf': 'x' })).arrayBuffer())
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < bytes.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, INPUT_LIMITS.fileBytes + 1, true); break }
  }
  await assert.rejects(loadSafeZip(bytes.buffer), isInputError('limit'))
})

test('actual streamed output is bounded even when compressed input is tiny', async () => {
  const file = await archive('compressed.zip', { 'a.pdf': 'x'.repeat(500_000) })
  const zip = await loadSafeZip(await file.arrayBuffer())
  await assert.rejects(readZipEntry(zip.file('a.pdf'), 1024), isInputError('limit'))
})

test('batch intake is sequential, rejects too many files and retains documents before a later archive error', async () => {
  const first = new File(['%PDF-1.7'], 'first.pdf')
  const bad = new File(['broken'], 'bad.zip')
  const extracted = []
  await assert.rejects(async () => { for await (const file of expandUploadedFiles([first, bad])) extracted.push(file.name) }, DocumentInputError)
  assert.deepEqual(extracted, ['first.pdf'])
  await assert.rejects(async () => { for await (const file of expandUploadedFiles(Array(51).fill(first))) void file }, isInputError('limit'))
  const files = []
  for await (const file of expandUploadedFiles([await archive('batch.zip', { 'nested/a.docx': 'a', 'b.odt': 'b', 'ignored.exe': 'x' })])) files.push(file.name)
  assert.deepEqual(files, ['batch__b.odt', 'batch__nested__a.docx'])
})

test('history restores valid entries, recomputes old scores and preserves malformed original storage', () => {
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const linguistic = analyzeLinguistics('Short text.')
  const valid = { fileName: 'sample.pdf', fileType: 'pdf', fileSize: 30, analyzedAt: new Date(), metadata: {}, linguistic,
    score: { level: 'critical', total: 100 }, rawText: 'Short text.' }
  assert.equal(persistAnalysisHistory([valid]), true)
  const original = JSON.stringify([valid, { fileName: 'broken.pdf', analyzedAt: 'bad', metadata: {} }])
  values.set(ANALYSIS_HISTORY_KEY, original)
  const loaded = loadAnalysisHistory()
  assert.equal(loaded.damaged, true)
  assert.equal(loaded.history.length, 1)
  assert.equal(loaded.history[0].score.level, 'insufficient')
  assert.equal(values.get(ANALYSIS_HISTORY_KEY), original)
  values.set(ANALYSIS_HISTORY_KEY, '{broken')
  assert.deepEqual(loadAnalysisHistory(), { history: [], damaged: true })
})

test('storage denial does not throw or mutate current session results', () => {
  globalThis.localStorage = { getItem() { throw Error('denied') }, setItem() { throw Error('denied') }, removeItem() { throw Error('denied') } }
  const history = [{ rawText: 'private text' }]
  assert.equal(persistAnalysisHistory(history), false)
  assert.equal(history.length, 1)
  assert.equal(persistAnalysisHistory([]), false)
  assert.deepEqual(loadAnalysisHistory(), { history: [], damaged: false })
  delete globalThis.localStorage
})

test('document packaging requires its format declaration, not just a renamed XML entry', async () => {
  const zip = new JSZip()
  zip.file('word/document.xml', docxXml('<w:t>Document text</w:t>'))
  await assert.rejects(analyzeDocx(new File([await zip.generateAsync({ type: 'uint8array' })], 'renamed.docx')), isInputError('invalid'))
  const odt = new JSZip()
  odt.file('content.xml', odtXml('Document text'))
  odt.file('mimetype', 'application/zip')
  await assert.rejects(analyzeOdt(new File([await odt.generateAsync({ type: 'uint8array' })], 'renamed.odt')), isInputError('invalid'))
})

test('oversized metadata cannot freeze rendering or produce an unbounded PDF report', async () => {
  const file = await archive('metadata.docx', {
    'word/document.xml': docxXml('<w:t>Document text</w:t>'),
    'docProps/core.xml': `<cp:coreProperties><dc:creator>${'a'.repeat(4097)}</dc:creator></cp:coreProperties>`,
  })
  await assert.rejects(analyzeDocx(file), isInputError('limit'))
  for (const value of ['-1', 'Infinity', '12broken', [], {}, 'NaN']) assert.equal(parseNonNegativeNumber(value), undefined)
  assert.equal(parseNonNegativeNumber('0'), 0)
})

test('word counts handle punctuation, diacritics and short sentences consistently', () => {
  assert.deepEqual(tokenizeWords('Hello world Next & !'), ['Hello', 'world', 'Next'])
  const metrics = analyzeLinguistics('Sí. No. Éte\u0301,français l’école.')
  assert.equal(metrics.totalWords, 5)
  assert.equal(metrics.totalSentences, 3)
  assert.equal(metrics.totalParagraphs, 1)
})

test('invalid PDF dates are rejected instead of normalized into different dates', () => {
  for (const raw of ['D:20261301000000Z', 'D:20260230000000Z', 'D:20260101250000Z', "D:20260101000000+99'00'", new Date('invalid')]) {
    assert.equal(parsePdfDate(raw), undefined)
  }
  assert.equal(parsePdfDate('D:00990101000000Z').getUTCFullYear(), 99)
})
