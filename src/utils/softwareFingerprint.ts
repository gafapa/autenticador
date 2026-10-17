const AI_SOFTWARE = [
  'chatgpt', 'openai', 'gpt', 'claude', 'anthropic', 'gemini', 'copilot',
  'bard', 'llama', 'mistral', 'perplexity', 'writesonic', 'jasper',
  'copy.ai', 'rytr', 'quillbot', 'wordtune',
]

export function findAiSoftware(value: string): string | undefined {
  return AI_SOFTWARE.find((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(value)
  })
}
