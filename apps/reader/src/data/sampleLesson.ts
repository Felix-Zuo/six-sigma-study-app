export type TermEntry = {
  term: string;
  translation: string;
  partOfSpeech?: string;
  explanation: string;
  examples: string[];
  isSixSigmaTerm?: boolean;
};

export type ParagraphPair = {
  id: string;
  page: number;
  en: string;
  zh: string;
};

export type Lesson = {
  id: string;
  title: {
    en: string;
    zh: string;
  };
  chapter: number;
  paragraphs: ParagraphPair[];
  terms: Record<string, TermEntry>;
};

export const sampleLesson: Lesson = {
  id: "ch01-sample",
  chapter: 1,
  title: {
    en: "Chapter 1: What is Six Sigma?",
    zh: "第一章：什么是六西格玛？"
  },
  paragraphs: [
    {
      id: "ch01-p001",
      page: 6,
      en: "Six Sigma, or 6σ, is both a methodology for process improvement and a statistical concept that seeks to define the variation inherent in any process.",
      zh: "六西格玛（Six Sigma，或 6σ）既是一套流程改进方法，也是一种用于描述流程固有变异的统计概念。"
    },
    {
      id: "ch01-p002",
      page: 6,
      en: "The overarching premise of Six Sigma is that variation in a process leads to opportunities for error.",
      zh: "六西格玛的基本前提是：流程中的变异会带来出错机会。"
    },
    {
      id: "ch01-p003",
      page: 6,
      en: "By working to reduce variation and opportunities for error, the Six Sigma method ultimately reduces process costs and increases customer satisfaction.",
      zh: "通过减少变异和出错机会，六西格玛方法最终能够降低流程成本并提升客户满意度。"
    }
  ],
  terms: {
    "six": {
      term: "Six Sigma",
      translation: "六西格玛",
      explanation: "一套以数据为基础的流程改进方法，也是一种统计质量目标；核心是减少变异、缺陷和返工。",
      examples: ["Six Sigma reduces variation in a process."],
      isSixSigmaTerm: true
    },
    "sigma": {
      term: "Sigma",
      translation: "西格玛",
      explanation: "统计学中常用来表示标准差。六西格玛语境中常用于描述过程波动水平和缺陷概率。",
      examples: ["Sigma level is a way to describe process performance."],
      isSixSigmaTerm: true
    },
    "methodology": {
      term: "methodology",
      translation: "方法论",
      partOfSpeech: "noun",
      explanation: "一套有结构、有步骤的方法体系，不只是单个工具。",
      examples: ["DMAIC is a Six Sigma methodology."]
    },
    "process": {
      term: "process",
      translation: "流程",
      partOfSpeech: "noun",
      explanation: "把输入转化为输出的一系列活动。六西格玛通常围绕流程测量、分析和改进。",
      examples: ["A process can be measured and improved."],
      isSixSigmaTerm: true
    },
    "variation": {
      term: "variation",
      translation: "变异；波动",
      partOfSpeech: "noun",
      explanation: "流程输出中的差异。六西格玛认为变异越大，缺陷和返工风险通常越高。",
      examples: ["Reducing variation improves quality."],
      isSixSigmaTerm: true
    },
    "defect": {
      term: "defect",
      translation: "缺陷",
      partOfSpeech: "noun",
      explanation: "未满足客户需求或规格要求的输出。",
      examples: ["A defect is a failure to meet a requirement."],
      isSixSigmaTerm: true
    }
  }
};

