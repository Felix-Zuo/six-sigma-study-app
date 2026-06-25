from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKSPACE_ROOT = DEFAULT_REPO_ROOT.parent
DEFAULT_EN_DOCX = DEFAULT_WORKSPACE_ROOT / "sources" / "manual_en_aligned.docx"
DEFAULT_ZH_DOCX = DEFAULT_WORKSPACE_ROOT / "sources" / "manual_zh_aligned.docx"


@dataclass(frozen=True)
class SectionDef:
    section_id: str
    en_title: str
    zh_title: str
    page: int
    level: int


SECTION_DEFS: list[SectionDef] = [
    SectionDef("ch01-overview", "Chapter 1: What is Six Sigma?", "第一章：什么是六西格玛？", 6, 1),
    SectionDef("data-driven-processes", "Data Driven Processes and Decisions", "数据驱动的流程与决策", 6, 2),
    SectionDef("decision-without-six-sigma", "Decision Making Without Six Sigma", "没有六西格玛时的决策", 6, 3),
    SectionDef("decision-with-six-sigma", "Decision Making With Six Sigma", "使用六西格玛时的决策", 6, 3),
    SectionDef("defining-6-sigma", "Defining 6σ", "定义 6σ", 7, 2),
    SectionDef("real-world-examples", "Real World Examples", "现实案例", 7, 3),
    SectionDef("calculating-sigma-level", "Calculating Sigma Level", "计算西格玛水平", 8, 2),
    SectionDef("sigma-level-not-final", "Sigma Level Is Not a Final Indicator", "西格玛水平不是最终指标", 9, 2),
    SectionDef("common-six-sigma-principles", "Common Six Sigma Principles", "常见六西格玛原则", 10, 2),
    SectionDef("customer-focused-improvement", "Customer-Focused Improvement", "以客户为中心的改进", 10, 3),
    SectionDef("value-streams", "Value Streams", "价值流", 10, 3),
    SectionDef("continuous-process-improvement", "Continuous Process Improvement", "持续流程改进", 11, 3),
    SectionDef("variation", "Variation", "变异", 11, 3),
    SectionDef("removing-waste", "Removing Waste", "消除浪费", 11, 3),
    SectionDef("equipping-people", "Equipping People", "赋能人员", 11, 3),
    SectionDef("controlling-the-process", "Controlling the Process", "控制流程", 11, 3),
    SectionDef("challenges-of-six-sigma", "Challenges of Six Sigma", "六西格玛的挑战", 12, 2),
    SectionDef("lack-of-support", "Lack of Support", "缺乏支持", 12, 3),
    SectionDef("lack-of-resources", "Lack of Resources or Knowledge", "缺乏资源或知识", 13, 3),
    SectionDef("poor-project-execution", "Poor Project Execution", "项目执行不佳", 13, 3),
    SectionDef("data-access-issues", "Data Access Issues", "数据访问问题", 13, 3),
    SectionDef(
        "industry-concerns",
        "Concerns about Using Six Sigma in a Specific Industry",
        "对特定行业使用六西格玛的顾虑",
        13,
        3,
    ),
    SectionDef("chapter-sources", "Chapter Sources", "本章资料来源", 13, 2),
]


