import JSZip from 'jszip'
import { DocumentInputError, INPUT_LIMITS } from './inputLimits'

// Inspect the central directory before asking JSZip to allocate its file objects.
// Actual output is bounded separately: archive size declarations are untrusted.
export function inspectZipDirectory(bytes: Uint8Array): void {
  if (bytes.byteLength > INPUT_LIMITS.fileBytes) throw new DocumentInputError('limit')
  if (bytes.byteLength < 22) throw new DocumentInputError('invalid')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  const minimum = Math.max(0, end - 65535)
  while (end >= minimum && (view.getUint32(end, true) !== 0x06054b50 ||
    end + 22 + view.getUint16(end + 20, true) !== bytes.length)) end--
  if (end < minimum) throw new DocumentInputError('invalid')
  const count = view.getUint16(end + 10, true)
  const directorySize = view.getUint32(end + 12, true)
  const offset = view.getUint32(end + 16, true)
  if (count === 0xffff || offset === 0xffffffff || directorySize === 0xffffffff ||
    count > INPUT_LIMITS.archiveEntries) throw new DocumentInputError('limit')
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count || offset + directorySize !== end) {
    throw new DocumentInputError('invalid')
  }
  let position = offset
  let total = 0
  const names = new Set<string>()
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50) {
      throw new DocumentInputError('invalid')
    }
    if (view.getUint16(position + 8, true) & 1) throw new DocumentInputError('encrypted')
    const size = view.getUint32(position + 24, true)
    total += size
    if (size > INPUT_LIMITS.fileBytes || total > INPUT_LIMITS.batchBytes) {
      throw new DocumentInputError('limit')
    }
    const nameLength = view.getUint16(position + 28, true)
    const next = position + 46 + nameLength + view.getUint16(position + 30, true) +
      view.getUint16(position + 32, true)
    if (next > end) throw new DocumentInputError('invalid')
    const name = new TextDecoder().decode(bytes.subarray(position + 46, position + 46 + nameLength))
    if (names.has(name) || /(^[\\/]|^[a-z]:|(^|[\\/])\.\.([\\/]|$)|\0)/i.test(name)) {
      throw new DocumentInputError('invalid')
    }
    names.add(name)
    position = next
  }
  if (position !== end) throw new DocumentInputError('invalid')
}

export async function loadSafeZip(buffer: ArrayBuffer): Promise<JSZip> {
  inspectZipDirectory(new Uint8Array(buffer))
  try {
    return await JSZip.loadAsync(buffer)
  } catch {
    throw new DocumentInputError('invalid')
  }
}

interface EntryStream {
  on(event: 'data', callback: (bytes: Uint8Array) => void): EntryStream
  on(event: 'error' | 'end', callback: () => void): EntryStream
  pause(): EntryStream
  resume(): EntryStream
}

// JSZip documents this browser streaming API but omits it from JSZipObject types.
type StreamingEntry = JSZip.JSZipObject & { internalStream(type: 'uint8array'): EntryStream }

export function readZipEntry(entry: JSZip.JSZipObject, maxBytes: number = INPUT_LIMITS.fileBytes): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const stream = (entry as StreamingEntry).internalStream('uint8array')
    const chunks: Uint8Array[] = []
    let size = 0
    let stopped = false
    stream.on('data', (chunk: Uint8Array) => {
      if (stopped) return
      size += chunk.byteLength
      if (size > maxBytes) {
        stopped = true
        stream.pause()
        chunks.length = 0
        reject(new DocumentInputError('limit'))
      } else chunks.push(chunk)
    })
    stream.on('error', () => {
      stopped = true
      chunks.length = 0
      reject(new DocumentInputError('invalid'))
    })
    stream.on('end', () => {
      if (stopped) return
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      resolve(bytes)
    })
    stream.resume()
  })
}

export async function readZipXml(zip: JSZip, name: string, required = false): Promise<string | undefined> {
  const entry = zip.file(name)
  if (!entry) {
    if (required) throw new DocumentInputError('invalid')
    return undefined
  }
  const bytes = await readZipEntry(entry, INPUT_LIMITS.xmlBytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch { throw new DocumentInputError('invalid') }
}
