# Architecture

## Overview

DocForensics is a client-side React application built with Vite and TypeScript. It accepts document uploads, extracts metadata and text in the browser, computes linguistic and fingerprint signals, and renders a forensic score without sending files to a backend.

## Processing flow

1. `src/components/FileDropzone.tsx` accepts supported uploads: `.pdf`, `.docx`, `.odt`.
2. `src/App.tsx` detects the file type and dynamically imports the matching analyzer.
3. Analyzer modules in `src/analyzers/` extract raw text and metadata:
   - `pdfAnalyzer.ts`
   - `docxAnalyzer.ts`
   - `odtAnalyzer.ts`
4. `pdfAnalyzer.ts` also inspects local PDF structure for C2PA markers, embedded files, and suspicious text-layer geometry.
5. `docxAnalyzer.ts` also extracts OOXML paragraph-level RSID and paragraph-style signals.
6. `linguisticAnalyzer.ts` computes text metrics from the extracted content, including segment-level style change detection.
7. `scoringEngine.ts` converts metadata, linguistic metrics, and software fingerprints into a 0-100 score and a list of flags.
8. UI components render score breakdowns, detected evidence, and exportable results.

## Frontend structure

- `src/App.tsx`: orchestration, result state, export flow
- `src/components/`: upload area and analysis panels
- `src/analyzers/`: format-specific extraction and scoring logic
- Paragraph boundaries are preserved where possible so style-shift analysis can work on DOCX and ODT inputs.
- `src/i18n/`: localized copy
- `src/types/analysis.ts`: shared types

## Build and delivery

- Vite 8 handles bundling and dynamic imports.
- Tailwind CSS 4 runs through `@tailwindcss/postcss`.
- `pdfjs-dist` runs through a dedicated worker imported with `?worker`.
- `vite-plugin-pwa` generates the web manifest and service worker.
- The app is configured for GitHub Pages deployment under `/autenticador/`.

## Constraints

- Legacy binary `.doc` files are intentionally unsupported.
- Heuristics are investigative signals, not proof.
- The repository currently has no first-party automated tests.