CURATED_TERMS: list[dict[str, Any]] = [
    {
        "term": "Six Sigma",
        "translation": "六西格玛",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["six", "six sigma", "6σ"],
        "explanation": "一套以数据为基础的流程改进方法，也是一种统计质量目标；核心是减少变异、缺陷、返工和客户不满意。",
    },
    {
        "term": "CSSC",
        "translation": "六西格玛认证委员会",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["cssc", "council for six sigma certification", "body of knowledge"],
        "explanation": "The Council for Six Sigma Certification，教材和考试大纲中的认证机构名；Body of Knowledge 指其知识体系范围。",
    },
    {
        "term": "Sigma",
        "translation": "西格玛",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["sigma", "σ"],
        "explanation": "统计学中常用来表示标准差。六西格玛语境中，它常用于表达流程波动水平和质量表现。",
    },
    {
        "term": "sigma level",
        "translation": "西格玛水平",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["level", "sigma level", "sigma levels"],
        "explanation": "用于概括流程质量表现的等级化指标。西格玛水平越高，通常代表缺陷机会越少、流程输出越稳定。",
    },
    {
        "term": "methodology",
        "translation": "方法论",
        "partOfSpeech": "noun",
        "lookupKeys": ["methodology", "methodologies"],
        "explanation": "一套有结构、有步骤的方法体系，不是单个技巧或工具。",
    },
    {
        "term": "process",
        "translation": "流程",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["process", "processes"],
        "explanation": "把输入转化为输出的一系列活动。六西格玛改进通常围绕流程的测量、分析、改进和控制展开。",
    },
    {
        "term": "variation",
        "translation": "变异；波动",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["variation"],
        "explanation": "流程输出或执行方式中的差异。变异越大，缺陷、返工和客户体验不一致的风险通常越高。",
    },
    {
        "term": "defect",
        "translation": "缺陷",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["defect", "defects"],
        "explanation": "未满足客户需求、规格要求或流程要求的输出。",
    },
    {
        "term": "opportunity",
        "translation": "出错机会；机会",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["opportunity", "opportunities"],
        "explanation": "一次可能发生缺陷的机会。DPMO 等指标会把缺陷数放到机会数的语境里衡量。",
    },
    {
        "term": "beta testing",
        "translation": "Beta 测试",
        "partOfSpeech": "phrase",
        "lookupKeys": ["beta", "beta testing"],
        "explanation": "在较小或较受控范围内试用新想法、产品或系统，先发现问题再扩大推广。",
    },
    {
        "term": "DPMO",
        "translation": "每百万机会缺陷数",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["dpmo", "defects per million opportunities"],
        "explanation": "Defects Per Million Opportunities，指每百万次机会中的缺陷数；数值越低，流程质量越高。",
    },
    {
        "term": "DMAIC",
        "translation": "定义、测量、分析、改进、控制",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["dmaic", "define measure analyze improve control"],
        "explanation": "六西格玛改进既有流程时常用的五阶段方法：Define、Measure、Analyze、Improve、Control。",
    },
    {
        "term": "DMADV",
        "translation": "定义、测量、分析、设计、验证",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["dmadv", "define measure analyze design verify"],
        "explanation": "Design for Six Sigma 常用路径，适合设计新产品、新流程或对现有流程做根本性重设。",
    },
    {
        "term": "DMADOV",
        "translation": "定义、测量、分析、设计、优化、验证",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["dmadov", "define measure analyze design optimize verify"],
        "explanation": "DMADV 的扩展形式，强调在验证前增加优化阶段，用于更复杂的设计型六西格玛项目。",
    },
    {
        "term": "yield",
        "translation": "良率",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["yield"],
        "explanation": "符合要求的输出比例。第 1 章使用公式：（机会数 - 缺陷数）/ 机会数 × 100。",
    },
    {
        "term": "Voice of the Customer",
        "translation": "客户之声",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["voc", "voice of the customer", "customer"],
        "explanation": "客户需求、抱怨、期望和偏好的系统化输入，用于帮助团队确定真正重要的质量要求。",
    },
    {
        "term": "customer-focused improvement",
        "translation": "以客户为中心的改进",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["customer focused", "customer-focused", "customer focused improvement"],
        "explanation": "把客户真正重视的质量、速度、成本和体验要求作为改进优先级，而不是只优化内部方便性。",
    },
    {
        "term": "value stream",
        "translation": "价值流",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["value", "value stream", "value streams"],
        "explanation": "为了产生最终结果所需的所有活动、事项、人员和信息的序列，可用于识别浪费和改进机会。",
    },
    {
        "term": "left",
        "translation": "左侧；左边的；剩余的",
        "partOfSpeech": "word",
        "lookupKeys": ["left"],
        "explanation": "在流程图、价值流图或软件界面说明中，通常表示左侧方向或从左侧开始阅读；如果出现在普通句子里，也可能表示“剩余的”。",
    },
    {
        "term": "left-to-right",
        "translation": "从左到右；按流程顺序推进",
        "partOfSpeech": "phrase",
        "lookupKeys": ["left-to-right", "left to right"],
        "explanation": "阅读流程图、价值流图或步骤图时常见的方向说明，意思是沿页面或流程从左侧向右侧依次查看。",
    },
    {
        "term": "continuous process improvement",
        "translation": "持续流程改进",
        "partOfSpeech": "phrase",
        "isSixSigmaTerm": True,
        "lookupKeys": ["continuous", "continuous process improvement", "improvement"],
        "explanation": "持续寻找并优先处理流程中的改进机会，而不是把质量改进视为一次性项目。",
    },
    {
        "term": "statistical control",
        "translation": "统计受控",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["control", "statistical control"],
        "explanation": "流程波动处于可解释、可监控的状态。六西格玛改进后需要控制机制防止流程退回旧状态。",
    },
    {
        "term": "Minitab",
        "translation": "Minitab 统计软件",
        "partOfSpeech": "proper noun",
        "lookupKeys": ["minitab"],
        "explanation": "质量改进和统计课程常用的软件，用来录入数据、生成图表、做假设检验、回归和方差分析。",
    },
    {
        "term": "data",
        "translation": "数据",
        "partOfSpeech": "noun",
        "lookupKeys": ["data"],
        "explanation": "被观察、记录或测量的信息。六西格玛强调用数据判断流程表现，而不是只凭经验判断。",
    },
    {
        "term": "project",
        "translation": "项目",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["project", "projects"],
        "explanation": "有目标、范围、负责人和时间边界的改进工作。六西格玛项目通常要说明问题、收益和衡量指标。",
    },
    {
        "term": "team",
        "translation": "团队",
        "partOfSpeech": "noun",
        "lookupKeys": ["team", "teams"],
        "explanation": "为共同目标协作的一组人。黑带项目中团队通常包含流程负责人、主题专家和数据支持人员。",
    },
    {
        "term": "analysis",
        "translation": "分析",
        "partOfSpeech": "noun",
        "lookupKeys": ["analysis", "analyze", "analyses"],
        "explanation": "把数据、流程或问题拆开检查，寻找模式、差异、原因和改进机会。",
    },
    {
        "term": "problem",
        "translation": "问题",
        "partOfSpeech": "noun",
        "lookupKeys": ["problem", "problems"],
        "explanation": "现状与期望之间的差距。好的问题描述应具体说明影响、范围和可衡量表现。",
    },
    {
        "term": "quality",
        "translation": "质量",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["quality"],
        "explanation": "输出满足客户需求、规格和使用目的的程度。质量不仅是少出错，也包括稳定、及时和可预测。",
    },
    {
        "term": "sample",
        "translation": "样本",
        "partOfSpeech": "noun",
        "lookupKeys": ["sample", "samples"],
        "explanation": "从总体中抽取的一部分数据或对象，用来估计总体情况或进行检验。",
    },
    {
        "term": "population",
        "translation": "总体",
        "partOfSpeech": "noun",
        "lookupKeys": ["population", "populations"],
        "explanation": "研究对象的完整集合。样本来自总体，统计推断的目标通常是理解总体特征。",
    },
    {
        "term": "hypothesis",
        "translation": "假设",
        "partOfSpeech": "noun",
        "lookupKeys": ["hypothesis", "hypotheses"],
        "explanation": "可用数据检验的判断或主张。假设检验用样本证据判断差异或关系是否足够可信。",
    },
    {
        "term": "p-value",
        "translation": "P 值",
        "partOfSpeech": "term",
        "lookupKeys": ["p value", "p-value", "pvalues", "p-values"],
        "explanation": "在零假设成立时，观察到当前或更极端结果的概率。P 值小通常表示数据不太支持零假设。",
    },
    {
        "term": "confidence interval",
        "translation": "置信区间",
        "partOfSpeech": "term",
        "lookupKeys": ["confidence interval", "confidence intervals"],
        "explanation": "用样本数据给总体参数估计出的范围。它表达估计的不确定性，而不是保证单个未来结果落在其中。",
    },
    {
        "term": "mean",
        "translation": "均值；平均数",
        "partOfSpeech": "noun",
        "lookupKeys": ["mean", "average", "averages"],
        "explanation": "所有数值相加后除以数量，常用来描述数据中心位置，但会受极端值影响。",
    },
    {
        "term": "median",
        "translation": "中位数",
        "partOfSpeech": "noun",
        "lookupKeys": ["median", "medians"],
        "explanation": "把数据排序后位于中间的值。存在极端值时，中位数通常比均值更稳健。",
    },
    {
        "term": "range",
        "translation": "极差；范围",
        "partOfSpeech": "noun",
        "lookupKeys": ["range", "ranges"],
        "explanation": "最大值与最小值的差，也可泛指数据或规格覆盖的区间。",
    },
    {
        "term": "standard deviation",
        "translation": "标准差",
        "partOfSpeech": "term",
        "lookupKeys": ["standard deviation", "standard deviations", "deviation", "deviations"],
        "explanation": "描述数据围绕均值分散程度的指标。标准差越大，数据波动通常越大。",
    },
    {
        "term": "variance",
        "translation": "方差",
        "partOfSpeech": "noun",
        "lookupKeys": ["variance", "variances"],
        "explanation": "标准差的平方，用于衡量数据分散程度。许多统计模型会直接分析方差。",
    },
    {
        "term": "distribution",
        "translation": "分布",
        "partOfSpeech": "noun",
        "lookupKeys": ["distribution", "distributions"],
        "explanation": "数据取值出现的形状和规律，例如集中位置、离散程度、偏斜和尾部情况。",
    },
    {
        "term": "normal distribution",
        "translation": "正态分布",
        "partOfSpeech": "term",
        "lookupKeys": ["normal", "normal distribution", "normal distributions"],
        "explanation": "钟形、对称的数据分布。很多统计方法会检查数据是否近似正态。",
    },
    {
        "term": "probability",
        "translation": "概率",
        "partOfSpeech": "noun",
        "lookupKeys": ["probability", "probabilities"],
        "explanation": "某件事发生可能性的量化表达，通常在 0 到 1 或 0% 到 100% 之间。",
    },
    {
        "term": "measurement",
        "translation": "测量",
        "partOfSpeech": "noun",
        "lookupKeys": ["measure", "measured", "measurement", "measurements", "measuring"],
        "explanation": "用一致的方法给对象、流程或结果赋值。可靠测量是数据分析可信的前提。",
    },
    {
        "term": "metric",
        "translation": "指标",
        "partOfSpeech": "noun",
        "lookupKeys": ["metric", "metrics", "indicator", "indicators"],
        "explanation": "用来跟踪表现的量化标准，例如缺陷率、周期时间、成本或客户满意度。",
    },
    {
        "term": "variable",
        "translation": "变量",
        "partOfSpeech": "noun",
        "lookupKeys": ["variable", "variables"],
        "explanation": "会变化并可被观察或测量的因素。分析中常区分输入变量和输出变量。",
    },
    {
        "term": "factor",
        "translation": "因素；因子",
        "partOfSpeech": "noun",
        "lookupKeys": ["factor", "factors"],
        "explanation": "可能影响结果的条件或输入。实验设计会系统改变因素以观察影响。",
    },
    {
        "term": "experiment",
        "translation": "实验",
        "partOfSpeech": "noun",
        "lookupKeys": ["experiment", "experiments", "experimental"],
        "explanation": "有计划地改变一个或多个因素，并观察结果变化，用来验证原因和优化条件。",
    },
    {
        "term": "ANOVA",
        "translation": "方差分析",
        "partOfSpeech": "abbreviation",
        "lookupKeys": ["anova", "analysis of variance"],
        "explanation": "Analysis of Variance，用于比较多个组均值差异是否显著的统计方法。",
    },
    {
        "term": "regression",
        "translation": "回归分析",
        "partOfSpeech": "noun",
        "lookupKeys": ["regression", "regressions"],
        "explanation": "研究一个或多个输入变量与输出变量之间关系的方法，可用于解释、预测和优化。",
    },
    {
        "term": "correlation",
        "translation": "相关性",
        "partOfSpeech": "noun",
        "lookupKeys": ["correlation", "correlations", "correlate", "correlated"],
        "explanation": "两个变量一起变化的程度。相关不等于因果，需要结合流程知识和实验验证。",
    },
    {
        "term": "capability",
        "translation": "过程能力",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["capability", "capabilities", "process capability"],
        "explanation": "流程在稳定状态下满足规格要求的能力，常用 Cp、Cpk、Pp、Ppk 等指标评估。",
    },
    {
        "term": "specification limit",
        "translation": "规格限",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["specification limit", "specification limits", "lsl", "usl"],
        "explanation": "客户或设计要求给出的允许边界。超出规格限通常意味着不合格或风险增加。",
    },
    {
        "term": "control limit",
        "translation": "控制限",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["control limit", "control limits", "lcl", "ucl"],
        "explanation": "控制图中根据流程历史波动计算出的边界，用来识别异常波动；它不同于客户规格限。",
    },
    {
        "term": "chart",
        "translation": "图表",
        "partOfSpeech": "noun",
        "lookupKeys": ["chart", "charts", "graph", "graphs"],
        "explanation": "把数据可视化的方式，帮助快速看出分布、趋势、异常点或组间差异。",
    },
    {
        "term": "control chart",
        "translation": "控制图",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["control chart", "control charts"],
        "explanation": "按时间顺序监控流程数据的图，用中心线和控制限判断流程是否出现特殊原因波动。",
    },
    {
        "term": "C chart",
        "translation": "C 控制图",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["c chart", "c charts"],
        "explanation": "用于单位大小固定时的缺陷数监控，关注每个样本单位中的缺陷个数。",
    },
    {
        "term": "P chart",
        "translation": "P 控制图",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["p chart", "p charts"],
        "explanation": "用于监控不合格品比例，适合每次抽样量可以变化的属性数据。",
    },
    {
        "term": "U chart",
        "translation": "U 控制图",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["u chart", "u charts"],
        "explanation": "用于单位大小不固定时的单位缺陷数监控，常见于机会数随样本变化的场景。",
    },
    {
        "term": "Xbar-R chart",
        "translation": "均值-极差控制图",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["xbar r chart", "xbar-r chart", "x-bar r chart", "x bar r chart"],
        "explanation": "成组连续数据常用控制图，Xbar 图看组均值位置，R 图看组内波动。",
    },
    {
        "term": "Pareto chart",
        "translation": "帕累托图",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["pareto", "pareto chart", "pareto charts"],
        "explanation": "按频数或影响大小排序的柱状图，用来找出少数关键原因或主要问题类别。",
    },
    {
        "term": "histogram",
        "translation": "直方图",
        "partOfSpeech": "noun",
        "lookupKeys": ["histogram", "histograms"],
        "explanation": "显示连续数据分布形状的图，可以观察集中位置、离散程度、偏斜和多峰情况。",
    },
    {
        "term": "boxplot",
        "translation": "箱线图",
        "partOfSpeech": "noun",
        "lookupKeys": ["boxplot", "boxplots", "box plot", "box plots", "box and whisker"],
        "explanation": "用中位数、四分位数和异常值概括数据分布，适合快速比较多组数据。",
    },
    {
        "term": "dotplot",
        "translation": "点图",
        "partOfSpeech": "noun",
        "lookupKeys": ["dotplot", "dotplots", "dot plot", "dot plots"],
        "explanation": "把单个观测值画成点，适合小样本数据的分布观察和组间比较。",
    },
    {
        "term": "Anderson-Darling",
        "translation": "安德森-达林检验",
        "partOfSpeech": "term",
        "lookupKeys": ["anderson darling", "anderson-darling", "ad test"],
        "explanation": "常用于检验样本是否符合指定分布。质量分析中经常用它判断数据是否可按正态分布处理。",
    },
    {
        "term": "scatterplot",
        "translation": "散点图",
        "partOfSpeech": "noun",
        "lookupKeys": ["scatterplot", "scatterplots", "scatter plot", "scatter plots"],
        "explanation": "用点展示两个变量之间的关系，常用于观察趋势、相关性和异常点。",
    },
    {
        "term": "run chart",
        "translation": "运行图",
        "partOfSpeech": "term",
        "lookupKeys": ["run chart", "run charts"],
        "explanation": "按时间顺序展示数据变化的图，适合观察趋势、漂移和改进前后的变化。",
    },
    {
        "term": "EWMA",
        "translation": "指数加权移动平均",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["ewma", "exponentially weighted moving average"],
        "explanation": "对近期数据赋予更高权重的移动平均方法，常用于更敏感地发现流程均值的小幅漂移。",
    },
    {
        "term": "process map",
        "translation": "流程图；流程地图",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["process map", "process maps", "process mapping"],
        "explanation": "把流程步骤、输入、输出和责任关系画出来，用于发现返工、等待、浪费和交接问题。",
    },
    {
        "term": "SIPOC",
        "translation": "供应方-输入-流程-输出-客户",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["sipoc"],
        "explanation": "Supplier、Input、Process、Output、Customer 的缩写，用来高层次界定流程范围和相关方。",
    },
    {
        "term": "CTQ",
        "translation": "关键质量特性",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["ctq", "critical to quality"],
        "explanation": "Critical To Quality，指客户真正关心并可转化为可测量要求的质量特性。",
    },
    {
        "term": "CTC",
        "translation": "客户关键要求",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["ctc", "critical to customer"],
        "explanation": "Critical To Customer，指从客户角度看最关键的要求，可进一步转化为 CTQ 等可测指标。",
    },
    {
        "term": "COPQ",
        "translation": "劣质成本；不良质量成本",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["copq", "cost of poor quality", "poor quality cost"],
        "explanation": "Cost of Poor Quality，因缺陷、返工、报废、投诉、延误等质量问题产生的成本。",
    },
    {
        "term": "COQ",
        "translation": "质量成本",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["coq", "cost of quality"],
        "explanation": "Cost of Quality，通常包括预防成本、鉴定成本以及内部/外部失败成本。",
    },
    {
        "term": "FMEA",
        "translation": "失效模式与影响分析",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["fmea", "failure mode and effects analysis"],
        "explanation": "系统识别潜在失效、后果、原因和控制措施的方法，常用于风险优先级排序。",
    },
    {
        "term": "root cause",
        "translation": "根本原因",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["root", "root cause", "root causes"],
        "explanation": "导致问题反复出现的深层原因。只处理表面症状，问题往往会再次发生。",
    },
    {
        "term": "waste",
        "translation": "浪费",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["waste", "wastes"],
        "explanation": "不增加客户价值却消耗时间、成本或资源的活动，例如等待、返工、搬运和过度处理。",
    },
    {
        "term": "Muda",
        "translation": "浪费（精益术语）",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["muda"],
        "explanation": "来自精益管理的术语，指不创造价值的浪费。识别 Muda 是流程改进的重要入口。",
    },
    {
        "term": "Kaizen",
        "translation": "改善",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["kaizen"],
        "explanation": "持续、小步、全员参与的改进理念，强调在日常工作中不断消除浪费和提升流程。",
    },
    {
        "term": "poka-yoke",
        "translation": "防错；防呆",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["poka", "poka yoke", "poka-yoke", "error proof", "error proofing", "error-proofing"],
        "explanation": "通过设计让错误难以发生或一发生就被发现，例如限位、颜色区分、互锁和自动检查。",
    },
    {
        "term": "jidoka",
        "translation": "自働化；异常即停",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["jidoka"],
        "explanation": "精益中的自动化质量思想：发现异常时停止流程，避免缺陷继续流动。",
    },
    {
        "term": "Lean",
        "translation": "精益",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["lean", "lean six sigma"],
        "explanation": "以消除浪费、缩短周期、提升价值流动为核心的管理方法，常与六西格玛结合使用。",
    },
    {
        "term": "5S",
        "translation": "5S 管理",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["5s", "seiri", "seiton", "seiso", "seiketsu", "shitsuke"],
        "explanation": "整理、整顿、清扫、清洁、素养，用于建立有序、可视、稳定的现场基础。",
    },
    {
        "term": "takt time",
        "translation": "节拍时间",
        "partOfSpeech": "term",
        "lookupKeys": ["takt", "takt time"],
        "explanation": "按客户需求节奏计算出的目标生产或服务节拍，用于判断流程产能是否匹配需求。",
    },
    {
        "term": "RTY",
        "translation": "滚动直通良率",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["rty", "rolled throughput yield"],
        "explanation": "Rolled Throughput Yield，多步骤流程中各步骤一次通过概率的连乘，反映整个流程无返工通过的能力。",
    },
    {
        "term": "FTY",
        "translation": "首次良率",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["fty", "first time yield"],
        "explanation": "First Time Yield，某一步骤中第一次就合格通过的比例，不把返工后的合格计为首次通过。",
    },
    {
        "term": "OFAT",
        "translation": "一次一因子法",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["ofat", "one factor at a time"],
        "explanation": "One Factor At a Time，每次只改变一个因素来观察影响；简单但难以发现因素交互作用。",
    },
    {
        "term": "RACI",
        "translation": "责任分配矩阵",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["raci", "responsible accountable consulted informed"],
        "explanation": "用于明确任务中的 Responsible、Accountable、Consulted、Informed 角色，减少职责不清。",
    },
    {
        "term": "brainwriting",
        "translation": "书面头脑风暴",
        "partOfSpeech": "term",
        "lookupKeys": ["brainwriting"],
        "explanation": "让成员先独立写出想法再汇总讨论，能减少强势发言者影响，适合收集改进创意。",
    },
    {
        "term": "change management",
        "translation": "变更管理",
        "partOfSpeech": "term",
        "lookupKeys": ["change management"],
        "explanation": "围绕流程、人员、沟通和制度安排管理变化，降低改进方案落地时的阻力。",
    },
    {
        "term": "select",
        "translation": "选择；选中",
        "partOfSpeech": "verb",
        "lookupKeys": ["select", "selects", "selected", "selecting"],
        "explanation": "在软件步骤中常表示从菜单、按钮、字段或图表选项中做出选择。",
    },
    {
        "term": "create",
        "translation": "创建；生成",
        "partOfSpeech": "verb",
        "lookupKeys": ["create", "creates", "created", "creating"],
        "explanation": "在教材操作步骤中通常指生成图表、表格、模型或新的分析结果。",
    },
    {
        "term": "to",
        "translation": "到；为了；对；不定式标记",
        "partOfSpeech": "preposition",
        "lookupKeys": ["to"],
        "explanation": "常表示方向、目的、对象，也用于动词不定式；具体意思要结合后面的词或短语判断。",
    },
    {
        "term": "within",
        "translation": "在……之内",
        "partOfSpeech": "preposition",
        "lookupKeys": ["within"],
        "explanation": "表示处在某个范围、时间、边界或条件内部，例如 within limits 表示在限值内。",
    },
    {
        "term": "between",
        "translation": "在……之间",
        "partOfSpeech": "preposition",
        "lookupKeys": ["between"],
        "explanation": "表示两个对象、数值、阶段或组别之间的关系或差异。",
    },
]


