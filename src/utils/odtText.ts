import { extractParagraphs } from './documentXml'

export function extractOdtText(xml: string): string {
  return extractParagraphs(xml, 'odt').join('\n')
}
