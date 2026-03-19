import { useCallback, useRef, useState } from 'react'
import { useTranslation } from '../i18n'

interface FileDropzoneProps {
  onFiles: (files: File[]) => void
  loading: boolean
}

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.odt', '.zip']
const ACCEPTED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
]

function isAccepted(file: File): boolean {
  if (ACCEPTED_MIME.includes(file.type)) return true
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  return ACCEPTED_EXTENSIONS.includes(ext)
}

export function FileDropzone({ onFiles, loading }: FileDropzoneProps) {
  const t = useTranslation()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (files: File[]) => {
      const invalidFile = files.find((file) => !isAccepted(file))
      if (invalidFile) {
        setError(t.unsupportedFormat(invalidFile.name))
        return
      }

      if (files.length === 0) {
        return
      }

      setError(null)
      onFiles(files)
    },
    [onFiles, t]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const files = Array.from(e.dataTransfer.files)
      handleFiles(files)
    },
    [handleFiles]
  )

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      handleFiles(files)
      e.target.value = ''
    },
    [handleFiles]
  )

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-200 select-none
          ${dragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }
          ${loading ? 'opacity-60 cursor-not-allowed' : ''}
        `}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl">
            {loading ? '⏳' : dragging ? '📂' : '📄'}
          </div>
          <div>
            <p className="text-xl font-semibold text-gray-700">
              {loading ? t.dropzone.analyzing : t.dropzone.title}
            </p>
            <p className="text-sm text-gray-400 mt-1">{t.dropzone.or}</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {['PDF', 'DOCX', 'ODT', 'ZIP'].map((ext) => (
              <span
                key={ext}
                className="px-2 py-0.5 text-xs font-mono bg-gray-100 text-gray-600 rounded"
              >
                .{ext.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.odt,.zip"
          multiple
          onChange={onInputChange}
          disabled={loading}
        />
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-600 text-center">{error}</p>
      )}
    </div>
  )
}
