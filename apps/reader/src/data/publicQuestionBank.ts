import type { QuestionBankPayload } from "../lib/questionBank";

export const publicQuestionBank: QuestionBankPayload = {
  schemaVersion: "1.0.0",
  bankId: "six-sigma-public-sample",
  title: {
    en: "Six Sigma Public Sample Questions",
    zh: "六西格玛公开样例题"
  },
  sourceType: "public-sample",
  questions: [
    {
      questionId: "sample-dmaic-001",
      examId: "public-sample",
      sourceType: "public-sample",
      domain: "Define",
      chapterId: "ch02",
      page: 22,
      difficulty: "easy",
      questionType: "single",
      stem: {
        en: "Which DMAIC phase normally defines the problem statement and project scope?",
        zh: "DMAIC 中通常由哪个阶段定义问题陈述和项目范围？"
      },
      options: [
        { id: "A", en: "Define", zh: "定义" },
        { id: "B", en: "Measure", zh: "测量" },
        { id: "C", en: "Analyze", zh: "分析" },
        { id: "D", en: "Control", zh: "控制" }
      ],
      correctAnswer: ["A"],
      explanation: {
        en: "Define frames the business problem, customer need, goal, scope, and team charter before measurement work begins.",
        zh: "定义阶段先界定业务问题、客户需求、目标、范围和团队章程，然后才进入测量工作。"
      },
      tags: ["DMAIC", "project charter"],
      sourceRef: "Original public sample based on common Six Sigma curriculum terms.",
      reviewStats: { seenCount: 0, correctCount: 0, wrongCount: 0, unknownCount: 0 }
    },
    {
      questionId: "sample-sipoc-002",
      examId: "public-sample",
      sourceType: "public-sample",
      domain: "Define",
      chapterId: "ch02",
      page: 28,
      difficulty: "easy",
      questionType: "single",
      stem: {
        en: "In a SIPOC diagram, the letter O represents which element?",
        zh: "在 SIPOC 图中，字母 O 表示什么要素？"
      },
      options: [
        { id: "A", en: "Operators", zh: "操作员" },
        { id: "B", en: "Outputs", zh: "输出" },
        { id: "C", en: "Opportunities", zh: "机会" },
        { id: "D", en: "Objectives", zh: "目标" }
      ],
      correctAnswer: ["B"],
      explanation: {
        en: "SIPOC stands for Suppliers, Inputs, Process, Outputs, and Customers.",
        zh: "SIPOC 分别代表供应商、输入、过程、输出和客户。"
      },
      tags: ["SIPOC", "process map"],
      sourceRef: "Original public sample.",
      reviewStats: { seenCount: 0, correctCount: 0, wrongCount: 0, unknownCount: 0 }
    },
    {
      questionId: "sample-ctq-003",
      examId: "public-sample",
      sourceType: "public-sample",
      domain: "Define",
      chapterId: "ch03",
      page: 40,
      difficulty: "medium",
      questionType: "single",
      stem: {
        en: "A critical-to-quality characteristic should be traceable to which source?",
        zh: "关键质量特性通常应能追溯到哪类来源？"
      },
      options: [
        { id: "A", en: "Voice of the customer", zh: "客户之声" },
        { id: "B", en: "Internal meeting minutes only", zh: "仅内部会议纪要" },
        { id: "C", en: "Supplier billing codes", zh: "供应商账单代码" },
        { id: "D", en: "Team preference", zh: "团队偏好" }
      ],
      correctAnswer: ["A"],
      explanation: {
        en: "CTQ measures translate customer needs into measurable requirements.",
        zh: "CTQ 指标把客户需求转化为可测量的要求。"
      },
      tags: ["VOC", "CTQ"],
      sourceRef: "Original public sample.",
      reviewStats: { seenCount: 0, correctCount: 0, wrongCount: 0, unknownCount: 0 }
    },
    {
      questionId: "sample-cpk-004",
      examId: "public-sample",
      sourceType: "public-sample",
      domain: "Measure",
      chapterId: "ch14",
      page: 180,
      difficulty: "medium",
      questionType: "single",
      stem: {
        en: "If a process mean moves closer to a specification limit while variation stays the same, what normally happens to Cpk?",
        zh: "如果过程均值靠近规格限而波动不变，Cpk 通常会怎样变化？"
      },
      options: [
        { id: "A", en: "It increases", zh: "增加" },
        { id: "B", en: "It decreases", zh: "降低" },
        { id: "C", en: "It becomes equal to Cp automatically", zh: "自动等于 Cp" },
        { id: "D", en: "It is not affected by centering", zh: "不受居中影响" }
      ],
      correctAnswer: ["B"],
      explanation: {
        en: "Cpk reflects both spread and centering relative to the nearest specification limit.",
        zh: "Cpk 同时反映波动和相对最近规格限的居中程度。"
      },
      tags: ["capability", "Cpk"],
      sourceRef: "Original public sample.",
      reviewStats: { seenCount: 0, correctCount: 0, wrongCount: 0, unknownCount: 0 }
    },
    {
      questionId: "sample-control-chart-005",
      examId: "public-sample",
      sourceType: "public-sample",
      domain: "Control",
      chapterId: "ch26",
      page: 340,
      difficulty: "medium",
      questionType: "single",
      stem: {
        en: "A control chart is mainly used to distinguish common-cause variation from which condition?",
        zh: "控制图主要用于区分普通原因波动和哪种情况？"
      },
      options: [
        { id: "A", en: "Special-cause variation", zh: "特殊原因波动" },
        { id: "B", en: "Customer segmentation", zh: "客户分群" },
        { id: "C", en: "Budget variance", zh: "预算差异" },
        { id: "D", en: "Training completion", zh: "培训完成" }
      ],
      correctAnswer: ["A"],
      explanation: {
        en: "Control charts use center lines and control limits to detect signals of special-cause variation.",
        zh: "控制图通过中心线和控制限识别特殊原因波动信号。"
      },
      tags: ["control chart", "variation"],
      sourceRef: "Original public sample.",
      reviewStats: { seenCount: 0, correctCount: 0, wrongCount: 0, unknownCount: 0 }
    },
    {
      questionId: "sample-lean-006",
      examId: "public-sample",
      sourceType: "public-sample",
      domain: "Improve",
      chapterId: "ch30",
      page: 394,
      difficulty: "easy",
      questionType: "multiple",
      stem: {
        en: "Which items are commonly treated as lean waste categories?",
        zh: "以下哪些通常属于精益浪费类别？"
      },
      options: [
        { id: "A", en: "Waiting", zh: "等待" },
        { id: "B", en: "Overproduction", zh: "过量生产" },
        { id: "C", en: "Customer satisfaction", zh: "客户满意" },
        { id: "D", en: "Rework", zh: "返工" }
      ],
      correctAnswer: ["A", "B", "D"],
      explanation: {
        en: "Waiting, overproduction, and defects/rework are common lean waste categories.",
        zh: "等待、过量生产和缺陷/返工都是常见精益浪费类别。"
      },
      tags: ["lean", "waste"],
      sourceRef: "Original public sample.",
      reviewStats: { seenCount: 0, correctCount: 0, wrongCount: 0, unknownCount: 0 }
    }
  ]
};
