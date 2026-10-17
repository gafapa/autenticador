import { useState, useCallback, useEffect, useRef } from 'react'
import { FileDropzone } from './components/FileDropzone'
import { ScoreGauge } from './components/ScoreGauge'
import { MetadataPanel } from './components/MetadataPanel'
import { LinguisticPanel } from './components/LinguisticPanel'
import { FingerprintPanel } from './components/FingerprintPanel'
import { analyzeLinguistics } from './analyzers/linguisticAnalyzer'
import { calculateScore } from './analyzers/scoringEngine'
import type { AnalysisResult, FileType } from './types/analysis'
import { useTranslation, useLocale, LOCALE_OPTIONS, type Locale } from './i18n'
import { loadAnalysisHistory, persistAnalysisHistory, PERSISTED_RAW_TEXT_LIMIT } from './utils/analysisHistory'
import { expandUploadedFiles, detectFileType } from './utils/fileIntake'
import { checkFileSize, DocumentInputError } from './utils/inputLimits'
import { localizeRiskFlag } from './i18n/reviewCopy'

const REPO_URL = 'https://github.com/gafapa/autenticador'
function getAnalysisId(result: AnalysisResult): string {
  return `${result.analyzedAt.toISOString()}::${result.fileName}::${result.fileSize}`
}

async function analyzeFile(file: File, errorMsg: string): Promise<AnalysisResult> {
  checkFileSize(file)
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
    rawText: text.slice(0, PERSISTED_RAW_TEXT_LIMIT),
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
  const t = useTranslation()
  const { locale, setLocale } = useLocale()
  return (
    <label className="block">
      <span className="sr-only">{t.languageLabel}</span>
      <select
        aria-label={t.languageLabel}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {LOCALE_OPTIONS.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function App() {
  const { locale } = useLocale()
  const t = useTranslation()
  const [initialHistory] = useState(loadAnalysisHistory)
  const [history, setHistory] = useState<AnalysisResult[]>(initialHistory.history)
  const [result, setResult] = useState<AnalysisResult | null>(initialHistory.history[0] ?? null)
  const [loading, setLoading] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyDamaged, setHistoryDamaged] = useState(initialHistory.damaged)
  const [storageFailed, setStorageFailed] = useState(false)
  const [showText, setShowText] = useState(false)
  const processing = useRef(false)
  const historyDirty = useRef(false)

  useEffect(() => {
    if (!historyDirty.current) return
    historyDirty.current = false
    const saved = persistAnalysisHistory(history)
    setStorageFailed(!saved)
    if (saved) setHistoryDamaged(false)
  }, [history])

  const inputErrorMessage = (reason: unknown) => {
    if (reason instanceof DocumentInputError) {
      return reason.code === 'limit' ? t.safety.limitError : reason.code === 'encrypted' ? t.safety.encryptedError : t.safety.invalidError
    }
    if (reason instanceof Error && reason.name === 'PasswordException') return t.safety.encryptedError
    return t.safety.invalidError
  }

  const handleFiles = useCallback(async (files: File[]) => {
    if (processing.current || files.length === 0) return
    processing.current = true
    setLoading(true)
    setError(null)
    setShowText(false)
    const results: AnalysisResult[] = []
    const failures: string[] = []
    try {
      for await (const file of expandUploadedFiles(files)) {
        try { results.push(await analyzeFile(file, t.unsupportedFileType)) }
        catch (reason) { failures.push(`${file.name}: ${inputErrorMessage(reason)}`) }
      }
    } catch (reason) { failures.push(inputErrorMessage(reason)) }
    finally {
      if (results.length > 0) {
        setResult(results[0])
        historyDirty.current = true
        setHistory(previous => [...results, ...previous])
      }
      if (failures.length) setError(`${results.length ? t.partialAnalysis(failures.length, results.length) + ' ' : ''}${failures.join(' ')}`)
      processing.current = false
      setLoading(false)
    }
  }, [t])

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
    if (processing.current) return
    const cleared = persistAnalysisHistory([])
    setStorageFailed(!cleared)
    if (!cleared) return
    historyDirty.current = false
    setHistoryDamaged(false)
    setHistory([])
    setResult(null)
    setError(null)
    setShowText(false)
  }, [])

  const localizedFlags = result?.score.flags.map(flag => localizeRiskFlag(flag, locale)) ?? []


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl">🔍</span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-800 leading-tight">
                {t.appTitle}
              </h1>
              <p className="text-xs text-gray-600 truncate">{t.appSubtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher />
            {history.length > 0 && (
              <button
                onClick={handleGeneratePdfReport}
                disabled={generatingReport || loading}
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
                <p className="text-xs text-gray-600 mt-1">{t.history.storedLocally}</p>
              </div>
              <button
                onClick={handleClearHistory}
                disabled={loading}
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
                    key={`${getAnalysisId(analysis)}::${index}`}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectHistory(analysis)}
                    className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                      isSelected
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <FileTypeBadge type={analysis.fileType} />
                      <span className="font-medium text-gray-700 truncate">
                        {analysis.fileName}
                      </span>
                      {index === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium shrink-0">
                          {t.history.latest}
                        </span>
                      )}
                      <span className="text-xs text-gray-600 ml-auto shrink-0">
                        {formatAnalysisDate(analysis.analyzedAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      <span>
                        {analysis.score.level === 'insufficient' ? t.score.levels.insufficient : `${analysis.score.total}/100`}
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

        {(storageFailed || historyDamaged) && (
          <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {storageFailed ? t.safety.storageError : t.safety.damagedHistory}
            {historyDamaged && history.length === 0 && (
              <button type="button" onClick={handleClearHistory} disabled={loading} className="ml-3 min-h-11 underline underline-offset-2">{t.history.clear}</button>
            )}
          </p>
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
              <span className="text-gray-600 text-sm ml-auto shrink-0">
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
            <MetadataPanel metadata={result.metadata} flags={localizedFlags} />
            <LinguisticPanel metrics={result.linguistic} flags={localizedFlags} />
            <FingerprintPanel
              metadata={result.metadata}
              flags={localizedFlags}
              fileType={result.fileType}
            />

            {/* Raw text preview */}
            <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                aria-expanded={showText}
                aria-controls="raw-text-preview"
                onClick={() => setShowText((s) => !s)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">📜</span>
                  <span className="font-semibold text-gray-700">
                    {t.rawText.panelTitle}
                  </span>
                  <span className="text-xs text-gray-600">
                    ({result.linguistic.totalWords} {t.words})
                  </span>
                </div>
                <span className="text-gray-600">{showText ? '▲' : '▼'}</span>
              </button>
              {showText && (
                <div id="raw-text-preview" className="px-4 pb-4">
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-4 overflow-auto max-h-80 whitespace-pre-wrap font-mono leading-relaxed">
                    {result.rawText.slice(0, 5000)}
                    {result.rawText.length > 5000 && (
                      <span className="text-gray-600">
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

      <footer className="text-center text-xs text-gray-600 py-6 mt-8 space-y-1">
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
