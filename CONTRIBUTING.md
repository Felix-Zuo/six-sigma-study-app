# Contributing

This is a portfolio-grade, non-commercial learning app. Contributions are welcome when they preserve the rights boundary and keep the reader useful for long-term study.

## Before Opening a Change

1. Do not commit raw PDF/DOCX textbooks, keystores, environment files, or private study data.
2. Keep new textbook imports under the Agent import contract in [docs/agent-import.md](docs/agent-import.md).
3. Confirm source rights and non-commercial constraints before adding any book to the runtime catalog.
4. Keep learning data scoped by `bookId`.
5. Run the relevant validation commands.

## Validation

Minimum local checks for normal changes:

```powershell
npm run lint:content
npm run lint:books
npm run typecheck
npm run build
```

For release or content-pipeline changes, also run:

```powershell
npm run qa:source-coverage
npm run qa:book-import
npm run android:release-apk
npm run android:aab
```

## Issue Quality

Issues should be bounded and closeable. Include:

- problem statement
- affected area
- acceptance criteria
- validation command or manual check

## Content Policy

New books must include source, rights status, license notice, and human review notes. Unknown-rights material must stay out of the public repo.
