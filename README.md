# DocForensics

[Application](https://autenticador.gallego.top) · [Repository](https://github.com/gafapa/autenticador)

DocForensics reviews document metadata, structure, and writing-style observations locally in the browser. It accepts PDF, DOCX, ODT, and ZIP archives containing those formats. There is no analysis backend and no external AI service.

The review index is a conservative heuristic, not an AI probability, plagiarism detector, authorship determination, or authenticity certification. Metadata can be edited or stripped. Human-authored documents can have any of these observations, and generated text can have none. Do not use the index alone for assessment or disciplinary decisions.

## Features

- English, Spanish, Galician, French, German, Catalan, and Basque interfaces.
- Metadata, paragraph-level style observations, and document export software identification.
- PDF text geometry and unverified C2PA marker observations. A byte marker does not validate a C2PA manifest, signature, or provenance chain.
- DOCX paragraph revision markers and style information.
- Local history and PDF report export, including an explicit insufficient-text state.
- Installable PWA with locally cached application assets.

## Supported inputs and processing limits

- Up to 50 documents per upload, including archive entries.
- Up to 25 MiB per uploaded or extracted file and 100 MiB per batch after extraction.
- ZIP containers: at most 1,000 entries and 100 MiB of declared uncompressed content.
- Document XML: up to 8 MiB per part and 128 nested elements; DTDs and entity declarations are rejected.
- Extracted text: up to 2,000,000 characters per document.
- Metadata: up to 4,096 characters per scalar field, with bounded lists.
- PDF: up to 500 pages and a 30-second extraction deadline. Scanned PDFs without a usable text layer require OCR in another local tool.
- Password-protected documents, encrypted ZIPs, ZIP64, split archives, nested ZIP imports, and binary `.doc` files are unsupported.

ZIP documents are extracted one at a time. Both declared sizes and actual streamed output are checked. ZIP sizes and page counts do not bound every possible parser workload; unusually complex documents can still take substantial time. Split large files before importing them.

## Interpreting results

The index summarizes a small set of observations, such as a very short recorded editing interval, repetitive text, and local style changes. Software named in editable metadata is reported as a metadata observation. Export libraries, converters, absent authors, missing Word revision IDs, font tables, attachments, and OCR-like text layers do not add suspicion points.

Texts shorter than 80 extracted words receive an **insufficient text** state instead of an authenticity assessment. Reports exclude those documents from the mean index. There is no calibrated accuracy claim or validated human/AI threshold. Phrase dictionaries currently cover English and Spanish; changing the interface language does not change the source document's language.

## Privacy and history

Processing and report generation take place on the device. No document uploads, remote fonts, analytics, or external inference requests are used. Installing or updating the app downloads application assets from its hosting origin.

History stores document names, metadata, metrics, and up to 5,000 extracted characters per document in browser `localStorage`. Up to 100 analyses and 2,000,000 serialized characters can be saved. This is persistent local data, not encrypted storage. Other scripts on the same web origin and people with access to the browser profile may be able to read it. Avoid shared browser profiles for sensitive documents and use **Clear history** after use.

If saving fails, session results remain available and the interface warns you to export the PDF report before closing. Existing saved history is retained if a replacement cannot be saved. Malformed history entries are skipped without overwriting the original storage on startup. Old scores are recomputed using the current rules when restored. Only the text preview is retained; the original document is not saved.

## Development

Use Node.js 24 LTS and npm with the committed lockfile:

```bash
npm ci
npm run dev
npm test
npm run build
```

Open the URL printed by Vite. The deployment base path is `/`.

Browser regression tests run against the production bundle:

```bash
npx playwright install chromium
npm run test:e2e
```

The browser suite allocates a free loopback port and uses fictitious fixtures and covers desktop/mobile layouts, PDF and DOCX processing, reports, history, storage failures, localization, offline reload, and production CSP compatibility. Unit regressions cover parsing, scoring, archive bounds, unsafe XML, and history validation.

## Deployment

`npm run build` writes `dist/`. Serve that directory under `/`. The build includes a restrictive Content Security Policy meta tag and a generated service worker. Pushes to `main` run `.github/workflows/pages.yml`: locked installation, dependency audit, type checks, regressions, desktop/mobile browser tests, artifact upload, GitHub Pages deployment, and live HTTPS verification. The deployment job waits for new-domain certificate provisioning and checks the real TLS endpoint and HTTP-to-HTTPS redirect. An administrator enables HTTPS enforcement in the repository Pages settings; verification requires no administrative workflow secret. Pull requests run validation without deployment. Actions are pinned to immutable commits and deployment uses the GitHub OIDC token with limited permissions.

The custom domain is configured in the repository Pages settings, with the DNS CNAME `autenticador.gallego.top` pointing to `gafapa.github.io`. The infrastructure inventory and DNS tooling live in `D:\gallego.top`; no infrastructure credentials belong in this repository or Actions secrets.

Application changes take effect through the PWA update lifecycle; building locally does not publish the site.

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [RULES.md](RULES.md).

## License

MIT
