# Architecture

## Overview

DocForensics is a React 19 / TypeScript application bundled by Vite 8. It reviews PDF, DOCX, and ODT documents entirely in the browser. Interface locale and document language are separate concerns. The UI supports seven locales; lexical phrase dictionaries currently cover English and Spanish.

## Input pipeline

1. `FileDropzone.tsx` exposes a native keyboard-accessible upload button and drag/drop, with visible processing limits. Loading blocks repeated submissions.
2. `fileIntake.ts` yields supported documents sequentially, including ZIP entries, and bounds the cumulative file count and expanded batch bytes. Completed documents remain available when a later input fails.
3. `safeArchive.ts` checks the ZIP central directory before loading JSZip, rejects unsafe paths, duplicate names, encryption and unsupported archive structures, and bounds actual streamed extraction. `inputLimits.ts` centralizes the resource limits.
4. DOCX and ODT analyzers require their format declarations, main document XML and expected root element. `documentXml.ts` validates XML, rejects DTD/entity declarations and excessive nesting, preserves ordered text, handles structural whitespace, and excludes deleted Word text. Metadata is treated as untrusted input, with finite numeric values and bounded strings and arrays.
5. `pdfAnalyzer.ts` dynamically loads PDF.js 6, uses a bundled dedicated worker, extracts text without rendering pages or executing document actions, bounds page count, extracted characters and a 30-second worker deadline, and releases the document and worker. XMP values use PDF.js metadata accessors. C2PA detection is an unverified byte-marker observation.
6. `linguisticAnalyzer.ts` computes descriptive statistics and local style distances. Phrase and software matches use Unicode word boundaries.
7. `scoringEngine.ts` creates a conservative review index and evidence observations. Ordinary export software and missing private metadata add no suspicion points. Fewer than 80 words produces the `insufficient` level. The index is not an AI probability or an authorship decision.

## State, persistence and presentation

- `App.tsx` coordinates sequential processing, a synchronous submission guard, in-memory results, persistence warnings and report generation.
- `analysisHistory.ts` validates each stored entry and date, restores valid entries independently, and recomputes historical scores under current rules. It never changes storage while loading. Saving is all-or-nothing; it never prunes session results to fit storage quota.
- `browserStorage.ts` contains browser storage access failures. Locale selection remains usable if storage is unavailable.
- History stores only the first 5,000 extracted characters and does not save the source document. Capacity limits are 100 analyses and 2,000,000 serialized characters.
- `reviewCopy.ts` supplies localized review labels, limitations and actionable error messages. UI panels and exported reports use the same flag localization.
- `reportPdf.ts` loads jsPDF on demand and creates summary and document-detail pages. Insufficient-text documents are explicitly marked and excluded from the mean index.
- Expandable panels expose their state to assistive technology; focus states and reduced-motion preferences are supported.

## Delivery and verification

- `npm test` runs TypeScript source regressions through `tsx` and Node's test runner.
- `npm run build` type-checks the application and creates `dist/`.
- `npm run test:e2e` builds the app and runs Playwright against the production preview in desktop and mobile Chromium configurations, using fictitious local documents.
- `vite-plugin-pwa` 2 generates the manifest, precache and service worker for `/`.
- `scripts/verify-pages.mjs` validates the published HTTPS endpoint and the redirect configured by an administrator in Pages settings. It uses no administrative workflow credential.
- The production build injects a CSP restricting scripts, workers, and connections to the hosting origin. Inline styles are allowed for React styles and generated visualizations; inline scripts and external frames are blocked.

## Boundaries

There is no server-side document processing. Resource limits reduce accidental and hostile expansion but are not a complete sandbox against every adversarial PDF or XML parser workload. Browser history is not encrypted or isolated from other applications on the same origin. The review heuristics have no validated authorship accuracy guarantee. See `SECURITY.md` for the threat model.
