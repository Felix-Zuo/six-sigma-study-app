import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PersonalLibraryView } from '../apps/reader/src/components/PersonalWorkspace';
import '../apps/reader/src/styles.css';
import '../apps/reader/src/personal.css';
import type { PersonalMaterial } from '../apps/reader/src/lib/personalLibrary';

const fixture = (id: string, title: string, category: PersonalMaterial['category'], extra = {}): PersonalMaterial => ({ id, title, category, kind: 'article', textEn: 'Could we talk about this tomorrow?', textZh: '我们明天再谈这个好吗？', summary: '读一段自然的对话，再换成自己的说法。', terms: [{ term: 'work around', meaningZh: '灵活安排', exampleEn: 'We can work around your schedule.' }], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1, source: 'desktop', ...extra });
const fixtures = [
  fixture('a', '雅思阅读｜判断题：True / False / Not Given', 'ielts'),
  fixture('b', '雅思阅读｜摘要填空', 'ielts'), fixture('c', '雅思阅读｜匹配段落标题', 'ielts'),
  fixture('d', '雅思口语｜Part 1：聊聊你的周末', 'ielts'),
  fixture('e', '雅思口语｜Part 2：一次难忘的旅行', 'ielts'), fixture('f', '雅思口语｜Part 3：城市如何改变', 'ielts'),
  fixture('g', '面试口语｜自我介绍', 'interview'), fixture('h', '面试口语｜通用问答', 'interview'), fixture('i', '面试口语｜行为问题与 STAR', 'interview'),
  fixture('j', '职场口语｜会议里没听清，怎么自然确认？', 'work'),
  fixture('k', '职场口语｜交期变了，怎么跟同事商量？', 'work'),
  fixture('l', '日常口语｜临时改约，怎样开口？', 'general'),
  fixture('m', '只存中文的旧材料', 'general', { textEn: '', textZh: '这篇旧材料仍然可以找到。', terms: [] }),
  fixture('n', '待复习的表达', 'general', { kind: 'expression' }),
  fixture('o', '已移除的材料', 'general', { deletedAt: '2026-01-02T00:00:00Z' }),
];
const root = createRoot(document.getElementById('root')!);
const calls: { opened: string[]; terms: string[] } = { opened: [], terms: [] };
const render = (materials = fixtures, dark = false) => flushSync(() => root.render(<div className="appShell appFrame" data-theme={dark?'dark':'light'}><header className="appPageHeader"><span className="eyebrow">LEARNING LIBRARY</span><h1>材料库</h1></header><PersonalLibraryView materials={materials} onOpen={id=>calls.opened.push(id)} onChanged={()=>{}} onTerms={m=>calls.terms.push(m.id)}><section className="fv-book-section"><div className="fv-section-heading"><h2>系统教材</h2><span>BOOKS & RESOURCES</span></div><button className="fv-book-row" onClick={()=>calls.opened.push('system-book')}><span><strong>双语学习示例教材</strong><small>12 章 · 中英双语阅读</small></span></button></section></PersonalLibraryView></div>));
const tick = () => new Promise(resolve=>setTimeout(resolve, 25));
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const group = (label: string) => document.querySelector(`[role="group"][aria-label="${label}"]`)!;
const click = async (text: string, within: ParentNode = document) => {
  const button = [...within.querySelectorAll('button')].find(node=>{const copy=node.cloneNode(true) as HTMLElement;copy.querySelectorAll('small').forEach(child=>child.remove());return copy.textContent?.trim()===text;});
  if (!button) throw new Error(`Missing button: ${text}`);
  button.click(); await tick();
};
const clickLabel = async (label: string) => { const node=document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); assert(node,`Missing ${label}`); node!.click(); await tick(); };
const search = async (value: string) => { const input=document.querySelector<HTMLInputElement>('[aria-label="搜索学习材料"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));await tick(); };
const titles = () => [...document.querySelectorAll('.fv-material-card h2')].map(node=>node.textContent);
const direction = async (name: string) => { const button=[...group('学习方向').querySelectorAll('button')].find(node=>node.querySelector('strong')?.textContent===name);assert(button,`Missing direction ${name}`);button!.click();await tick(); };

render();
async function run() {
  const passed: string[] = [];
  assert(titles().length===14,'all active materials visible, tombstone excluded');
  await direction('雅思英语');await click('阅读',group('雅思英语分类'));await click('判断题',group('阅读细分'));
  assert(titles().length===1&&titles()[0]?.includes('判断题'),'IELTS reading judgment filter');passed.push('reading topic navigation');
  await click('填空与简答',group('阅读细分'));assert(titles().length===1&&titles()[0]?.includes('填空'),'completion filter');
  await click('匹配题',group('阅读细分'));assert(titles().length===1&&titles()[0]?.includes('匹配'),'matching filter');
  await click('口语',group('雅思英语分类'));await click('Part 2',group('口语细分'));assert(titles().length===1&&titles()[0]?.includes('Part 2'),'Part 2 selection');passed.push('speaking part navigation resets old topic');
  await direction('求职面试');assert(titles().length===3,'changing direction resets section and topic');await click('行为与情境题',group('求职面试分类'));assert(titles().length===1&&titles()[0]?.includes('STAR'),'behavioral interview');passed.push('interview navigation');
  await direction('职场沟通');await click('会议沟通',group('职场沟通分类'));assert(titles().length===1&&titles()[0]?.includes('没听清'),'work meeting');await click('协作跟进',group('职场沟通分类'));assert(titles().length===1&&titles()[0]?.includes('交期'),'coordination');
  await direction('日常学习');await click('日常交流',group('日常学习分类'));assert(titles().length===1&&titles()[0]?.includes('改约'),'daily conversation');passed.push('new work / daily lesson categories');
  await click('重置筛选');await search('旧材料');assert(titles().length===1&&titles()[0]==='只存中文的旧材料','Chinese title search and old content');assert(document.querySelector('.fv-material-main footer')?.textContent?.includes('中文材料'),'Chinese-only word label');
  await search('灵活安排');assert(titles().length===13,'term meaning search');await search('WORK AROUND');assert(titles().length===13,'case insensitive expression search');await search('part1');assert(titles().length===1,'Part 1 spacing normalization');passed.push('Chinese / English / term search');
  await search('missing-result-xyz');assert(titles().length===0&&document.body.textContent?.includes('没有找到匹配'),'zero results');
  await click('系统教材',group('材料与教材'));assert(document.querySelector('.fv-book-row'),'books reachable during empty search');await click('双语学习示例教材');assert(calls.opened.includes('system-book'),'book opens');await click('学习材料',group('材料与教材'));assert(titles().length===0,'query preserved when returning from books');await click('查看所有材料');assert(titles().length===14,'zero result reset');passed.push('empty results recover and system book access');
  document.querySelector<HTMLButtonElement>('.fv-material-main')!.click();await tick();assert(calls.opened.includes('personal-a'),'stable reader ID');
  await click('加入词本',document.querySelector('.fv-material-card')!);assert(calls.terms.includes('a'),'existing vocabulary action');
  await clickLabel('编辑 雅思阅读｜判断题：True / False / Not Given');assert(document.querySelector('[role="dialog"]'),'edit still opens');await clickLabel('关闭编辑');await clickLabel('添加材料');assert(document.querySelector('[role="dialog"]'),'add still opens');await clickLabel('关闭编辑');passed.push('existing reader, vocabulary, edit and add actions');
  render([]);await tick();assert(document.body.textContent?.includes('留下一段想学的内容'),'empty library guidance');await click('系统教材',group('材料与教材'));assert(document.querySelector('.fv-book-row'),'book accessible in empty library');passed.push('empty library retains textbooks');
  render();await tick();await click('学习材料',group('材料与教材'));await direction('雅思英语');await click('阅读',group('雅思英语分类'));
  return passed;
}
(window as any).qaLibrary = { run, direction, click, group, render, fixtures, search, titles };
