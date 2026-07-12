export type ContextExplanation = {
  meaning: string;
  explanation: string;
  sourceText: string;
  sourceTranslation?: string;
  exampleText: string;
  exampleTranslation?: string;
};

type ContextRule = {
  meaning: string;
  explanation: string;
  when?: RegExp;
};

const rules: Record<string, ContextRule[]> = {
  which: [{ meaning: "哪一个；哪些", explanation: "这里是疑问限定词，用来询问给定对象或选项中的哪一个。" }],
  what: [{ meaning: "什么", explanation: "这里是疑问词，用来询问事物、内容或定义。" }],
  why: [{ meaning: "为什么", explanation: "这里是疑问词，用来询问原因或依据。" }],
  how: [{ meaning: "如何；怎样", explanation: "这里是疑问词，用来询问方法、程度或过程。" }],
  when: [{ meaning: "何时；当……时", explanation: "这里用于询问时间，或引出某个条件发生的时间。" }],
  where: [{ meaning: "哪里；在……的地方", explanation: "这里用于询问位置，或说明某事发生的位置。" }],
  who: [{ meaning: "谁", explanation: "这里是疑问代词，用来询问相关人员或角色。" }],
  the: [{ meaning: "该；这个", explanation: "这里是定冠词，用来特指句中已经明确的对象。" }],
  a: [{ meaning: "一个；某个", explanation: "这里是不定冠词，用来引出一个尚未特指的对象。" }],
  an: [{ meaning: "一个；某个", explanation: "这里是不定冠词，用来引出一个尚未特指的对象。" }],
  scope: [
    {
      meaning: "范围；项目边界",
      explanation: "这里指项目或问题需要覆盖的边界，也就是哪些内容属于本次工作、哪些内容不属于。",
      when: /project|problem|define|statement|charter/i
    }
  ],
  phase: [{ meaning: "阶段", explanation: "这里指 DMAIC 等方法中按顺序推进的一个工作阶段。" }],
  define: [{ meaning: "定义；界定", explanation: "在 DMAIC 语境中，指把问题、目标、客户需求和项目范围说明清楚。" }],
  defines: [{ meaning: "定义；界定", explanation: "这里是动词，表示明确说明问题、范围或要求。" }],
  measure: [{ meaning: "测量", explanation: "在六西格玛语境中，指用一致的方法收集数据并量化流程现状。" }],
  measurement: [{ meaning: "测量", explanation: "指按照规定方法取得数据，是后续分析可信的基础。" }],
  analyze: [{ meaning: "分析", explanation: "在 DMAIC 语境中，指用数据寻找差异、模式和根本原因。" }],
  control: [{ meaning: "控制", explanation: "在 DMAIC 语境中，指通过标准、监控和响应计划维持改进结果。" }],
  statement: [{ meaning: "陈述；说明", explanation: "这里指正式写出的项目问题或目标说明，不是普通的随口表达。" }],
  opportunity: [
    {
      meaning: "出错机会；缺陷机会",
      explanation: "与 defect、error 或 DPMO 同现时，指一次可能产生缺陷的机会。",
      when: /defect|error|dpmo|sigma/i
    }
  ],
  opportunities: [
    {
      meaning: "出错机会；缺陷机会",
      explanation: "与 defect、error 或 DPMO 同现时，指可能产生缺陷的多个机会。",
      when: /defect|error|dpmo|sigma/i
    }
  ],
  yield: [{ meaning: "良率", explanation: "在质量管理语境中，指符合要求的输出占全部输出的比例。" }],
  mean: [
    { meaning: "均值；平均数", explanation: "在统计数据语境中，指所有观测值之和除以观测数量。", when: /data|average|sample|population|standard deviation|distribution/i },
    { meaning: "意味着；表示", explanation: "这里作动词，表示某个结果所代表的含义。" }
  ],
  range: [
    { meaning: "极差", explanation: "在统计语境中，指一组数据最大值与最小值之差。", when: /data|sample|mean|chart|variation/i },
    { meaning: "范围", explanation: "这里指允许、覆盖或讨论的区间。" }
  ],
  population: [{ meaning: "总体", explanation: "在统计学中，指研究对象的完整集合，样本从总体中抽取。" }],
  sample: [{ meaning: "样本", explanation: "在统计学中，指从总体中抽取、用于分析的一部分对象或数据。" }],
  significant: [
    { meaning: "统计显著的", explanation: "在检验语境中，表示观察到的差异不太可能仅由随机波动造成。", when: /hypothesis|p-value|test|confidence|statistic/i }
  ],
  capability: [
    { meaning: "过程能力", explanation: "与 process 或 specification 同现时，指稳定流程满足规格要求的能力。", when: /process|specification|cpk|cp|ppk|pp/i }
  ],
  variation: [{ meaning: "变异；波动", explanation: "指流程输出或执行方式中的差异，是六西格玛重点减少和控制的对象。" }],
  process: [{ meaning: "流程", explanation: "指把输入转化为输出的一系列相互关联的活动。" }],
  defect: [{ meaning: "缺陷", explanation: "指未满足客户、规格或流程要求的输出。" }],
  defects: [{ meaning: "缺陷", explanation: "指未满足客户、规格或流程要求的多个输出或问题。" }],
  distinguish: [
    {
      meaning: "区分；辨别",
      explanation: "这里作动词，表示根据特征识别两类不同原因或状态之间的差别。",
      when: /control chart|common[- ]cause|special[- ]cause|difference|between/i
    },
    { meaning: "区分；辨别", explanation: "这里作动词，表示看出或说明两个对象之间的差别。" }
  ],
  constant: [
    {
      meaning: "持续不变的；恒定的",
      explanation: "这里修饰 target，强调六西格玛是组织持续追求、长期保持的目标，不是数学中的“常数”。",
      when: /constant\s+(target|goal|effort|pressure|change|improvement)/i
    },
    {
      meaning: "常数；恒量",
      explanation: "这里是数学或统计语境中的名词，表示取值保持不变的量。",
      when: /equation|formula|value|coefficient|variable|calculate|mathemat/i
    }
  ],
  equation: [
    {
      meaning: "方程式；计算公式",
      explanation: "这里指用于计算西格玛水平的数学表达式，应理解为“方程式/计算公式”，不是抽象的“相等”。",
      when: /calculate|using|below|formula|sigma|solve/i
    },
    { meaning: "等式；方程式", explanation: "这里指用等号连接数学表达式的等式或方程式。" }
  ]
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function firstMeaning(translation: string): string {
  const first = translation.split(/[；;，,]/)[0]?.trim() || translation.trim() || "待完善";
  return first.replace(/^(?:n|v|vt|vi|adj|adv|pron|prep|conj|art|num|aux|int)\.\s*/i, "").trim() || first;
}

function clippedTranslation(value?: string): string | undefined {
  const clean = value?.replace(/\s+/g, " ").trim();
  if (!clean || !/[\u3400-\u9fff]/.test(clean)) {
    return undefined;
  }
  return clean.length <= 72 ? clean : `${clean.slice(0, 71)}…`;
}

function selectExampleTranslation(value: string | undefined, meaning: string): string | undefined {
  const clean = value?.replace(/\s+/g, " ").trim();
  if (!clean || !/[\u3400-\u9fff]/.test(clean)) {
    return undefined;
  }
  const sentences = clean.match(/[^。！？!?；]+[。！？!?；]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [clean];
  if (sentences.length <= 1) {
    return clean;
  }
  const keywords = meaning
    .replace(/^(?:n|v|vt|vi|adj|adv|pron|prep|conj|art|num|aux|int)\.\s*/i, "")
    .split(/[；;，,、/]/)
    .map((item) => item.replace(/[的了地得]/g, "").trim())
    .filter((item) => item.length >= 2);
  const ranked = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: keywords.reduce((score, keyword) => {
      if (sentence.includes(keyword)) {
        return score + 20 + keyword.length;
      }
      return score + [...keyword].filter((character) => sentence.includes(character)).length;
    }, 0)
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0].score > 0 ? ranked[0].sentence : clean;
}

export function resolveContextExplanation(input: {
  query: string;
  dictionaryTranslation: string;
  partOfSpeech?: string;
  sourceText: string;
  sourceTranslation?: string;
}): ContextExplanation {
  const key = normalize(input.query);
  const candidates = rules[key] ?? [];
  const rule = candidates.find((item) => !item.when || item.when.test(input.sourceText));
  const meaning = rule?.meaning ?? firstMeaning(input.dictionaryTranslation);
  const exampleTranslation = selectExampleTranslation(input.sourceTranslation, meaning);
  const translatedSentence = clippedTranslation(exampleTranslation);
  const explanation =
    rule?.explanation ??
    (translatedSentence
      ? `结合整句译文“${translatedSentence}”，这里的“${input.query}”应理解为“${meaning}”。`
      : `在当前句子的具体语境中，“${input.query}”表示“${meaning}”。`);

  return {
    meaning,
    explanation,
    sourceText: input.sourceText,
    sourceTranslation: input.sourceTranslation,
    exampleText: input.sourceText,
    exampleTranslation
  };
}
