import { useState } from 'react'
import type { LinguisticMetrics, RiskFlag } from '../types/analysis'
import { useTranslation } from '../i18n'

interface LinguisticPanelProps {
  metrics: LinguisticMetrics
  flags: RiskFlag[]
}

function Metric({
  label,
  value,
  unit,
  flagged,
  note,
}: {
  label: string
  value: string | number
  unit?: string
  flagged?: boolean
  note?: string
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        flagged ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'
      }`}
      title={note}
    >
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${flagged ? 'text-red-700' : 'text-gray-800'}`}>
        {typeof value === 'number' ? value.toFixed(2) : value}
        {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </p>
      {note && <p className="text-xs text-gray-400 mt-1 leading-tight">{note}</p>}
    </div>
  )
}

export function LinguisticPanel({ metrics, flags }: LinguisticPanelProps) {
  const t = useTranslation()
  const tl = t.linguistic
  const [open, setOpen] = useState(true)
  const lingFlags = flags.filter((f) => f.category === 'linguistic')
  const insufficient = flags.find((f) => f.id === 'insufficient_text')
  const visibleLingFlags = lingFlags.filter((f) => f.id !== 'insufficient_text')

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🔤</span>
          <span className="font-semibold text-gray-700">{tl.panelTitle}</span>
          {visibleLingFlags.length > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {visibleLingFlags.length} {visibleLingFlags.length !== 1 ? t.alerts : t.alert}
            </span>
          )}
        </div>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {insufficient && (
            <div className="mb-4 text-sm bg-blue-50 text-blue-700 rounded-lg px-3 py-2">
              ℹ {insufficient.detail}
            </div>
          )}

          {/* Alerts */}
          {visibleLingFlags.length > 0 && (
            <div className="mb-4 space-y-2">
              {visibleLingFlags.map((f) => (
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

          {/* Basic stats */}
          <div className="mb-3 grid grid-cols-3 gap-3">
            <Metric label={tl.words} value={metrics.totalWords} />
            <Metric label={tl.sentences} value={metrics.totalSentences} />
            <Metric label={tl.paragraphs} value={metrics.totalParagraphs} />
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label={tl.burstiness}
              value={metrics.stdSentenceLength}
              unit={t.words}
              flagged={metrics.stdSentenceLength < 8 && metrics.totalSentences >= 10}
              note={tl.burstiNote}
            />
            <Metric
              label={tl.avgSentence}
              value={metrics.avgSentenceLength}
              unit={t.words}
              note={tl.avgSentNote}
            />
            <Metric
              label={tl.ttr}
              value={(metrics.typeTokenRatio * 100).toFixed(1)}
              unit="%"
              flagged={metrics.typeTokenRatio < 0.45}
              note={tl.ttrNote}
            />
            <Metric
              label={tl.hapax}
              value={metrics.hapaxPercentage.toFixed(1)}
              unit="%"
              note={tl.hapaxNote}
            />
            <Metric
              label={tl.entropy}
              value={metrics.shannonEntropy}
              unit="bits/char"
              flagged={metrics.shannonEntropy < 4.2 && metrics.totalWords > 200}
              note={tl.entropyNote}
            />
            <Metric
              label={tl.stdParagraph}
              value={metrics.stdParagraphLength}
              unit={t.words}
              flagged={metrics.stdParagraphLength < 10 && metrics.totalParagraphs >= 5}
              note={tl.stdParagraphNote}
            />
            <Metric
              label={tl.aiPhrases}
              value={metrics.aiPhraseCount}
              unit=""
              flagged={metrics.aiPhraseCount >= 2}
              note={tl.aiPhrasesNote}
            />
            <Metric
              label={tl.slopPhrases}
              value={metrics.slopPhraseCount}
              unit=""
              flagged={metrics.slopPhraseCount >= 2}
              note={tl.slopNote}
            />
            <Metric
              label={tl.pronouns}
              value={metrics.pronounRatio.toFixed(2)}
              unit="%"
              flagged={metrics.pronounRatio < 0.3 && metrics.totalWords > 200}
              note={tl.pronounNote}
            />
            <Metric
              label={tl.questions}
              value={metrics.questionRatio.toFixed(1)}
              unit="%"
              flagged={metrics.questionRatio === 0 && metrics.totalSentences >= 15}
              note={tl.questionsNote}
            />
            <Metric
              label={tl.firstWordDiv}
              value={(metrics.firstWordDiversity * 100).toFixed(0)}
              unit="%"
              flagged={metrics.firstWordDiversity < 0.55 && metrics.totalSentences >= 10}
              note={tl.firstWordNote}
            />
            <Metric
              label={tl.invisibleChars}
              value={metrics.zeroWidthCharCount}
              flagged={metrics.zeroWidthCharCount > 0}
              note={tl.invisibleNote}
            />
            <Metric
              label={tl.segmentCount}
              value={metrics.segmentCount}
              flagged={metrics.segmentCount >= 3 && metrics.styleChangeHotspotCount >= 2}
              note={tl.segmentNote}
            />
            <Metric
              label={tl.styleChangeAvg}
              value={metrics.styleChangeAverage.toFixed(2)}
              flagged={metrics.segmentCount >= 3 && metrics.styleChangeAverage >= 0.3}
              note={tl.styleChangeNote}
            />
            <Metric
              label={tl.styleChangeMax}
              value={metrics.styleChangeMax.toFixed(2)}
              flagged={metrics.segmentCount >= 3 && metrics.styleChangeMax >= 0.45}
              note={tl.styleChangeMaxNote}
            />
            <Metric
              label={tl.styleHotspots}
              value={metrics.styleChangeHotspotCount}
              flagged={metrics.styleChangeHotspotCount > 0}
              note={tl.styleHotspotsNote}
            />
          </div>

          {metrics.styleChangeHotspots.length > 0 && (
            <div className="mt-3 p-3 bg-rose-50 rounded-xl">
              <p className="text-xs font-semibold text-rose-800 mb-2">{tl.styleHotspotList}</p>
              <div className="flex flex-wrap gap-2">
                {metrics.styleChangeHotspots.map((hotspot) => (
                  <span
                    key={`${hotspot.fromSegment}-${hotspot.toSegment}`}
                    className="px-2 py-0.5 bg-rose-100 text-rose-800 text-xs font-mono rounded"
                  >
                    S{hotspot.fromSegment}-S{hotspot.toSegment}: {hotspot.distance.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI transition phrases */}
          {metrics.aiPhrasesFound.length > 0 && (
            <div className="mt-3 p-3 bg-yellow-50 rounded-xl">
              <p className="text-xs font-semibold text-yellow-800 mb-2">
                {tl.aiPhrasesFound}
              </p>
              <div className="flex flex-wrap gap-2">
                {metrics.aiPhrasesFound.map((phrase) => (
                  <span
                    key={phrase}
                    className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-mono rounded"
                  >
                    "{phrase}"
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Slop phrases */}
          {metrics.slopPhrasesFound.length > 0 && (
            <div className="mt-3 p-3 bg-orange-50 rounded-xl">
              <p className="text-xs font-semibold text-orange-800 mb-2">
                {tl.slopFound}
              </p>
              <div className="flex flex-wrap gap-2">
                {metrics.slopPhrasesFound.map((phrase) => (
                  <span
                    key={phrase}
                    className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs font-mono rounded"
                  >
                    "{phrase}"
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
