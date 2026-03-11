import { useState } from 'react'
import type { DocumentMetadata, RiskFlag, FileType } from '../types/analysis'
import { useTranslation } from '../i18n'

interface FingerprintPanelProps {
  metadata: DocumentMetadata
  flags: RiskFlag[]
  fileType: FileType
}

export function FingerprintPanel({ metadata, flags, fileType }: FingerprintPanelProps) {
  const t = useTranslation()
  const tf = t.fingerprint
  const [open, setOpen] = useState(true)
  const fpFlags = flags.filter((f) => f.category === 'fingerprint')

  const softwareFields = [
    metadata.creator,
    metadata.producer,
    metadata.generator,
  ].filter(Boolean) as string[]

  function classifySoftware(s: string): { label: string; icon: string; type: string; badge?: string } {
    const lower = s.toLowerCase()
    if (/microsoft word|ms word/.test(lower)) return { label: 'Microsoft Word', icon: '📝', type: 'word-processor' }
    if (/libreoffice|openoffice/.test(lower)) return { label: 'LibreOffice / OpenOffice', icon: '📄', type: 'word-processor' }
    if (/google docs|google drive/.test(lower)) return { label: 'Google Docs', icon: '📑', type: 'word-processor' }
    if (/apple pages|pages/.test(lower)) return { label: 'Apple Pages', icon: '📃', type: 'word-processor' }
    if (/wps writer|wps/.test(lower)) return { label: 'WPS Writer', icon: '📝', type: 'word-processor' }
    if (/chatgpt|openai|gpt/.test(lower)) return { label: 'ChatGPT / OpenAI', icon: '🤖', type: 'ai', badge: tf.aiBadge }
    if (/claude|anthropic/.test(lower)) return { label: 'Claude / Anthropic', icon: '🤖', type: 'ai', badge: tf.aiBadge }
    if (/gemini|bard/.test(lower)) return { label: 'Google Gemini', icon: '🤖', type: 'ai', badge: tf.aiBadge }
    if (/quillbot|wordtune|writesonic|jasper|copy\.ai|rytr|llama|mistral/.test(lower))
      return { label: s, icon: '🤖', type: 'ai', badge: tf.aiBadge }
    if (/python.?docx|python_docx/.test(lower)) return { label: 'python-docx (Python)', icon: '🐍', type: 'library', badge: tf.libBadge }
    if (/reportlab/.test(lower)) return { label: 'ReportLab (Python)', icon: '🐍', type: 'library', badge: tf.libBadge }
    if (/fpdf/.test(lower)) return { label: 'FPDF (Python/PHP)', icon: '🐍', type: 'library', badge: tf.libBadge }
    if (/weasyprint/.test(lower)) return { label: 'WeasyPrint (Python)', icon: '🐍', type: 'library', badge: tf.libBadge }
    if (/pdfkit|wkhtmlto/.test(lower)) return { label: 'pdfkit / wkhtmltopdf', icon: '⚙️', type: 'library', badge: tf.libBadge }
    if (/pdfmake/.test(lower)) return { label: 'pdfmake (JavaScript)', icon: '🟨', type: 'library', badge: tf.libBadge }
    if (/jspdf/.test(lower)) return { label: 'jsPDF (JavaScript)', icon: '🟨', type: 'library', badge: tf.libBadge }
    if (/puppeteer|playwright/.test(lower)) return { label: 'Puppeteer / Playwright', icon: '🤖', type: 'library', badge: tf.libBadge }
    if (/itext/.test(lower)) return { label: 'iText (Java)', icon: '☕', type: 'library', badge: tf.libBadge }
    if (/apache poi|org\.apache/.test(lower)) return { label: 'Apache POI (Java)', icon: '☕', type: 'library', badge: tf.libBadge }
    if (/pandoc/.test(lower)) return { label: 'Pandoc', icon: '⚙️', type: 'library', badge: tf.libBadge }
    if (/latex|pdflatex|xelatex|lualatex|tex/.test(lower)) return { label: 'LaTeX', icon: '🔤', type: 'library', badge: tf.libBadge }
    if (/asciidoc|asciidoctor/.test(lower)) return { label: 'AsciiDoc', icon: '⚙️', type: 'library', badge: tf.libBadge }
    if (/sphinx|docutils/.test(lower)) return { label: 'Sphinx / Docutils (Python)', icon: '🐍', type: 'library', badge: tf.libBadge }
    if (/ilovepdf|smallpdf|pdf24|online2pdf|sodapdf|sejda/.test(lower))
      return { label: s, icon: '🔄', type: 'converter', badge: tf.converterBadge }
    if (/adobe acrobat|adobe distiller/.test(lower)) return { label: 'Adobe Acrobat', icon: '📕', type: 'other' }
    if (/adobe/.test(lower)) return { label: s, icon: '📕', type: 'other' }
    return { label: s, icon: '💾', type: 'other' }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🔬</span>
          <span className="font-semibold text-gray-700">{tf.panelTitle}</span>
          {fpFlags.length > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {fpFlags.length} {fpFlags.length !== 1 ? t.alerts : t.alert}
            </span>
          )}
        </div>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {fpFlags.length > 0 && (
            <div className="space-y-2">
              {fpFlags.map((f) => (
                <div
                  key={f.id}
                  className={`text-sm rounded-lg px-3 py-2 flex gap-2 items-start ${
                    f.severity === 'high'
                      ? 'bg-red-50 text-red-800'
                      : f.severity === 'medium'
                      ? 'bg-yellow-50 text-yellow-800'
                      : 'bg-blue-50 text-blue-800'
                  }`}
                >
                  <span>{f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟡' : '🔵'}</span>
                  <div>
                    <span className="font-semibold">{f.label}:</span>{' '}
                    <span>{f.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {softwareFields.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">{tf.softwareDetected}</p>
              <div className="space-y-2">
                {softwareFields.map((s, i) => {
                  const info = classifySoftware(s)
                  const isWarning = info.type === 'ai' || info.type === 'library'
                  const isModerate = info.type === 'converter'
                  const borderBg = isWarning
                    ? 'border-red-200 bg-red-50'
                    : isModerate
                    ? 'border-yellow-200 bg-yellow-50'
                    : 'border-gray-100 bg-gray-50'
                  const textColor = isWarning ? 'text-red-700' : 'text-gray-700'
                  const badgeColor = isWarning
                    ? 'text-red-600 bg-red-100'
                    : 'text-yellow-700 bg-yellow-100'
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-lg p-3 border ${borderBg}`}
                    >
                      <span className="text-2xl">{info.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${textColor}`}>{info.label}</p>
                        <p className="text-xs text-gray-400 font-mono truncate">{s}</p>
                      </div>
                      {info.badge && (
                        <span className={`ml-auto shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                          {info.badge}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {fileType === 'docx' && (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">{tf.docxStructure}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className={`rounded-lg p-2.5 border text-sm ${metadata.hasRevisionIds ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <span className="mr-1">{metadata.hasRevisionIds ? '✅' : '❌'}</span>
                  <span className={metadata.hasRevisionIds ? 'text-green-700' : 'text-red-700'}>
                    {tf.revisionIds}
                  </span>
                </div>
                <div className={`rounded-lg p-2.5 border text-sm ${metadata.hasTrackChanges ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                  <span className="mr-1">{metadata.hasTrackChanges ? '✅' : '➖'}</span>
                  <span className={metadata.hasTrackChanges ? 'text-green-700' : 'text-gray-500'}>
                    {tf.trackChanges}
                  </span>
                </div>
                <div className={`rounded-lg p-2.5 border text-sm ${metadata.hasComments ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                  <span className="mr-1">{metadata.hasComments ? '✅' : '➖'}</span>
                  <span className={metadata.hasComments ? 'text-green-700' : 'text-gray-500'}>
                    {tf.comments}
                  </span>
                </div>
                <div className={`rounded-lg p-2.5 border text-sm ${metadata.revisions && metadata.revisions > 3 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <span className="mr-1">{metadata.revisions && metadata.revisions > 3 ? '✅' : '⚠'}</span>
                  <span className={metadata.revisions && metadata.revisions > 3 ? 'text-green-700' : 'text-red-700'}>
                    {metadata.revisions ?? 0} {metadata.revisions !== 1 ? tf.revisions : tf.revision}
                  </span>
                </div>
              </div>
            </div>
          )}

          {softwareFields.length === 0 && fpFlags.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">
              {tf.noFingerprints}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
