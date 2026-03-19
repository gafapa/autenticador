import { useState } from 'react'
import type { DocumentMetadata, RiskFlag } from '../types/analysis'
import { useTranslation } from '../i18n'

interface MetadataPanelProps {
  metadata: DocumentMetadata
  flags: RiskFlag[]
}

function formatDate(d?: Date): string {
  if (!d) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMinutes(m?: number): string {
  if (m === undefined) return '—'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

function Row({
  label,
  value,
  flagged,
  title,
  yesLabel,
  noLabel,
  showWhenEmpty,
}: {
  label: string
  value: string | number | boolean | undefined
  flagged?: boolean
  title?: string
  yesLabel?: string
  noLabel?: string
  showWhenEmpty?: boolean
}) {
  if (!showWhenEmpty && (value === undefined || value === null || value === '')) return null
  const display =
    value === undefined || value === null || value === ''
      ? '—'
      : typeof value === 'boolean'
      ? (value ? (yesLabel ?? 'Sí') : (noLabel ?? 'No'))
      : String(value)

  return (
    <tr
      className={`border-b border-gray-100 last:border-0 ${flagged ? 'bg-red-50' : ''}`}
      title={title}
    >
      <td className="py-2 pr-4 text-sm text-gray-500 font-medium whitespace-nowrap">
        {label}
      </td>
      <td className="py-2 text-sm text-gray-800 font-mono break-all">
        <span className={flagged ? 'text-red-700 font-semibold' : ''}>
          {display}
        </span>
        {flagged && <span className="ml-2 text-red-500 text-xs">⚠</span>}
      </td>
    </tr>
  )
}

export function MetadataPanel({ metadata, flags }: MetadataPanelProps) {
  const t = useTranslation()
  const tm = t.metadata
  const [open, setOpen] = useState(true)
  const metaFlags = flags.filter((f) => f.category === 'metadata')
  const flagIds = new Set(flags.map((f) => f.id))
  const hasAnyFlag = (ids: string[]) => ids.some((id) => flagIds.has(id))

  const rowFlags = {
    author: ['no_author', 'generic_author'],
    dates: ['dates_identical', 'dates_very_close', 'dates_close'],
    editingTime: [
      'edit_time_critical',
      'edit_time_very_low',
      'edit_time_low',
      'edit_time_suspicious',
    ],
    revisions: ['revisions_zero', 'revisions_one', 'revisions_low', 'revisions_medium'],
    revisionIds: ['no_rsid'],
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">📋</span>
          <span className="font-semibold text-gray-700">{tm.panelTitle}</span>
          {metaFlags.length > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {metaFlags.length} {metaFlags.length !== 1 ? t.alerts : t.alert}
            </span>
          )}
        </div>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {metaFlags.length > 0 && (
            <div className="mb-4 space-y-2">
              {metaFlags.map((f) => (
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

          <table className="w-full">
            <tbody>
              <Row
                label={tm.author}
                value={metadata.author}
                flagged={hasAnyFlag(rowFlags.author)}
                yesLabel={tm.yes}
                noLabel={tm.no}
                showWhenEmpty={hasAnyFlag(rowFlags.author)}
              />
              <Row label={tm.lastModifiedBy} value={metadata.lastModifiedBy} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.title} value={metadata.title} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.subject} value={metadata.subject} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.keywords} value={metadata.keywords} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.description} value={metadata.description} yesLabel={tm.yes} noLabel={tm.no} />
              <Row
                label={tm.createdAt}
                value={formatDate(metadata.createdAt)}
                flagged={hasAnyFlag(rowFlags.dates)}
                yesLabel={tm.yes}
                noLabel={tm.no}
              />
              <Row
                label={tm.modifiedAt}
                value={formatDate(metadata.modifiedAt)}
                flagged={hasAnyFlag(rowFlags.dates)}
                yesLabel={tm.yes}
                noLabel={tm.no}
              />
              <Row
                label={tm.editingTime}
                value={formatMinutes(metadata.editingTimeMinutes)}
                flagged={hasAnyFlag(rowFlags.editingTime)}
                yesLabel={tm.yes}
                noLabel={tm.no}
              />
              <Row
                label={tm.revisions}
                value={metadata.revisions}
                flagged={hasAnyFlag(rowFlags.revisions)}
                yesLabel={tm.yes}
                noLabel={tm.no}
              />
              <Row label={tm.wordCount} value={metadata.wordCount} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.pageCount} value={metadata.pageCount} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.paragraphCount} value={metadata.paragraphCount} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.lineCount} value={metadata.lineCount} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.creator} value={metadata.creator} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.generator} value={metadata.generator} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.producer} value={metadata.producer} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.hasTrackChanges} value={metadata.hasTrackChanges} yesLabel={tm.yes} noLabel={tm.no} />
              <Row label={tm.hasComments} value={metadata.hasComments} yesLabel={tm.yes} noLabel={tm.no} />
              <Row
                label={tm.hasRevisionIds}
                value={metadata.hasRevisionIds}
                flagged={hasAnyFlag(rowFlags.revisionIds)}
                title={tm.hasRevisionIdsTitle}
                yesLabel={tm.yes}
                noLabel={tm.no}
              />
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
