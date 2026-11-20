import type { PersonalMaterial } from './personalLibrary';

export type MaterialDirection = PersonalMaterial['category'];
export type MaterialFilter = { direction: MaterialDirection | 'all'; section: string; topic: string };
export type MaterialFacet = { id: string; label: string; hint?: string };
export type MaterialClassification = { direction: MaterialDirection; sections: string[]; topics: string[] };

export const materialDirections: (MaterialFacet & { id: MaterialDirection })[] = [
  { id: 'ielts', label: '雅思英语', hint: '阅读 · 口语 · 听力 · 写作' },
  { id: 'interview', label: '求职面试', hint: '自我介绍 · 问答 · 行为题' },
  { id: 'work', label: '职场沟通', hint: '会议 · 协作 · 邮件' },
  { id: 'general', label: '日常学习', hint: '交流 · 阅读 · 表达 · 笔记' },
];

export const materialSections: Record<MaterialDirection, MaterialFacet[]> = {
  ielts: [
    { id: 'reading', label: '阅读' }, { id: 'speaking', label: '口语' },
    { id: 'listening', label: '听力' }, { id: 'writing', label: '写作' }, { id: 'other', label: '综合与其他' },
  ],
  interview: [
    { id: 'introduction', label: '自我介绍' }, { id: 'questions', label: '通用问答' },
    { id: 'behavior', label: '行为与情境题' }, { id: 'other', label: '其他面试' },
  ],
  work: [
    { id: 'meetings', label: '会议沟通' }, { id: 'collaboration', label: '协作跟进' },
    { id: 'writing', label: '邮件与消息' }, { id: 'presentations', label: '汇报表达' }, { id: 'other', label: '其他职场' },
  ],
  general: [
    { id: 'conversation', label: '日常交流' }, { id: 'reading', label: '文章阅读' },
    { id: 'expressions', label: '词句收藏' }, { id: 'notes', label: '学习笔记' },
  ],
};

export const materialTopics: Record<string, MaterialFacet[]> = {
  reading: [
    { id: 'judgment', label: '判断题', hint: 'True / False / Not Given · Yes / No / Not Given' },
    { id: 'completion', label: '填空与简答', hint: 'Completion · Gap fill · Short answer' },
    { id: 'matching', label: '匹配题', hint: 'Headings · Information · Features · Endings' },
    { id: 'choice', label: '选择题', hint: 'Multiple choice' },
    { id: 'other', label: '综合与其他' },
  ],
  speaking: [
    { id: 'part1', label: 'Part 1', hint: '日常短问答' },
    { id: 'part2', label: 'Part 2', hint: '话题陈述' },
    { id: 'part3', label: 'Part 3', hint: '观点讨论' },
    { id: 'other', label: '综合与其他' },
  ],
};

type Rule = readonly [string, RegExp];
const sectionRules: Record<MaterialDirection, Rule[]> = {
  ielts: [['reading', /阅读|\breading\b/], ['speaking', /口语|\bspeaking\b/], ['listening', /听力|\blistening\b/], ['writing', /写作|\bwriting\b/]],
  interview: [
    ['introduction', /自我介绍|介绍自己|\bself[ -]?introduc|\bintroduc(?:e|ing) (?:yourself|myself)\b|\btell me about yourself\b/],
    ['questions', /通用(?:问题|问答)|常见(?:问题|问答)|优势|优缺点|改进点|求职动机|\b(?:common|general|typical) (?:interview )?(?:questions|answers)|\binterview (?:q\s*&\s*a|questions|answers)\b|\bstrengths?\b|\bweakness(?:es)?\b|\bmotivation\b/],
    ['behavior', /行为|情境|\bstar\b|\bbehaviou?ral\b|\bsituational\b|\btell me about a time\b/],
  ],
  work: [
    ['meetings', /会议|开会|\bmeetings?\b|\bclarif(?:y|ication)\b/],
    ['collaboration', /协作|协调|跟进|交期|交付|排期|优先级|进度|\bcollaborat|\bcoordinat|\bfollow[ -]?up\b|\bdeliver(?:y|ies)\b|\bdeadlines?\b|\bpriorit/],
    ['writing', /邮件|消息|书面|\be[ -]?mails?\b|\bmessages?\b|\bcorrespondence\b/],
    ['presentations', /汇报|演示|提案|\bpresentations?\b|\breport(?:ing)?\b|\bproposals?\b/],
  ],
  general: [
    ['conversation', /日常(?:交流|口语|对话)|生活口语|改约|闲聊|\b(?:daily|everyday) (?:conversation|speaking|english)|\bsmall talk\b|\breschedul/],
  ],
};
const readingRules: Rule[] = [
  ['judgment', /判断|\btrue\s*[/,·-]?\s*false\b|\byes\s*[/,·-]?\s*no\b|\bnot given\b|\bt\s*\/\s*f\s*\/\s*ng\b|\by\s*\/\s*n\s*\/\s*ng\b/],
  ['completion', /填空|简答|\bcompletion\b|\bgap[ -]?fill|\bfill(?:ing)?[ -](?:in[ -])?(?:the[ -])?(?:gaps?|blanks?)\b|\bshort[ -]?answer/],
  ['matching', /匹配|配对|段落标题|\bmatching\b|\bmatch (?:the )?(?:headings|information|features|endings)\b/],
  ['choice', /选择题|\bmultiple[ -]?choice\b/],
];

export function normalizeMaterialSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\bpart\s*[-–—]?\s*([123])\b/g, 'part$1').replace(/\s+/g, ' ').trim();
}

