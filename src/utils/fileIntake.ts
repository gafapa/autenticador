import { loadSafeZip, readZipEntry } from './safeArchive'
import { checkFileSize, DocumentInputError, INPUT_LIMITS } from './inputLimits'
import type { FileType } from '../types/analysis'

export function detectFileType(file: Pick<File, 'name'>): FileType {
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension === 'pdf' || extension === 'docx' || extension === 'odt' ? extension : 'unknown'
}

// Yield one document at a time so a ZIP does not retain all expanded files in RAM.
export async function* expandUploadedFiles(files: File[]): AsyncGenerator<File> {
  if (files.length > INPUT_LIMITS.files || files.reduce((sum, file) => sum + file.size, 0) > INPUT_LIMITS.batchBytes) {
    throw new DocumentInputError('limit')
  }
  let count = 0
  let expandedBytes = 0
  for (const file of files) {
    checkFileSize(file)
    if (!file.name.toLowerCase().endsWith('.zip')) {
      if (detectFileType(file) === 'unknown') throw new DocumentInputError('invalid')
      if (++count > INPUT_LIMITS.files) throw new DocumentInputError('limit')
      expandedBytes += file.size
      if (expandedBytes > INPUT_LIMITS.batchBytes) throw new DocumentInputError('limit')
      yield file
      continue
    }
    const zip = await loadSafeZip(await file.arrayBuffer())
    const entries = Object.values(zip.files).filter(entry => !entry.dir && detectFileType(entry) !== 'unknown')
      .sort((a, b) => a.name.localeCompare(b.name))
    if (entries.length === 0) throw new DocumentInputError('invalid')
    if (count + entries.length > INPUT_LIMITS.files) throw new DocumentInputError('limit')
    for (const entry of entries) {
      const bytes = await readZipEntry(entry, Math.min(INPUT_LIMITS.fileBytes, INPUT_LIMITS.batchBytes - expandedBytes))
      expandedBytes += bytes.length
      count++
      const name = `${file.name.replace(/\.zip$/i, '')}__${entry.name.replace(/[\\/]+/g, '__')}`
      yield new File([Uint8Array.from(bytes)], name)
    }
  }
}
