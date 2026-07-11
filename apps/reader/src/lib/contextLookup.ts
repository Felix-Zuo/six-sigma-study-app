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
  defects: [{ meaning: "缺陷", explanation: "指未满足客户、规格或流程要求的多个输出或问题。" }]
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function firstMeaning(translation: string): string {
  return translation.split(/[；;，,]/)[0]?.trim() || translation.trim() || "待完善";
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
  const explanation =
    rule?.explanation ??
    `本句中“${input.query}”作${input.partOfSpeech ? ` ${input.partOfSpeech} ` : "词语"}使用，结合上下文应理解为“${meaning}”。`;

  return {
    meaning,
    explanation,
    sourceText: input.sourceText,
    sourceTranslation: input.sourceTranslation,
    exampleText: input.sourceText,
    exampleTranslation: input.sourceTranslation
  };
}
