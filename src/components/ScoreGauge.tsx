import type { ScoreBreakdown } from '../types/analysis'
import { useTranslation } from '../i18n'

interface ScoreGaugeProps {
  score: ScoreBreakdown
}

const LEVEL_COLORS = {
  low: { ring: 'ring-green-500', bg: 'bg-green-50', text: 'text-green-700', bar: 'bg-green-500' },
  moderate: { ring: 'ring-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', bar: 'bg-yellow-500' },
  high: { ring: 'ring-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500' },
  critical: { ring: 'ring-red-500', bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500' },
}

function ScoreBar({
  label,
  value,
  max,
  color,
}: {
  label: string
  value: number
  max: number
  color: string
}) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-mono font-semibold text-gray-700">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function ScoreGauge({ score }: ScoreGaugeProps) {
  const t = useTranslation()
  const c = LEVEL_COLORS[score.level]

  const sevLabels: Record<string, string> = {
    high: t.score.sevHigh,
    medium: t.score.sevMedium,
    low: t.score.sevLow,
  }

  return (
    <div className={`rounded-2xl p-6 ring-2 ${c.ring} ${c.bg}`}>
      <div className="flex items-center gap-6">
        {/* Score circle */}
        <div className="flex-shrink-0">
          <div
            className={`w-28 h-28 rounded-full ring-4 ${c.ring} flex flex-col items-center justify-center`}
          >
            <span className={`text-4xl font-black ${c.text}`}>
              {score.total}
            </span>
            <span className="text-xs text-gray-400 font-medium">/ 100</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className={`text-lg font-bold ${c.text} leading-tight mb-3`}>
            {t.score.levels[score.level]}
          </p>
          <div className="space-y-2">
            <ScoreBar
              label={t.score.metadata}
              value={score.metadataScore}
              max={40}
              color={c.bar}
            />
            <ScoreBar
              label={t.score.linguistic}
              value={score.linguisticScore}
              max={40}
              color={c.bar}
            />
            <ScoreBar
              label={t.score.fingerprint}
              value={score.fingerprintScore}
              max={20}
              color={c.bar}
            />
          </div>
        </div>
      </div>

      {/* Flag counts */}
      <div className="mt-4 pt-4 border-t border-gray-200 flex gap-4 text-sm">
        {(['high', 'medium', 'low'] as const).map((sev) => {
          const count = score.flags.filter((f) => f.severity === sev).length
          const sevColors = {
            high: 'text-red-600 bg-red-100',
            medium: 'text-yellow-700 bg-yellow-100',
            low: 'text-blue-600 bg-blue-100',
          }
          return count > 0 ? (
            <span
              key={sev}
              className={`px-2 py-0.5 rounded-full font-medium ${sevColors[sev]}`}
            >
              {count} {t.score.risk} {sevLabels[sev]}
            </span>
          ) : null
        })}
      </div>
    </div>
  )
}
