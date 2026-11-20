import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['apps/reader/src/lib/materialClassification.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { classifyMaterial, materialClassificationLabel, materialMatchesFilter, materialSearchText, materialMatchesSearch } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const material = (extra = {}) => ({ id: 'arbitrary-user-id', title: 'Saved lesson', category: 'general', kind: 'article', textEn: '', textZh: '', summary: '', terms: [], ...extra });
const cases = [
  ['legacy exam article inferred from title', { title: '雅思阅读｜判断题' }, 'ielts', 'reading', 'reading:judgment'],
  ['new ID needs no release date', { id: 'brand-new-random-id', category: 'ielts', title: 'Reading: summary completion' }, 'ielts', 'reading', 'reading:completion'],
  ['matching headings', { category: 'ielts', title: 'IELTS Reading — Matching headings' }, 'ielts', 'reading', 'reading:matching'],
  ['short answer', { category: 'ielts', title: '雅思阅读：简答题' }, 'ielts', 'reading', 'reading:completion'],
  ['multiple choice', { category: 'ielts', title: 'IELTS reading: multiple-choice questions' }, 'ielts', 'reading', 'reading:choice'],
  ['Chinese speaking part', { category: 'ielts', title: '雅思口语 第二部分：描述一个地方' }, 'ielts', 'speaking', 'speaking:part2'],
  ['explicit speaking title wins over reading example', { category: 'ielts', title: 'IELTS Speaking Part 1', summary: 'Talking about reading books.', textEn: 'I enjoy reading. True or false?' }, 'ielts', 'speaking', 'speaking:part1'],
  ['semantic old ID fallback', { id: 'ielts-speaking-cities-2027', category: 'ielts', title: '城市与生活', summary: 'Part 3 practice' }, 'ielts', 'speaking', 'speaking:part3'],
  ['interview introduction', { category: 'interview', title: '30秒与60秒自我介绍', textEn: 'What are your strengths? We can practise a STAR answer later.' }, 'interview', 'introduction'],
  ['interview common questions', { category: 'interview', title: 'Common interview questions' }, 'interview', 'questions'],
  ['English Q&A title', { category: 'interview', title: 'Interview Q&A' }, 'interview', 'questions'],
  ['behavioral interview', { category: 'interview', title: 'Behavioral questions: STAR practice' }, 'interview', 'behavior'],
  ['work meeting clarification', { category: 'work', title: '职场口语｜会议里没听清，怎么自然确认？' }, 'work', 'meetings'],
  ['work delivery coordination', { category: 'work', title: '职场口语｜交期变了，怎么跟同事商量？' }, 'work', 'collaboration'],
  ['daily reschedule', { title: '日常口语｜临时改约，怎样开口？' }, 'general', 'conversation'],
  ['unrelated interview is everyday reading', { title: 'An interview with a musician', textEn: 'We discussed IELTS and the job interview.' }, 'general', 'reading'],
  ['explicit work metadata retained', { category: 'work', title: 'Team meeting about an IELTS event' }, 'work', 'meetings'],
  ['unknown IELTS remains reachable', { category: 'ielts', title: 'Study journal' }, 'ielts', 'other'],
  ['old expression retained', { kind: 'expression', title: 'Worth a try' }, 'general', 'expressions'],
  ['old memo retained', { kind: 'memo', title: 'Things to remember' }, 'general', 'notes'],
  ['Chinese-only unknown article retained', { title: '城市里的小花园', textZh: '这是一段中文笔记。' }, 'general', 'reading'],
];
for (const [name, input, direction, section, topic] of cases) {
  const classified = classifyMaterial(material(input));
  assert.equal(classified.direction, direction, name);
  assert.ok(classified.sections.includes(section), `${name}: ${classified.sections}`);
  if (topic) assert.ok(classified.topics.includes(topic), `${name}: ${classified.topics}`);
  assert.ok(materialMatchesFilter(classified, { direction: 'all', section: 'all', topic: 'all' }), `${name}: all materials`);
}
for (const title of ['IELTS Speaking Parts 1–3', '雅思口语 Part 1 / 2 / 3', 'IELTS Speaking Parts 1, 2 and 3']) {
  const classified = classifyMaterial(material({ title }));
  assert.deepEqual(classified.topics, ['speaking:part1', 'speaking:part2', 'speaking:part3'], title);
}
const combined = classifyMaterial(material({ category: 'ielts', title: '雅思阅读：判断题与匹配题' }));
assert.ok(combined.topics.includes('reading:judgment') && combined.topics.includes('reading:matching'));
const search = materialSearchText(material({ title: '雅思口语 Part 1', summary: 'Relaxed conversation', textEn: "I’d like to reschedule.", textZh: '我们能改到明天吗？', terms: [{ term: 'work around', meaningZh: '灵活安排', exampleEn: 'We can work around your schedule.' }] }));
for (const query of ['PART1', 'part 1', '雅思 灵活安排', 'work around', "I’d like", '我们能改到明天', 'relaxed conversation', 'schedule']) assert.ok(materialMatchesSearch(search, query), query);
assert.equal(materialMatchesSearch(search, 'no-result-xyz'), false);
assert.equal(materialMatchesSearch(search, '['), false, 'queries are plain text, not regular expressions');
assert.equal(materialMatchesSearch(search, '   '), true);
assert.match(materialClassificationLabel(combined), /雅思英语.*阅读.*判断题/);
console.log(`Material classification: ${cases.length} classification cases, combined topics, and bilingual / term search passed.`);