def normalize_space(text: str) -> str:
    return " ".join(text.replace("\u00a0", " ").split()).strip()


def normalize_title(text: str) -> str:
    text = normalize_space(text).lower()
    text = text.replace("-", " ").replace("–", " ").replace("—", " ")
    text = text.replace("σ", "sigma")
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", " ", text).strip()


def block_id(section_id: str, lang: str, index: int) -> str:
    return f"{section_id}-{lang}-{index:03d}"


def png_dimensions(blob: bytes) -> tuple[int | None, int | None]:
    if len(blob) < 24 or not blob.startswith(b"\x89PNG\r\n\x1a\n") or blob[12:16] != b"IHDR":
        return None, None
    return int.from_bytes(blob[16:20], "big"), int.from_bytes(blob[20:24], "big")


def image_asset_type(width: int | None, height: int | None) -> str:
    if width is None or height is None:
        return "figure"
    if height <= 180:
        return "formula-image"
    if width >= 900 and (height >= 240 or width / max(height, 1) >= 2.2):
        return "table-image"
    return "figure"


def section_range_end(current_page: int, next_page: int | None, chapter_page_end: int) -> int:
    if next_page is None:
        return chapter_page_end
    return max(current_page, min(chapter_page_end, next_page - 1))


def assign_estimated_pages(items: list[dict[str, Any]], page_start: int, page_end: int) -> list[dict[str, Any]]:
    if not items:
        return []
    safe_start = min(page_start, page_end)
    safe_end = max(page_start, page_end)
    page_span = safe_end - safe_start + 1
    item_count = len(items)
    assigned: list[dict[str, Any]] = []
    for index, item in enumerate(items):
        offset = min(page_span - 1, (index * page_span) // item_count)
        assigned.append({**item, "page": safe_start + offset})
    return assigned


def image_item_from_part(part: Any) -> dict[str, Any]:
    blob = part.blob
    digest = hashlib.sha256(blob).hexdigest()
    media_name = str(part.partname).lstrip("/")
    extension = Path(media_name).suffix.lower() or ".png"
    width, height = png_dimensions(blob)
    asset_id = f"fig-{digest[:16]}"
    return {
        "kind": "image",
        "style": "Image",
        "text": "",
        "assetId": asset_id,
        "src": f"assets/figures/{asset_id}{extension}",
        "width": width,
        "height": height,
        "assetType": image_asset_type(width, height),
        "sourceMedia": media_name,
    }


def iter_doc_items(doc: Document) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for child in doc.element.body.iterchildren():
        if isinstance(child, CT_P):
            paragraph = Paragraph(child, doc)
            text = normalize_space(paragraph.text)
            style = paragraph.style.name if paragraph.style else "Normal"
            if text:
                items.append({"kind": "paragraph", "style": style, "text": text})
            for embed_id in paragraph._p.xpath(".//a:blip/@r:embed"):
                image_part = doc.part.related_parts.get(embed_id)
                if image_part is not None:
                    items.append(image_item_from_part(image_part))
        elif isinstance(child, CT_Tbl):
            table = Table(child, doc)
            rows = [
                [normalize_space(cell.text) for cell in row.cells]
                for row in table.rows
            ]
            rows = [row for row in rows if any(cell for cell in row)]
            if not rows:
                continue
            flat = " ".join(cell for row in rows for cell in row)
            kind = "termNote" if flat.startswith("术语说明") else "table"
            items.append({"kind": kind, "style": "Table", "rows": rows, "text": flat})
    return items


def split_english_special_item(item: dict[str, Any]) -> list[dict[str, Any]]:
    text = item.get("text", "")
    if item["kind"] != "paragraph":
        return [item]
    if text == "Defining 6σ":
        return [{"kind": "heading", "style": "Heading 2", "text": text}]
    prefix = "Value Streams The value stream "
    if text.startswith(prefix):
        paragraph = "The value stream " + text[len(prefix):]
        return [
            {"kind": "heading", "style": "Heading 2", "text": "Value Streams"},
            {"kind": "paragraph", "style": "Normal", "text": paragraph},
        ]
    return [item]


def normalize_heading_item(item: dict[str, Any], lang: str) -> list[dict[str, Any]]:
    items = split_english_special_item(item) if lang == "en" else [item]
    normalized: list[dict[str, Any]] = []
    for candidate in items:
        style = candidate.get("style", "")
        if candidate["kind"] == "paragraph" and style.startswith("Heading"):
            level = 1 if "1" in style else 2 if "2" in style else 3
            candidate = {**candidate, "kind": "heading", "level": level}
        elif candidate["kind"] == "heading":
            level = 1 if "1" in candidate.get("style", "") else 2
            candidate = {**candidate, "level": level}
        normalized.append(candidate)
    return normalized


def chapter_slice(items: list[dict[str, Any]], lang: str) -> list[dict[str, Any]]:
    if lang == "en":
        start_pattern = "Chapter 1: What is Six Sigma?"
        end_pattern = "Chapter 2:"
    else:
        start_pattern = "第一章：什么是六西格玛？"
        end_pattern = "第二章"

    start = None
    end = None
    for index, item in enumerate(items):
        text = item.get("text", "")
        if start is None and start_pattern in text:
            start = index
            continue
        if start is not None and text.startswith(end_pattern):
            end = index
            break
    if start is None or end is None:
        raise RuntimeError(f"Unable to find chapter boundaries for {lang}: start={start}, end={end}")
    sliced: list[dict[str, Any]] = []
    for item in items[start:end]:
        sliced.extend(normalize_heading_item(item, lang))
    return sliced


def build_sections(items: list[dict[str, Any]], lang: str) -> dict[str, list[dict[str, Any]]]:
    title_to_def = {
        normalize_title(section.en_title if lang == "en" else section.zh_title): section
        for section in SECTION_DEFS
    }
    sections: dict[str, list[dict[str, Any]]] = {section.section_id: [] for section in SECTION_DEFS}
    current = SECTION_DEFS[0].section_id
    sources: list[dict[str, Any]] = []

    for item in items:
        text = item.get("text", "")
        normalized = normalize_title(text)
        if item["kind"] == "heading" and normalized in title_to_def:
            current = title_to_def[normalized].section_id
            continue
        if lang == "zh" and item["kind"] == "heading" and normalized == normalize_title("本章资料来源"):
            current = "chapter-sources"
            continue
        if lang == "en" and "http" in text:
            sources.append(item)
            if current != "chapter-sources":
                continue
        sections[current].append(item)

    if lang == "en" and sources:
        sections["chapter-sources"].extend(sources)

    return sections


def serialize_block(item: dict[str, Any], section_id: str, lang: str, index: int) -> dict[str, Any]:
    kind = item["kind"]
    if kind == "image":
        result: dict[str, Any] = {
            "id": block_id(section_id, lang, index),
            "kind": "image",
            "assetId": item["assetId"],
            "src": item["src"],
        }
        if isinstance(item.get("page"), int):
            result["page"] = item["page"]
        if item.get("width") and item.get("height"):
            result["width"] = item["width"]
            result["height"] = item["height"]
        return result
    if kind == "paragraph":
        kind = "listItem" if item.get("style") == "List Bullet" else "paragraph"
    result: dict[str, Any] = {
        "id": block_id(section_id, lang, index),
        "kind": kind,
    }
    if isinstance(item.get("page"), int):
        result["page"] = item["page"]
    if "rows" in item:
        result["rows"] = item["rows"]
        result["text"] = item.get("text", "")
    else:
        result["text"] = item.get("text", "")
    return result


def attach_assets_to_lesson(lesson: dict[str, Any]) -> dict[str, Any]:
    assets: dict[str, dict[str, Any]] = {}
    for section in lesson.get("sections", []):
        for language in ["en", "zh"]:
            for block in section.get("content", {}).get(language, []):
                if block.get("kind") != "image":
                    continue
                asset_id = block["assetId"]
                if asset_id in assets:
                    continue
                width = block.get("width")
                height = block.get("height")
                asset: dict[str, Any] = {
                    "id": asset_id,
                    "type": image_asset_type(width, height),
                    "path": block["src"],
                    "page": block.get("page", section["page"]),
                }
                if width and height:
                    asset["width"] = width
                    asset["height"] = height
                assets[asset_id] = asset
    if assets:
        lesson["assets"] = sorted(assets.values(), key=lambda asset: asset["id"])
    return lesson


def build_lesson(en_docx: Path, zh_docx: Path) -> dict[str, Any]:
    en_items = chapter_slice(iter_doc_items(Document(str(en_docx))), "en")
    zh_items = chapter_slice(iter_doc_items(Document(str(zh_docx))), "zh")
    en_sections = build_sections(en_items, "en")
    zh_sections = build_sections(zh_items, "zh")

    sections: list[dict[str, Any]] = []
    for section_index, section in enumerate(SECTION_DEFS):
        next_page = SECTION_DEFS[section_index + 1].page if section_index + 1 < len(SECTION_DEFS) else None
        page_end = section_range_end(section.page, next_page, 13)
        en_blocks = [
            serialize_block(item, section.section_id, "en", index)
            for index, item in enumerate(
                assign_estimated_pages(en_sections[section.section_id], section.page, page_end),
                start=1,
            )
        ]
        zh_blocks = [
            serialize_block(item, section.section_id, "zh", index)
            for index, item in enumerate(
                assign_estimated_pages(zh_sections[section.section_id], section.page, page_end),
                start=1,
            )
        ]
        sections.append(
            {
                "id": section.section_id,
                "level": section.level,
                "page": section.page,
                "title": {"en": section.en_title, "zh": section.zh_title},
                "content": {"en": en_blocks, "zh": zh_blocks},
            }
        )

    return attach_assets_to_lesson({
        "id": "ch01",
        "chapter": 1,
        "pageStart": 6,
        "pageEnd": 13,
        "title": {
            "en": "Chapter 1: What is Six Sigma?",
            "zh": "第一章：什么是六西格玛？",
        },
        "source": {
            "sourceId": "cssc-six-sigma-black-belt-public-manual",
            "sourceEdition": "2018 public training manual",
            "extraction": "python-docx body-order extraction; section-aligned bilingual content",
        },
        "sections": sections,
    })


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Chapter 1 bilingual content from aligned DOCX manuals.")
    parser.add_argument("--en-docx", type=Path, default=DEFAULT_EN_DOCX)
    parser.add_argument("--zh-docx", type=Path, default=DEFAULT_ZH_DOCX)
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    args = parser.parse_args()

    if not args.en_docx.exists() or not args.zh_docx.exists():
        raise SystemExit(
            f"Aligned DOCX files were not found. Copy them to {DEFAULT_WORKSPACE_ROOT / 'sources'} "
            "or pass --en-docx and --zh-docx."
        )

    lesson = build_lesson(args.en_docx, args.zh_docx)
    terms = CURATED_TERMS
    manifest = {
        "manual": "CSSC Six Sigma Black Belt Training Manual",
        "version": "0.1.0",
        "chapters": [
            {
                "id": "ch01",
                "chapter": 1,
                "title": lesson["title"],
                "pageStart": lesson["pageStart"],
                "pageEnd": lesson["pageEnd"],
                "path": "chapters/ch01.json",
            }
        ],
        "dictionary": "dictionary/six-sigma-terms.json",
    }

    processed_dir = args.repo_root / "content" / "processed"
    write_json(processed_dir / "chapters" / "ch01.json", lesson)
    write_json(processed_dir / "dictionary" / "six-sigma-terms.json", terms)
    write_json(processed_dir / "manifest.json", manifest)

    generated_dir = args.repo_root / "apps" / "reader" / "src" / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(processed_dir / "chapters" / "ch01.json", generated_dir / "ch01.json")
    shutil.copyfile(processed_dir / "dictionary" / "six-sigma-terms.json", generated_dir / "six-sigma-terms.json")

    section_count = len(lesson["sections"])
    en_blocks = sum(len(section["content"]["en"]) for section in lesson["sections"])
    zh_blocks = sum(len(section["content"]["zh"]) for section in lesson["sections"])
    print(f"ok: extracted {section_count} sections, {en_blocks} English blocks, {zh_blocks} Chinese blocks")


if __name__ == "__main__":
    main()
