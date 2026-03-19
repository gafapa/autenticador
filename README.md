# DocForensics

**Document Authenticity Detector**

[Repository](https://github.com/gafapa/autenticador)

DocForensics is a browser-only web app that analyzes PDF, DOCX, and ODT documents to detect signs of AI-generated content or copy-paste. Files never leave the device.

## Features

- Multilingual UI: Spanish, Galician, and English
- Three analysis layers:
  - Metadata
  - Linguistic signals
  - Software fingerprints
- Segment-level style change detection for pasted or mixed-authorship blocks
- PDF provenance and structure checks, including C2PA manifest detection, embedded files, and suspicious tiny-text layers
- Deeper DOCX OOXML checks, including RSID coverage, RSID diversity, and paragraph style distribution
- Risk score from 0 to 100 with four levels: Low, Moderate, High, Critical
- Rich PDF export of the full session report with color-coded summaries, score breakdowns, and per-document detail
- Persistent local history of analyses restored after a page reload
- Multi-file upload, including ZIP archives expanded locally in the browser
- No backend

## Supported formats

- PDF
- DOCX
- ODT
- ZIP archives containing PDF, DOCX, or ODT files

Legacy binary `.doc` files are not supported.

## Analysis methodology

### Metadata signals

| Signal | Suspicion |
|--------|-----------|
| Editing time under 1 minute for more than 100 words | Critical |
| Editing time under 3 minutes for more than 200 words | High |
| 0-1 revisions | High |
| Creation and modification date almost identical | High |
| Empty or generic author field | Medium |

### Linguistic signals

| Signal | Basis |
|--------|-------|
| Low burstiness | AI often generates more uniform sentence lengths |
| Low type-token ratio | AI tends to reuse vocabulary |
| AI transition phrases | LLMs overuse stock transitions |
| Slop patterns | Repetitive AI-heavy expressions |
| Low Shannon entropy | AI text is often more predictable |
| Low first-person pronoun ratio | AI tends to avoid personal language |
| No interrogative sentences | AI rarely uses rhetorical questions |
| Zero-width characters | Possible watermarking or manipulation |
| Local style shifts between segments | Possible pasted blocks or mixed authorship |

### Software fingerprint signals

| Signal | Suspicion |
|--------|-----------|
| AI tool in creator/producer/generator metadata | Critical |
| Programming library signature | High |
| Missing Word revision IDs in DOCX | Medium |
| Low RSID coverage or diversity in DOCX | Medium |
| Embedded files or suspicious tiny-text layers in PDF | Medium |
| Online converter signature | Medium |
| Many font families in DOCX | Medium |

## Tech stack

- React 19
- Vite 8
- TypeScript 5.9
- Tailwind CSS 4
- `pdfjs-dist`
- `jszip`
- `fast-xml-parser`
- `mammoth`

## Setup

```bash
git clone https://github.com/gafapa/autenticador.git
cd autenticador
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
```

## Disclaimer

This tool provides indicative analysis only and does not constitute definitive proof of AI authorship or plagiarism. No single signal is conclusive; multiple convergent indicators are required.

## License

MIT
