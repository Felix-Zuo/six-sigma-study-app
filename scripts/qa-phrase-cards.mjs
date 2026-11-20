import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../apps/reader/src/lib/phraseCards.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("module", "exports", compiled)(module, module.exports);
const { findPhraseCardRanges: ranges, findPhraseCardAtRange: at } = module.exports;
const card = (term, sourceSentence, extra = {}) => ({ term, meaningZh: "示例释义", ...(sourceSentence ? { sourceSentence } : {}), ...extra });

const sentence = "I’ll get on with it after lunch.";
const text = `${sentence} I get on with it at weekends.`;
let result = ranges(text, [card("get on with it", sentence), card("I'll get on with it", sentence)]);
assert.equal(result.length, 1);
assert.equal(result[0].text, "I’ll get on with it", "Longer anchored contractions must win over nested expressions");
assert.equal(result[0].contextMatched, true);
assert.equal(text.slice(result[0].start, result[0].end), result[0].text);
const selected = text.indexOf("with");
assert.equal(at(result, selected, selected + 4), result[0]);
assert.equal(at(result, text.lastIndexOf("with"), text.lastIndexOf("with") + 4), undefined, "A later occurrence must not inherit the first sentence's card");
assert.equal(at(result, -1), undefined);
assert.equal(at(result, 0, result[0].end + 1), undefined);
assert.equal(at(result, 0.2), undefined);

for (const boundary of [". ", "! ", "? ", "\n", "; ", ", "]) {
  assert.equal(ranges(`Please give${boundary}up now.`, [card("give up")]).length, 0, `Phrase crossed boundary ${JSON.stringify(boundary)}`);
}
assert.equal(ranges("We prepare a setup.", [card("up")]).length, 0, "Substring must not be a word match");
assert.equal(ranges("We give up today.", [card("give up", "We give up tomorrow.")]).length, 0);
assert.equal(ranges("We give up today.", [card("give up", "We give up today."), card("We give up", "We give up tomorrow.")])[0].text, "give up", "An inapplicable longer card must not hide a valid shorter one");
assert.equal(ranges("One two three four five six seven.", [card("one two three four five six")])[0].text, "One two three four five six");
assert.equal(ranges("One two three four five six seven.", [card("one two three four five six seven")]).length, 0);
assert.equal(ranges("I’m ready.", [card("I'm", "I'm ready.")])[0].contextMatched, true);
assert.equal(ranges("Dr. Lee won't give up.", [card("give up", "Dr. Lee won't give up.")])[0].text, "give up");
assert.equal(ranges("U.S. teams keep up.", [card("U.S. teams", "U.S. teams keep up.")])[0].text, "U.S. teams");
result = ranges("We give up. They give up.", [card("give up")]);
assert.equal(result.length, 2);
assert.ok(result.every((item) => !item.contextMatched), "Unanchored legacy entries must never claim sentence context");
assert.equal(at(result, result[1].start), result[1]);
assert.equal(ranges("We give up.", [card("give up", "  WE   give up.  ")]).length, 1);
const dialogue = 'Jess: “Sorry, you cut out for a second.”\n2. I’ll get  on with it.\nThe studio cut out the noise.';
result = ranges(dialogue, [card("cut out", "Sorry, you cut out for a second."), card("I'll get on with it", "I'll get on with it.")]);
assert.equal(result.length, 2, "Speaker/number/quote wrappers must not hide exact anchored source text");
assert.equal(result[0].text, "cut out");
assert.equal(result[1].text, "I’ll get  on with it");
assert.equal(at(result, dialogue.lastIndexOf("cut out")), undefined, "The unrelated later context borrowed a card");
assert.equal(ranges("We undo it today.", [card("it", "do it today.")]).length, 0, "Anchor must not start inside another word");
assert.equal(ranges("Wait. Give up now.", [card("give up", "Wait. Give up now.")]).length, 1, "An anchor may include extra surrounding sentences");
assert.equal(ranges("Give. Up now.", [card("give up", "Give. Up now.")]).length, 0, "A multi-sentence anchor must not permit a cross-sentence expression");
for (const [text, term, anchor] of [
  ["The sign said 'Step inside. Everyone is welcome!'", "step inside", "Step inside."],
  ["I asked, 'Does it fold flat for storage?'", "fold flat", "Does it fold flat for storage?"],
  ["She asked, ‘Would you like to stick around?’", "stick around", "Would you like to stick around?"]
]) assert.equal(ranges(text, [card(term, anchor)]).length, 1, "Quotation wrappers blocked a complete source anchor");
assert.equal(ranges("I can't speak today.", [card("speak", "t speak today.")]).length, 0, "An anchor may not start inside a contraction");
console.log("PASS: exact occurrence, anchored context, contractions/initialisms, longest applicable nested card, 1–6 word limits, sentence/punctuation boundaries, stable UTF-16 ranges, legacy context guard.");
