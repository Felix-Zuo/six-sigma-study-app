# Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| DOCX extraction loses figure order | High | Validate extracted chapter against rendered PNG pages; keep original figure crops where needed. |
| Full content package is too large | Medium | Use text JSON for body content and compress figures; lazy-load chapter assets. |
| Generic dictionary gives wrong Six Sigma meaning | High | Curated term dictionary has priority over general lookup. |
| Phrase lookup is inaccurate | Medium | Start with curated phrase list; add selection-based lookup before automatic NLP. |
| PWA offline storage differs across browsers | Medium | Keep storage abstraction; test Chrome Android first; plan Capacitor/SQLite later. |
| Raw manual assets accidentally committed | High | `.gitignore` excludes raw/generated large files; commit only schema and samples. |
| Page alignment drifts after content extraction | High | Treat 449-page print edition as canonical; store page in every paragraph/asset. |
| UI becomes cluttered on small phones | Medium | Bottom-sheet interaction and one floating language button only for MVP. |
| Public content rights boundary is misunderstood | High | Document CSSC training-materials source, non-commercial use, original-rights ownership, and no official endorsement in README, NOTICE, ATTRIBUTION, LICENSE, and THIRD_PARTY_NOTICES. |
| Runtime JSON leaks local source paths | High | Use public-safe provenance fields; run `npm run audit:public` in CI to reject `C:\`, `enDocx`, `zhDocx`, and `sourcePdf` tokens in runtime JSON. |
| Android backs up local learning data unexpectedly | Medium | Set `android:allowBackup="false"` so WebView/localStorage vocabulary and notes are not included in system backup by default. |
| Future books bypass rights review | High | Require Agent import request review gates for copyright, TOC, image quality, terminology, and bilingual alignment before catalog inclusion. |
