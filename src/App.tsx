import { useState, useCallback, useEffect } from 'react'
import JSZip from 'jszip'
import { FileDropzone } from './components/FileDropzone'
import { ScoreGauge } from './components/ScoreGauge'
import { MetadataPanel } from './components/MetadataPanel'
import { LinguisticPanel } from './components/LinguisticPanel'
import { FingerprintPanel } from './components/FingerprintPanel'
import { analyzeLinguistics } from './analyzers/linguisticAnalyzer'
import { calculateScore } from './analyzers/scoringEngine'
import type { AnalysisResult, FileType } from './types/analysis'
import { useTranslation, useLocale, type Locale } from './i18n'

const REPO_URL = 'https://github.com/gafapa/autenticador'
const ANALYSIS_HISTORY_KEY = 'docforensics-analysis-history'
const ZIP_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
]

function getAnalysisId(result: AnalysisResult): string {
  return `${result.analyzedAt.toISOString()}::${result.fileName}::${result.fileSize}`
}

function reviveAnalysisResult(stored: AnalysisResult): AnalysisResult {
  return {
    ...stored,
    analyzedAt: new Date(stored.analyzedAt),
    metadata: {
      ...stored.metadata,
      createdAt: stored.metadata.createdAt ? new Date(stored.metadata.createdAt) : undefined,
      modifiedAt: stored.metadata.modifiedAt ? new Date(stored.metadata.modifiedAt) : undefined,
      lastPrintedAt: stored.metadata.lastPrintedAt
        ? new Date(stored.metadata.lastPrintedAt)
        : undefined,
    },
  }
}

function loadAnalysisHistory(): AnalysisResult[] {
  try {
    const raw = localStorage.getItem(ANALYSIS_HISTORY_KEY)
    if (!raw) return []

    const stored = JSON.parse(raw)
    if (!Array.isArray(stored)) return []

    return stored.map((item) => reviveAnalysisResult(item as AnalysisResult))
  } catch {
    return []
  }
}

function persistAnalysisHistory(history: AnalysisResult[]): AnalysisResult[] {
  let nextHistory = [...history]

  while (nextHistory.length > 0) {
    try {
      localStorage.setItem(ANALYSIS_HISTORY_KEY, JSON.stringify(nextHistory))
      return nextHistory
    } catch {
      nextHistory = nextHistory.slice(0, -1)
    }
  }

  localStorage.removeItem(ANALYSIS_HISTORY_KEY)
  return []
}

function detectFileType(file: File): FileType {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf'
  if (
    ext === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx'
  if (ext === 'odt' || file.type === 'application/vnd.oasis.opendocument.text')
    return 'odt'
  return 'unknown'
}

function getMimeTypeForFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (ext === 'odt') return 'application/vnd.oasis.opendocument.text'
  return 'application/octet-stream'
}

function isZipFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext === 'zip' || ZIP_MIME_TYPES.includes(file.type)
}

function sanitizeZipEntryName(zipName: string, entryName: string): string {
  const zipBaseName = zipName.replace(/\.zip$/i, '')
  return `${zipBaseName}__${entryName.replace(/[\\/]+/g, '__')}`
}

