# Fly View 0.9 — personal English learning

This release connects collecting material, bilingual reading, vocabulary review and a persistent personal assistant. The existing Six Sigma content and private Android question bank remain usable.

## User journeys

- **In-app collection:** paste an article in 助教 → 整理收录. AI classifies and translates the complete last message; the validated result is stored in IndexedDB and appears in 材料. Open it in the existing reader, tap words, save vocabulary and use FSRS review.
- **Generated expressions:** each assistant reply has 收录这段表达. The editor preserves the reply as editable learning material; it is not presented as independently verified biography.
- **No AI connection:** 直接保存原文 works offline. Translation can be added later. Chat drafts survive switching pages and reloads within the session.
- **From the desktop chat:** the assistant prepares the material and uses `scripts/publish-personal-material.mjs`. The learner does not create, export or import JSON. The next foreground/online sync receives the material on the phone.
- **Memory:** explicit, user-managed goals and preferences are available to subsequent AI requests. Suggestions need a click to become active memory. No fixed IELTS score or invented career achievement is seeded in public assets.
- **Updates:** startup checks the release manifest. 我的 → 在线更新 downloads a private APK, verifies its hash, size, package, signer and higher version, then opens Android's installer. The system confirmation remains necessary. Background push while the app is closed is not implemented in 0.9.

## Data boundaries

Personal materials, chats and memories use IndexedDB. Existing vocabulary/progress retain their compatible storage format with visible write-error handling. A full backup includes both stores and conflict snapshots but excludes connection/API credentials. Android backup uses the system document picker.

Only personal materials synchronize automatically. Vocabulary, notes, chat messages and memories can be included in the explicit full local backup; this release does not claim full multi-device study-state sync. Conflicts preserve both versions and can be resolved by keeping both as separate materials.

The cloud API and APK are protected with a personal bearer credential. Android stores the connection with Keystore-backed AES-GCM. Browser pairing lasts only for the session. Public source, release metadata and the web bundle contain no personal token, resume or private question bank. DeepSeek remains the existing user-owned-key connection, with request size, output validation and timeout controls.

## Open-source choices

- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), MIT: keyboard focus, escape/overlay handling and modal semantics for material editing.
- [Motion for React](https://motion.dev/docs/react), MIT: restrained message entry transitions, respecting reduced motion.
- [Lucide](https://lucide.dev/), ISC: consistent icons.
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), MIT: retained the existing vocabulary scheduling rather than replacing it with model-generated intervals.
- [Capacitor](https://capacitorjs.com/), MIT: retained the Android bridge and upgraded vulnerable dependencies within the existing major version.

Capawesome's store-update model was reviewed but not used: this release needs signed, privately distributed APK updates rather than a Google Play listing. The custom native module has narrowly bounded download/install capabilities and separate pure-Java validation tests.

## Verification commands

```text
npm run typecheck
npm run build
node tests/personal-library.test.mjs
node tests/personal-sync.test.mjs
node scripts/qa-study-chat.mjs
node scripts/qa-personal-api.mjs
node scripts/qa-app-updates.mjs
npm run lint:content
npm run lint:books
npm run qa:context-corrections
npm run audit:public
npm run qa:public-artifact
npm audit
npm run android:release-apk
```

Read `personal-sync.md` for server and publication contracts. Credentials belong outside this repository. Do not upload the signed private APK to a public GitHub release or public object storage.

## Release verification — 2026-11-16

- Type check, production build, content/book validation, public artifact isolation and dependency audit passed.
- Personal storage (20), sync (10), Service Worker navigation (6), assistant/API contracts and update validation passed.
- The complete browser learning flow passed at 390 × 844 and 1440 × 1000; textbook reader also passed 320/360 px checks. No JavaScript errors or page-level horizontal overflow were observed. Six existing browser regression suites passed, including 13 maturity checks.
- Android emulator upgrade from 0.8.15 to 0.9.0-beta preserved the hashes of all six existing learning-storage entries and the 1000-question private package. The system backup picker was tested through both successful save and cancellation. Native update validation rejected untrusted addresses and unpaired downloads. The integer bridge regression is fixed and covered by 10 JVM checks plus a real native call.
- Signed APK: 41,832,129 bytes; SHA-256 `9bc6adc1c6eeb9058267c0b19b94f2ca06f2f4930ce03e4c6fcbfd4bd19df3b6`. Private upload was read back and verified byte-for-byte.
- Paid model responses were mocked for repeatable UI QA. No physical phone was attached, and installation of a future, higher-version release cannot be claimed from same-version tests.
- Production is deployed at `https://fly-view-personal.vercel.app`. Release metadata, native-origin preflight, authenticated material read/write and the full 41.8 MB protected APK response passed live checks. The downloaded bytes matched the signed APK above. Unauthenticated material and download requests returned 401.
- The Android application paired through its normal UI and received a desktop-published material through the production API (revision/baseRevision 1, clean local state); no JSON import was used.
- The native downloader fetched all 41,832,129 authenticated bytes and reached verification. A deliberately mismatched expected version (901 vs the actual signed APK 900) was correctly rejected with `ready=false`. Both Chinese and English material views rendered on Android. This verifies download/validation, not installation of an unavailable future release.
