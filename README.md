# DocForensics

**Detector de autenticidade de documentos · Detector de autenticidad de documentos · Document Authenticity Detector**

🔗 **[https://github.com/gafapa/autenticador](https://github.com/gafapa/autenticador)**

---

DocForensics is a web app that analyzes PDF, DOCX, and ODT documents to detect signs of AI-generated content or copy-paste. All analysis runs **100% in the browser** — no file is ever sent to a server.

## Features

- **Multilingual UI**: Spanish 🇪🇸 · Galician 🏴󠁥󠁳󠁧󠁡󠁿 · English 🇬🇧
- **Three-layer forensic analysis**:
  - 📋 **Metadata** — editing time, revisions, creation/modification timestamps, author info
  - 🔤 **Linguistic** — burstiness, lexical richness, Shannon entropy, AI transition phrases, slop patterns, pronoun/question ratio, sentence diversity
  - 🔬 **Software fingerprints** — creator software, Word revision IDs (rsid), track changes, programming libraries, online converters
- **Risk score 0–100** with four levels: Low / Moderate / High / Critical
- **JSON export** of the full analysis report
- **Zero backend** — all processing in WebAssembly + JavaScript

## Analysis methodology

### Metadata signals

| Signal | Suspicion |
|--------|-----------|
| Editing time < 1 min for > 100 words | Critical |
| Editing time < 3 min for > 200 words | High |
| 0–1 revisions (Word save count) | High |
| Creation ≈ modification date (< 1 min) | High |
| Empty or generic author field | Medium |

### Linguistic signals

| Signal | Basis |
|--------|-------|
| Low burstiness (σ sentence length < 7) | AI generates uniformly-lengthed sentences |
| Low TTR (type-token ratio < 40%) | Repetitive vocabulary, typical of AI |
| AI transition phrases ("moreover", "en conclusión"…) | Overused by LLMs |
| Slop patterns ("dive into", "en el mundo actual"…) | 1000× more frequent in AI text (arXiv:2510.15061) |
| Low Shannon entropy (< 4.2 bits/char) | AI text is more predictable |
| Few first-person pronouns (< 0.3%) | AI avoids personal language |
| No interrogative sentences | AI rarely asks rhetorical questions |
| Zero-width characters (U+200B/C/D/FEFF…) | Possible AI watermarks |

### Software fingerprint signals

| Signal | Suspicion |
|--------|-----------|
| AI tool in Creator/Producer/Generator metadata | Critical |
| Programming library (python-docx, pdfmake, LaTeX…) | High — document was code-generated |
| No rsid in DOCX | Medium — not written in Word |
| Online converter (ilovepdf, smallpdf…) | Medium — possible source obfuscation |
| Many different font families | Medium — likely copy-paste from multiple sources |

## Supported formats

- **PDF** — text + XMP/DocInfo metadata via `pdfjs-dist`
- **DOCX / DOC** — content + `core.xml`, `app.xml`, `fontTable.xml` via `jszip` + `fast-xml-parser`
- **ODT** — content + `meta.xml` via `jszip` + `fast-xml-parser`

## Tech stack

- [React 18](https://react.dev/) + [Vite 6](https://vite.dev/) + TypeScript (strict)
- [Tailwind CSS 3](https://tailwindcss.com/)
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF parsing
- [JSZip](https://stuk.github.io/jszip/) — DOCX/ODT unzipping
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) — XML metadata parsing
- [mammoth](https://github.com/mwilliamson/mammoth.js) — DOCX text extraction

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
npm run build   # produces dist/
```

## Disclaimer

This tool provides **indicative analysis only** and does not constitute definitive proof of AI authorship or plagiarism. No single signal is conclusive — convergent evidence across multiple indicators is required. Advanced AI models can evade some linguistic metrics.

## License

MIT
