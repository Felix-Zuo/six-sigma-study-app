import fs from "node:fs";

const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");
const context = fs.readFileSync("apps/reader/src/lib/contextLookup.ts", "utf8");
const tts = fs.readFileSync("apps/reader/src/lib/nativeTts.ts", "utf8");
const nativeTts = fs.readFileSync("android/app/src/main/java/com/findjob/sixsigmastudy/NativeTextToSpeechPlugin.java", "utf8");
const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const dictionary = JSON.parse(fs.readFileSync("apps/reader/src/generated/six-sigma-terms.json", "utf8"));

const byTerm = new Map(dictionary.map((entry) => [entry.term.toLowerCase(), entry]));
const distinguish = byTerm.get("distinguish");
const constant = byTerm.get("constant");
const equation = byTerm.get("equation");

const checks = [
  ["regression words available", Boolean(distinguish && constant && equation)],
  ["phonetic notation", [distinguish, constant, equation].every((entry) => entry?.phonetic?.length > 3)],
  ["rich semicolon senses", constant?.translation.includes("；") && equation?.translation.includes("；")],
  ["structured lexical fields", [distinguish, constant, equation].every((entry) => entry?.partOfSpeech && entry?.wordRoot && Array.isArray(entry?.wordForms) && entry?.englishDefinition)],
  ["context regression rules", context.includes('distinguish: [') && context.includes('constant: [') && context.includes('equation: [')],
  ["correct context meanings", context.includes('meaning: "区分；辨别"') && context.includes('meaning: "持续不变的；恒定的"') && context.includes('meaning: "方程式；计算公式"')],
  ["aligned example translation", app.includes("contextGlosses") && context.includes("selectAlignedSentence")],
  ["dictionary before context", app.indexOf('aria-label="词典释义"') < app.indexOf('className="contextMeaningCard"')],
  ["saved dictionary metadata", ["partOfSpeech", "phonetic", "wordRoot", "wordForms", "englishDefinition"].every((field) => app.includes(`${field}: activeLookup.entry.${field}`))],
  ["native Android TTS", nativeTts.includes("TextToSpeech") && nativeTts.includes("setLanguage") && nativeTts.includes("setSpeechRate")],
  ["Android TTS discovery", manifest.includes("android.intent.action.TTS_SERVICE")],
  ["web speech fallback", tts.includes("speechSynthesis") && tts.includes('Capacitor.getPlatform() === "android"')],
  ["accessible pronunciation", app.includes("播放 ${activeLookup.query} 的英语发音") && app.includes("<Volume2")]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checks: checks.map(([name]) => name),
  samples: {
    distinguish: { phonetic: distinguish.phonetic, translation: distinguish.translation, partOfSpeech: distinguish.partOfSpeech },
    constant: { phonetic: constant.phonetic, translation: constant.translation, partOfSpeech: constant.partOfSpeech },
    equation: { phonetic: equation.phonetic, translation: equation.translation, partOfSpeech: equation.partOfSpeech }
  }
}, null, 2));
