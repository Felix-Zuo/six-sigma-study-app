# Technical Research

## Platform Options

### PWA First

Source: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps

MDN describes PWAs as web apps that can run cross-platform from one codebase, be installed on device, work offline, and feel app-like. This fits the first product milestone because the reader can be tested immediately on a phone without app-store packaging.

Decision: use PWA first.

### Capacitor Native Wrapper

Source: https://capacitorjs.com/

Capacitor supports building native Android, iOS, and PWA apps from web technology. This is a good second-stage path after the reader UX and content pipeline stabilize.

Decision: plan for Capacitor packaging later; do not start with native packaging.

### Expo / React Native

Source: https://docs.expo.dev/guides/local-first/

Expo is strong for native-first mobile work and has SQLite support for local-first persistence. The downside for this product is inline clickable rich text and precise document-reader layout: web spans are simpler and more controllable for MVP.

Decision: keep Expo as an alternative if the PWA/Capacitor route fails for packaging or offline storage.

## Local Storage

### Browser/PWA Phase

Use IndexedDB for:

- vocabulary book
- lookup history
- review status
- reading position

### Native Wrapper Phase

Use SQLite through Capacitor community plugins or a thin native bridge if IndexedDB proves insufficient.

SQLite FTS5 is relevant for full-text search over lessons and saved notes. Source: https://sqlite.org/fts5.html

## Dictionary And Terminology

Lookup order:

1. exact Six Sigma phrase dictionary
2. exact Six Sigma single-term dictionary
3. local English dictionary
4. simple morphology fallback
5. optional AI contextual explanation

The first two layers must be curated because generic dictionaries do not explain terms like DMAIC, CTQ, DPMO, control chart, or voice of the customer in the way a Six Sigma learner needs.

## Content Packaging

Recommended format:

- JSON for chapter/paragraph bilingual text
- WebP/AVIF or compressed PNG/JPEG for figures
- stable IDs for pages, chapters, paragraphs, assets, and term occurrences
- no raw DOCX/PDF committed to Git

## Initial Stack

- React + TypeScript
- Vite
- PWA-ready structure
- later Capacitor wrapper
- generated JSON content package

