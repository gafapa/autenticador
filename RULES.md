# Rules

## Language

- Use English for code identifiers, comments, documentation, and commit messages.

## Supported formats

- Accept only `.pdf`, `.docx`, and `.odt`.
- Do not advertise `.doc` support unless a real parser is added.

## Analysis behavior

- Keep file processing local to the browser.
- Treat metadata, linguistic metrics, and software fingerprints as heuristics.
- Avoid broad substring heuristics that can turn legitimate producer strings into false positives.

## Documentation

- Update `README.md` when supported formats or user-facing behavior changes.
- Update `ARCHITECTURE.md` when the processing flow or module boundaries change.
- Keep this file aligned with actual repository conventions.

## Verification

- Run `npm run build` after code changes.
- Run the relevant automated tests if a test suite is added later.