async function extractSupportedFilesFromZip(
  file: File,
  emptyZipMsg: (name: string) => string
): Promise<File[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const supportedEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => {
      const ext = entry.name.split('.').pop()?.toLowerCase()
      return ext === 'pdf' || ext === 'docx' || ext === 'odt'
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (supportedEntries.length === 0) {
    throw new Error(emptyZipMsg(file.name))
  }

  return Promise.all(
    supportedEntries.map(async (entry) => {
      const content = await entry.async('uint8array')
      const fileBytes = Uint8Array.from(content)
      return new File([fileBytes], sanitizeZipEntryName(file.name, entry.name), {
        type: getMimeTypeForFileName(entry.name),
      })
    })
  )
}

async function expandUploadedFiles(
  files: File[],
  emptyZipMsg: (name: string) => string
): Promise<File[]> {
  const expandedFiles: File[] = []

  for (const file of files) {
    if (isZipFile(file)) {
      expandedFiles.push(...(await extractSupportedFilesFromZip(file, emptyZipMsg)))
      continue
    }

    expandedFiles.push(file)
  }

  return expandedFiles
}

async function analyzeFile(file: File, errorMsg: string): Promise<AnalysisResult> {
  const fileType = detectFileType(file)

  let metadata = {}
  let text = ''

  if (fileType === 'pdf') {
    const { analyzePdf } = await import('./analyzers/pdfAnalyzer')
    const result = await analyzePdf(file)
    metadata = result.metadata
    text = result.text
  } else if (fileType === 'docx') {
    const { analyzeDocx } = await import('./analyzers/docxAnalyzer')
    const result = await analyzeDocx(file)
    metadata = result.metadata
    text = result.text
  } else if (fileType === 'odt') {
    const { analyzeOdt } = await import('./analyzers/odtAnalyzer')
    const result = await analyzeOdt(file)
    metadata = result.metadata
    text = result.text
  } else {
    throw new Error(errorMsg)
  }

  const linguistic = analyzeLinguistics(text)
  const score = calculateScore(metadata, linguistic, fileType)

  return {
    fileName: file.name,
    fileType,
    fileSize: file.size,
    analyzedAt: new Date(),
    metadata,
    linguistic,
    score,
    rawText: text,
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatAnalysisDate(date: Date): string {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function FileTypeBadge({ type }: { type: FileType }) {
  const colors: Record<FileType, string> = {
    pdf: 'bg-red-100 text-red-700',
    docx: 'bg-blue-100 text-blue-700',
    odt: 'bg-green-100 text-green-700',
    unknown: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${colors[type]}`}>
      {type.toUpperCase()}
    </span>
  )
}

function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()
  const langs: { code: Locale; label: string }[] = [
    { code: 'es', label: 'ES' },
    { code: 'gl', label: 'GL' },
    { code: 'en', label: 'EN' },
  ]
  return (
    <div className="flex items-center gap-1 text-sm">
      {langs.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => setLocale(code)}
          className={`px-2 py-0.5 rounded font-medium transition-colors ${
            locale === code
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const { locale } = useLocale()
  const t = useTranslation()
  const [history, setHistory] = useState<AnalysisResult[]>(() => loadAnalysisHistory())
  const [result, setResult] = useState<AnalysisResult | null>(() => {
    const initialHistory = loadAnalysisHistory()
    return initialHistory[0] ?? null
  })
  const [loading, setLoading] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)

  useEffect(() => {
    const persistedHistory = persistAnalysisHistory(history)

    const sameLength = persistedHistory.length === history.length
    const sameItems =
      sameLength &&
      persistedHistory.every((item, index) => getAnalysisId(item) === getAnalysisId(history[index]))

    if (!sameItems) {
      setHistory(persistedHistory)
      if (result && !persistedHistory.some((item) => getAnalysisId(item) === getAnalysisId(result))) {
        setResult(persistedHistory[0] ?? null)
      }
    }
  }, [history, result])

  const handleFiles = useCallback(
    async (files: File[]) => {
      setLoading(true)
      setError(null)
      setResult(null)
      setShowText(false)
      try {
        const expandedFiles = await expandUploadedFiles(files, t.zipNoSupportedDocuments)
        const results: AnalysisResult[] = []
        const failures: string[] = []

        for (const file of expandedFiles) {
          try {
            results.push(await analyzeFile(file, t.unsupportedFileType))
          } catch (e) {
            failures.push(e instanceof Error ? `${file.name}: ${e.message}` : file.name)
          }
        }

        if (results.length === 0) {
          throw new Error(failures[0] ?? t.errorAnalyzing)
        }

        setResult(results[0])
        setHistory((prev) => [...results, ...prev])

        if (failures.length > 0) {
          setError(t.partialAnalysis(failures.length, results.length))
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t.errorAnalyzing)
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  const handleGeneratePdfReport = useCallback(async () => {
    if (history.length === 0) {
      setError(t.report.emptyHistory)
      return
    }

    setGeneratingReport(true)
    setError(null)

    try {
      const { generateAnalysisPdfReport } = await import('./utils/reportPdf')
      await generateAnalysisPdfReport({
        analyses: history,
        locale,
        labels: {
          title: t.report.title,
          generatedAt: t.report.generatedAt,
          sessionSummary: t.report.sessionSummary,
          reviewedDocuments: t.report.reviewedDocuments,
          averageScore: t.report.averageScore,
          riskDistribution: t.report.riskDistribution,
          fileName: t.report.fileName,
          fileType: t.report.fileType,
          analyzedAt: t.report.analyzedAt,
          fileSize: t.report.fileSize,
          score: t.report.score,
          metadataSummary: t.report.metadataSummary,
          author: t.metadata.author,
          revisions: t.metadata.revisions,
          editingTime: t.metadata.editingTime,
          createdAt: t.metadata.createdAt,
          modifiedAt: t.metadata.modifiedAt,
          software: t.report.software,
          linguisticSummary: t.report.linguisticSummary,
          words: t.linguistic.words,
          sentences: t.linguistic.sentences,
          paragraphs: t.linguistic.paragraphs,
          styleHotspots: t.linguistic.styleHotspots,
          aiPhrases: t.linguistic.aiPhrases,
          slopPhrases: t.linguistic.slopPhrases,
          flags: t.report.flags,
          noFlags: t.report.noFlags,
          riskLevelLabel: t.report.riskLevelLabel,
          riskLevelName: (level) => t.report.riskLevelNames[level],
          sectionLabel: t.report.sectionLabel,
          outputFileName: t.report.outputFileName,
        },
      })
    } catch {
      setError(t.report.generationError)
    } finally {
      setGeneratingReport(false)
    }
  }, [history, locale, t])

  const handleSelectHistory = useCallback((analysis: AnalysisResult) => {
    setResult(analysis)
    setError(null)
    setShowText(false)
  }, [])

  const handleClearHistory = useCallback(() => {
    localStorage.removeItem(ANALYSIS_HISTORY_KEY)
    setHistory([])
    setResult(null)
    setError(null)
    setShowText(false)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl">🔍</span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-800 leading-tight">
                {t.appTitle}
              </h1>
              <p className="text-xs text-gray-400 truncate">{t.appSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher />
            {history.length > 0 && (
              <button
                onClick={handleGeneratePdfReport}
                disabled={generatingReport}
                aria-busy={generatingReport}
                className="min-h-11 text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {generatingReport ? t.report.generatingPdf : t.report.generatePdf}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Upload */}
        <FileDropzone onFiles={handleFiles} loading={loading} />

        {history.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-700">{t.history.panelTitle}</h2>
                <p className="text-xs text-gray-400 mt-1">{t.history.storedLocally}</p>
              </div>
              <button
                onClick={handleClearHistory}
                className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
              >
                {t.history.clear}
              </button>
            </div>
            <div className="p-3 space-y-2">
              {history.map((analysis, index) => {
                const isSelected = result ? getAnalysisId(result) === getAnalysisId(analysis) : false

                return (
                  <button
                    key={getAnalysisId(analysis)}
                    onClick={() => handleSelectHistory(analysis)}
                    className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                      isSelected
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileTypeBadge type={analysis.fileType} />
                      <span className="font-medium text-gray-700 truncate">
                        {analysis.fileName}
                      </span>
                      {index === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium shrink-0">
                          {t.history.latest}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto shrink-0">
                        {formatAnalysisDate(analysis.analyzedAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      <span>
                        {analysis.score.total}/100
                      </span>
                      <span>{formatSize(analysis.fileSize)}</span>
                      <span>{analysis.linguistic.totalWords} {t.words}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"
          >
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* File info */}
            <div className="flex items-center gap-3 px-1">
              <FileTypeBadge type={result.fileType} />
              <span className="text-gray-700 font-medium truncate">
                {result.fileName}
              </span>
              <span className="text-gray-400 text-sm ml-auto shrink-0">
                {formatSize(result.fileSize)}
              </span>
            </div>

            {/* Score */}
            <ScoreGauge score={result.score} />

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <strong>{t.note}:</strong> {t.disclaimer}
            </div>

            {/* Panels */}
            <MetadataPanel metadata={result.metadata} flags={result.score.flags} />
            <LinguisticPanel metrics={result.linguistic} flags={result.score.flags} />
            <FingerprintPanel
              metadata={result.metadata}
              flags={result.score.flags}
              fileType={result.fileType}
            />

            {/* Raw text preview */}
            <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setShowText((s) => !s)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">📜</span>
                  <span className="font-semibold text-gray-700">
                    {t.rawText.panelTitle}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({result.linguistic.totalWords} {t.words})
                  </span>
                </div>
                <span className="text-gray-400">{showText ? '▲' : '▼'}</span>
              </button>
              {showText && (
                <div className="px-4 pb-4">
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-4 overflow-auto max-h-80 whitespace-pre-wrap font-mono leading-relaxed">
                    {result.rawText.slice(0, 5000)}
                    {result.rawText.length > 5000 && (
                      <span className="text-gray-400">
                        {'\n\n'}[... {result.rawText.length - 5000} {t.rawText.moreChars}]
                      </span>
                    )}
                  </pre>
                </div>
              )}
            </section>

            {/* New analysis button */}
            <div className="text-center">
              <button
                onClick={() => {
                  setResult(null)
                  setError(null)
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
              >
                {t.analyzeAnother}
              </button>
            </div>
          </>
        )}

        {/* Empty state info */}
        {!result && !loading && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              {t.whatIsAnalyzed}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {t.analysisLayers.map((item) => (
                <div
                  key={item.title}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <h3 className="font-semibold text-gray-700 mb-1">{item.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6 mt-8 space-y-1">
        <p>{t.footer}</p>
        <p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-600 transition-colors underline underline-offset-2"
          >
            {t.repoLink} — {REPO_URL}
          </a>
        </p>
      </footer>
    </div>
  )
}