function matchingRules(text: string, rules: Rule[]): string[] {
  return rules.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
}

// A clear title takes precedence over incidental examples in the body. Stable
// semantic IDs help old imports; dates and numbered lesson IDs carry no meaning.
function inferSections(material: PersonalMaterial, direction: MaterialDirection): string[] {
  const rules = sectionRules[direction];
  for (const source of [material.title, material.id.replace(/[-_]/g, ' '), material.summary]) {
    const found = matchingRules(normalizeMaterialSearch(source), rules);
    if (found.length) return found;
  }
  if (direction === 'general') return [material.kind === 'expression' ? 'expressions' : material.kind === 'memo' ? 'notes' : 'reading'];
  // Body fallback is deliberately restricted to explicit exam / practice cues.
  const body = normalizeMaterialSearch(`${material.textEn}\n${material.textZh}`);
  if (direction === 'ielts') {
    const found = matchingRules(body, [
      ['reading', /雅思阅读|ielts reading|reading (?:passage|test)|read the (?:passage|text)/],
      ['speaking', /雅思口语|ielts speaking|speaking (?:part|test)|\bpart[123]\b/],
      ['listening', /雅思听力|ielts listening|listening test/],
      ['writing', /雅思写作|ielts writing|writing task [12]/],
    ]);
    if (found.length) return found;
  }
  return ['other'];
}

function speakingParts(text: string): string[] {
  const normalized = normalizeMaterialSearch(text).replace(/\bparts\s*/g, 'part');
  const parts = new Set<string>();
  for (const match of normalized.matchAll(/\bpart\s*([123])\s*[-–—至到]\s*(?:part\s*)?([123])/g)) {
    for (let number = Number(match[1]); number <= Number(match[2]); number++) parts.add(`part${number}`);
  }
  for (const match of normalized.matchAll(/\bpart\s*([123])\b|第?([一二三123])部分/g)) {
    const number = match[1] || ({ 一: '1', 二: '2', 三: '3' }[match[2]] ?? match[2]);
    parts.add(`part${number}`);
  }
  // “Parts 1, 2 and 3” and “Part 1 / 2 / 3” are combined practice too.
  const list = normalized.match(/\bpart\s*[123](?:(?:\s*[,/&、]\s*|\s+and\s+|\s*和\s*)(?:part\s*)?[123])+/g);
  list?.forEach(value => value.match(/[123]/g)?.forEach(number => parts.add(`part${number}`)));
  return [...parts].sort();
}

export function classifyMaterial(material: PersonalMaterial): MaterialClassification {
  let direction = material.category;
  const title = normalizeMaterialSearch(`${material.title} ${material.id.replace(/[-_]/g, ' ')}`);
  // The broad legacy “general” category may contain imported exam/interview lessons.
  // Explicit categories otherwise win, even if an article mentions another field.
  if (direction === 'general') {
    if (/雅思|\bielts\b/.test(title)) direction = 'ielts';
    else if (/求职|面试|\bjob interview\b|\binterview (?:speaking|practice|questions|answers)\b/.test(title)) direction = 'interview';
    else if (/职场|工作沟通|\bworkplace\b|\bbusiness english\b/.test(title)) direction = 'work';
  }
  const sections = inferSections(material, direction);
  const topics: string[] = [];
  if (direction === 'ielts') {
    for (const section of sections.filter(value => value === 'reading' || value === 'speaking')) {
      let found: string[] = [];
      for (const source of [material.title, material.id.replace(/[-_]/g, ' '), material.summary, `${material.textEn}\n${material.textZh}`]) {
        found = section === 'reading' ? matchingRules(normalizeMaterialSearch(source), readingRules) : speakingParts(source);
        if (found.length) break;
      }
      topics.push(...(found.length ? found : ['other']).map(topic => `${section}:${topic}`));
    }
  }
  return { direction, sections, topics };
}

export function materialMatchesFilter(classification: MaterialClassification, filter: MaterialFilter): boolean {
  return (filter.direction === 'all' || classification.direction === filter.direction)
    && (filter.section === 'all' || classification.sections.includes(filter.section))
    && (filter.topic === 'all' || classification.topics.includes(`${filter.section}:${filter.topic}`));
}

export function materialClassificationLabel(classification: MaterialClassification): string {
  const direction = materialDirections.find(option => option.id === classification.direction)?.label ?? '日常学习';
  const section = materialSections[classification.direction].find(option => option.id === classification.sections[0]);
  const topic = materialTopics[classification.sections[0]]?.find(option => classification.topics.includes(`${classification.sections[0]}:${option.id}`));
  return [direction, section?.label, topic?.label].filter(Boolean).join(' · ');
}

export function materialSearchText(material: PersonalMaterial, classification = classifyMaterial(material)): string {
  const sections = materialSections[classification.direction].filter(option => classification.sections.includes(option.id));
  const topics = Object.entries(materialTopics).flatMap(([section, options]) => options.filter(option => classification.topics.includes(`${section}:${option.id}`)));
  return normalizeMaterialSearch([
    material.title, material.summary, material.textEn, material.textZh,
    materialClassificationLabel(classification), classification.direction === 'ielts' ? 'IELTS' : '',
    ...sections.map(option => `${option.label} ${option.id}`), ...topics.map(option => `${option.label} ${option.hint ?? ''}`),
    ...material.terms.map(term => `${term.term} ${term.meaningZh} ${term.exampleEn ?? ''}`),
  ].join(' '));
}

export function materialMatchesSearch(searchText: string, query: string): boolean {
  return normalizeMaterialSearch(query).split(' ').filter(Boolean).every(word => searchText.includes(word));
}
