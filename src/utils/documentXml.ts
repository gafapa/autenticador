import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { DocumentInputError, INPUT_LIMITS } from './inputLimits'

export function parseNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  if (!/^\d+(?:\.\d+)?$/.test(String(value))) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number <= Number.MAX_SAFE_INTEGER ? number : undefined
}

export function validateDocumentXml(xml: string): void {
  if (xml.length > INPUT_LIMITS.xmlBytes || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new DocumentInputError('invalid')
  }
  let depth = 0
  for (const match of xml.matchAll(/<\/?[^>]+>/g)) {
    const token = match[0]
    if (/^<[!?]/.test(token)) continue
    if (token.startsWith('</')) depth--
    else if (!token.endsWith('/>')) depth++
    if (depth > 128) throw new DocumentInputError('limit')
  }
  if (XMLValidator.validate(xml) !== true) throw new DocumentInputError('invalid')
}

export function parseDocumentXml(xml: string): Record<string, any> {
  validateDocumentXml(xml)
  return new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text',
    parseAttributeValue: false, parseTagValue: false, htmlEntities: true,
  }).parse(xml)
}

export function extractParagraphs(xml: string, format: 'docx' | 'odt'): string[] {
  validateDocumentXml(xml)
  const nodes = new XMLParser({
    preserveOrder: true, ignoreAttributes: false, parseTagValue: false,
    trimValues: false, parseAttributeValue: false, htmlEntities: true,
  }).parse(xml)
  const paragraphs: string[] = []
  let length = 0
  const collect = (children: any[], inText = false): string => children.map((node) => {
    const tag = Object.keys(node).find((key) => key !== ':@')
    if (!tag) return ''
    if (tag === '#text') return inText || format === 'odt' ? String(node[tag]) : ''
    if (tag === 'w:del' || tag === 'text:tracked-changes') return ''
    if (['w:tab', 'w:br', 'w:cr', 'text:tab'].includes(tag)) return ' '
    if (tag === 'text:line-break') return '\n'
    if (tag === 'text:s') {
      const count = Number(node[':@']?.['@_text:c'] ?? 1)
      if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
        throw new DocumentInputError('limit')
      }
      // Whitespace is normalized for analysis, so repeated spaces need no allocation.
      return ' '
    }
    return Array.isArray(node[tag]) ? collect(node[tag], inText || tag === 'w:t') : ''
  }).join('')
  const visit = (children: any[]) => {
    for (const node of children) {
      for (const [tag, value] of Object.entries(node)) {
        if (!Array.isArray(value) || tag === 'w:del' || tag === 'text:tracked-changes') continue
        if (tag === 'w:p' && format === 'docx' || ['text:p', 'text:h'].includes(tag) && format === 'odt') {
          const text = collect(value).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()
          length += text.length
          if (length > INPUT_LIMITS.textCharacters) throw new DocumentInputError('limit')
          if (text) paragraphs.push(text)
        } else visit(value)
      }
    }
  }
  visit(nodes)
  return paragraphs
}
