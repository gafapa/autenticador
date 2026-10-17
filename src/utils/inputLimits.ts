export const INPUT_LIMITS = {
  fileBytes: 25 * 1024 * 1024,
  batchBytes: 100 * 1024 * 1024,
  files: 50,
  archiveEntries: 1000,
  xmlBytes: 8 * 1024 * 1024,
  textCharacters: 2_000_000,
  pdfPages: 500,
} as const

export class DocumentInputError extends Error {
  constructor(public readonly code: 'limit' | 'invalid' | 'encrypted') {
    super(code)
    this.name = 'DocumentInputError'
  }
}

export function checkFileSize(file: File): void {
  if (file.name.length > 1000) throw new DocumentInputError('invalid')
  if (file.size === 0) throw new DocumentInputError('invalid')
  if (file.size > INPUT_LIMITS.fileBytes) throw new DocumentInputError('limit')
}

export function checkMetadataSize(metadata: object): void {
  for (const value of Object.values(metadata)) {
    if (typeof value === 'string' && value.length > 4096 ||
      Array.isArray(value) && (value.length > 200 || value.some(item => typeof item === 'string' && item.length > 1000))) {
      throw new DocumentInputError('limit')
    }
  }
}
