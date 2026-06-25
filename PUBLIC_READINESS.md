# Public Readiness Audit

Audit date: 2026-06-24
Repository: https://github.com/Felix-Zuo/six-sigma-study-app
Local path: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app`

## Conclusion

Current conclusion: public-safe with non-commercial content restrictions documented.

The repository is already public. The current tracked files and Git history do not show raw source PDFs/DOCXs, signing keystores, environment files, or real access tokens. Runtime JSON no longer contains local source paths. The project should remain public only under the non-commercial learning and translation-use boundary documented in `LICENSE`, `NOTICE.md`, and `ATTRIBUTION.md`.

## Audit Commands Run

```powershell
git status --short --branch
git log --oneline --decorate -8
gh repo view Felix-Zuo/six-sigma-study-app --json visibility,url,description,repositoryTopics,isArchived,defaultBranchRef
gh issue list --state all --limit 30
gh run list --branch main --limit 5
git ls-files
git ls-files | Select-String -Pattern '\.(pdf|docx|doc|pptx|xlsx|jks|keystore|p12|pfx|env|pem|key|sqlite|db|zip|7z|rar|png|jpe?g)$'
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!android/.gradle/**' --glob '!android/app/build/**' --glob '!apps/reader/dist/**' --glob '!qa/screenshots/**' "BEGIN (RSA|OPENSSH|PRIVATE)|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9_]{30,}|github_pat_|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|client_secret|private_key|storePassword|keyPassword|password\s*=|token\s*=|secret\s*=" .
git log --all --name-only --pretty=format: | Sort-Object -Unique | Select-String -Pattern '\.(pdf|docx|doc|pptx|xlsx|jks|keystore|p12|pfx|env|pem|key|sqlite|db|zip|7z|rar)$'
git rev-list --objects --all
git check-ignore -v android\keystore.properties android\*.jks *.jks .env
gh api repos/Felix-Zuo/six-sigma-study-app/community/profile
npm run audit:public
npm run lint:books
```

## Findings

| Area | Result | Evidence |
| --- | --- | --- |
| Git status | Clean at baseline | `## main...origin/main` before target-two edits |
| GitHub visibility | Public | `gh repo view` returned `visibility: PUBLIC` |
| Raw source files | No tracked or historical PDF/DOCX source files found | tracked and historical extension scan returned no PDF/DOCX hits |
| Signing secrets | No tracked keystore or signing properties found | `android/keystore.properties` exists locally but is ignored by `android/.gitignore`; root `.gitignore` now also blocks signing artifacts |
| Secret pattern scan | No real credential found | hits were Gradle property field names, placeholder `replace-with-local-secret`, or local JS variable names such as `token` |
| Large history objects | Expected generated JSON only | largest historical objects were `manual.json` and generated dictionary JSON |
| Generated image assets | Tracked intentionally | 470 figure/table/formula PNGs are generated runtime assets derived from the public study manual for non-commercial study fidelity |
| Runtime provenance | Public-safe after this pass | generated JSON uses `sourceId`/`sourceEdition`/`sourceDocument`, not `C:\...`, `enDocx`, `zhDocx`, or `sourcePdf` |
| Agent sample book | Public-safe | `agent-import-sample` is original synthetic content with no third-party textbook material |
| Community profile | Improved in this pass | README, LICENSE, SECURITY, CONTRIBUTING, NOTICE, and attribution files added or updated |

## Content Rights Boundary

The bundled Six Sigma manual-derived content is included based on the CSSC training-materials page, which lists `CSSC Lean Six Sigma Black Belt Certification Training Manual.pdf` as a free PDF download:

- https://www.sixsigmacouncil.org/six-sigma-training-material/

This repository still treats the material conservatively:

- personal study and bilingual translation reference only
- no commercial use
- no paid redistribution
- no official CSSC affiliation or endorsement
- original rights remain with the original rights holder

Future textbook imports must pass the Agent import review gates before being added to the public runtime catalog.

## Automated Public Gate

`npm run audit:public` checks:

- tracked-file denylist for raw PDF/DOCX, signing files, environment files, local build artifacts, and private databases
- runtime JSON under `apps/reader/public/content`, `content/processed`, `content/source`, and `apps/reader/src/generated`
- forbidden runtime provenance tokens: `C:\`, `enDocx`, `zhDocx`, `sourcePdf`

Current result: passed.

## Remaining Public-Surface Fixes

- Update GitHub repository description so it no longer says `Private`.
- Add repository topics that describe the project as a local-first Android bilingual study app and content pipeline.
- Keep Android release signing material outside the repository.
- Keep raw textbook source files in `D:\0A OpenClaw\projects\6sigma\sources` or another private local path.

## Decision

No public-safe replacement repository is required at this time. The current public repository can remain public after the target-two documentation, Agent import contract, validation gates, and README/showcase updates are committed and CI passes.
