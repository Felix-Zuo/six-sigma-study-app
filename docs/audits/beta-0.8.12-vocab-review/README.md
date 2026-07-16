# Beta 0.8.12 Vocabulary Review Audit

Date: 2026-07-16

Viewport: 390 x 844 CSS pixels / Android-first mobile layout

## Scope

This audit covers the Vocabulary home, dictionary-meaning retrieval quiz, answer reveal, same-session reinforcement, fixed rating controls, and completion summary. It does not claim to reproduce the private scheduling formula of another product.

## Research Boundary

- The public App Store listing for 不背单词 describes authentic examples, phrase coverage, dictionary data, spelling tests, and intelligent review based on the forgetting curve. It does not publish the exact scheduling formula: <https://apps.apple.com/us/app/%E4%B8%8D%E8%83%8C%E5%8D%95%E8%AF%8D-%E5%9B%9B%E5%85%AD%E7%BA%A7%E8%80%83%E7%A0%94%E7%AD%89%E8%8B%B1%E8%AF%AD%E5%8D%95%E8%AF%8D%E5%AD%A6%E4%B9%A0/id698570469?l=zh-Hans-CN>
- The implemented scheduler uses the maintained TypeScript FSRS package: <https://github.com/open-spaced-repetition/ts-fsrs>
- Target retention is 90%, matching Anki's documented default balance between retention and workload. The UI maps forgotten to `Again`, effortful recall to `Hard`, and confident recall to `Good`: <https://docs.ankiweb.net/deck-options.html#fsrs>

## Before

1. Vocabulary home: [02-vocab-home-before.png](02-vocab-home-before.png)
2. Extra prompt stage with little useful information: [03-review-prompt-before.png](03-review-prompt-before.png)
3. Quiz with answer-revealing distractor differences: [04-review-quiz-before.png](04-review-quiz-before.png)
4. Long, flat answer page with no next-interval feedback: [05-review-answer-before.png](05-review-answer-before.png)

Observed risks:

- A two-step reveal before the real retrieval task added friction.
- Distractors mixed unrelated forms and exposed part-of-speech/length clues.
- Forgotten and fuzzy words left the session instead of being reinforced later in the same session.
- The answer body exposed dictionary, context, lexical details, and AI content at once.
- Scrolling one answer to the bottom could leave the following card at the same internal offset.

## After

1. Daily plan with explicit scheduling policy: [qa/00-vocab-home.png](qa/00-vocab-home.png)
2. Direct, phrase-aware retrieval quiz: [qa/01-direct-retrieval-quiz.png](qa/01-direct-retrieval-quiz.png)
3. Dictionary-first answer, short marked example, fixed interval controls: [qa/01-phrase-dictionary-answer.png](qa/01-phrase-dictionary-answer.png)
4. Short source excerpt after automatic scroll reset: [qa/02-throughout-short-example-ai.png](qa/02-throughout-short-example-ai.png)
5. Same-session reinforcement state: [qa/03-same-session-reinforcement.png](qa/03-same-session-reinforcement.png)
6. Outcome and scheduler summary: [qa/04-session-summary.png](qa/04-session-summary.png)

## Verified Outcomes

- Direct retrieval begins without the obsolete prompt stage.
- A phrase remains one card and is tested against phrase-like distractors.
- Dictionary meaning is the answer key; contextual and AI meanings remain separate evidence.
- `Again`, `Hard`, and `Good` show preview intervals before submission.
- Forgotten/fuzzy cards return at session end; reinforcement does not increment the daily count or add a second FSRS history entry.
- Each new card starts at scroll position zero; the rating dock remains visible after the answer body scrolls.
- Legacy source positions are retained only when the saved text still matches the term.
- No horizontal overflow was observed at 390 x 844.

## Accessibility And Limits

- All review choices are native buttons with visible focus styles and text labels; interval text is supplemental rather than color-only.
- The three ratings remain at least 50 CSS pixels high. Reduced-motion rules remain unchanged.
- Browser screenshots cannot validate pronunciation quality, haptics, TalkBack reading order, or long-term retention. Android release and native interaction checks cover packaging and basic touch behavior; retention quality requires real usage history over time.
