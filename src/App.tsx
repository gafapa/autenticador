import { useState, useCallback } from 'react'
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

function detectFileType(file: File): FileType {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf'
  if (
    ext === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx'
  if (ext === 'doc' || file.type === 'application/msword') return 'docx'
  if (ext === 'odt' || file.type === 'application/vnd.oasis.opendocument.text')
    return 'odt'
  return 'unknown'
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
  const t = useTranslation()
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true)
      setError(null)
      setResult(null)
      setShowText(false)
      try {
        const r = await analyzeFile(file, t.unsupportedFileType)
        setResult(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : t.errorAnalyzing)
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  const handleExport = useCallback(() => {
    if (!result) return
    const data = JSON.stringify(result, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forensics-${result.fileName}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [result])

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
            {result && (
              <button
                onClick={handleExport}
                className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
              >
                {t.exportJson}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Upload */}
        <FileDropzone onFile={handleFile} loading={loading} />

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
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
