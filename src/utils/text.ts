export function tokenizeWords(text: string): string[] {
  return text.normalize('NFC').match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’·-][\p{L}\p{M}\p{N}]+)*/gu) ?? []
}
