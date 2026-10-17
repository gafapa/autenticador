# Security and privacy

## Threat model

Uploaded documents, ZIP directories, XML parts, metadata fields, and browser history are untrusted. The application is a static browser tool with no document upload endpoint or external AI processing. A successful local production build is not a security certification or proof of a deployed update.

## Implemented controls

- Input size, entry count, expanded batch, XML nesting, extracted text, and PDF page limits.
- Sequential ZIP extraction with central-directory inspection and actual streamed-output limits.
- Rejection of archive traversal paths, duplicate entries, encrypted archives, ZIP64 and split archives.
- XML validation and rejection of DTDs and entity declarations before parsing.
- Ordered document text extraction, finite nonnegative metadata numbers, and required document roots and format declarations.
- Dedicated PDF workers with a 30-second extraction deadline, released after analysis; the application does not render or invoke PDF document actions.
- Production CSP with same-origin scripts, workers and connections, no external frames, and no inline scripts.
- React text rendering rather than uploaded HTML insertion.
- Defensive history validation and exception-safe local storage access. Failed persistence retains session results and reports the failure.
- Unicode-boundary software matching and descriptive results that do not assert AI authorship or plagiarism.
- Committed npm lockfile and unit/browser regression tests.

## Remaining boundaries

- Parser complexity can exceed what compressed size and page limits predict. Treat documents from hostile sources cautiously; close the tab if a parser stalls. The app is not a malware scanner or a complete document sandbox.
- The history contains filenames, metadata, metrics and a text preview. It is stored unencrypted in `localStorage`, accessible within the hosting origin and browser profile. Clearing the history removes the app's storage key; it is not forensic secure erasure of the device or browser backups.
- Service workers cache application assets. They do not cache imported files or downloaded reports through application code.
- Multiple tabs share the history key. Prefer a single analysis tab; export important results before concurrent use or clearing history in another tab.
- PDF C2PA byte markers are not verified manifests, cryptographic signatures or provenance validation.
- No calibrated false-positive rate or validated AI/human classification accuracy is claimed. Use document observations as prompts for human review only.
- Dependency audit results describe known advisories at the time of the check, not the absence of unknown vulnerabilities.

## Local verification

```bash
npm ci
npm audit
npm test
npm run test:e2e
```

Use fictitious fixtures for diagnostics. Do not send documents, student data, extracted text, or browser history to external debugging or AI services.
