# QA Plan

## Product QA

- Open on a phone-width viewport.
- Verify the language toggle is always reachable.
- Toggle English to Chinese and back without losing paragraph position.
- Tap several words in one paragraph.
- Save a term and confirm the vocabulary count changes.
- Reopen the app and confirm saved terms persist once storage is implemented.

## Content QA

- Compare app chapter starts with the 449-page print edition.
- Verify figure placement on high-risk pages.
- Check that terms show technical explanations, not generic translations only.
- Confirm every paragraph has both English and Chinese text.

## Technical QA

- `npm run build`
- `npm run typecheck`
- `npm run lint:content`
- mobile viewport visual check
- no committed raw PDF/DOCX/PNG content

## Release Gate For Chapter 1 MVP

- first chapter readable on phone
- no horizontal overflow
- no broken tap targets
- lookup sheet occupies about half screen
- vocabulary save is persistent
- page labels match print edition

