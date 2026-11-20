import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, ArrowRight, BookOpen, Check, Cloud, Edit3, FileText, Headphones, MessageCircle, Plus, Search, Send, Sparkles, Trash2, X, Brain, Bookmark, RotateCw } from 'lucide-react';
import { appendChatMessage, deleteLearningMemory, deletePersonalMaterial, listChatMessages, listLearningMemories, saveLearningMemory, savePersonalMaterial, type PersonalMaterial, type PersonalChatMessage, type LearningMemory } from '../lib/personalLibrary';
import { chatWithStudyAssistant } from '../lib/studyChatAssistant';
import { classifyMaterial, materialClassificationLabel, materialDirections, materialMatchesFilter, materialMatchesSearch, materialSearchText, materialSections, materialTopics, type MaterialFilter } from '../lib/materialClassification';
import './PersonalLibraryView.css';

export const categoryLabels = { interview: '面试表达', ielts: '雅思英语', work: '职场沟通', general: '日常阅读' };
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const errorText = (error: unknown) => error instanceof Error ? error.message : '暂时未完成，请重试。';
type MaterialProps = { materials: PersonalMaterial[]; onOpen: (id: string) => void; onChanged: () => void; onTerms: (material: PersonalMaterial) => void };

export function StudyHome({ materials, due, completed, goal, streak, bookTitle, onContinue, onNavigate }: {
  materials: PersonalMaterial[]; due: number; completed: number; goal: number; streak: number; bookTitle: string; onContinue: () => void; onNavigate: (view: 'library'|'chat'|'vocab'|'notes'|'questions'|'favorites') => void;
}) {
  return <div className="fv-home">
    <header className="fv-brand"><span className="fv-brand-mark">f.</span><span>FLY VIEW<small>你的语言，也有自己的方向。</small></span><span className="fv-edition">PERSONAL<br/>EDITION / 09</span></header>
    <section className="fv-hero"><div className="fv-hero-top"><span><i/> LEARN SOMETHING REAL</span><span>飞阅 · 学习空间</span></div><h1>把遇见的好表达，<br/>变成<span>自己的语言。</span></h1><p>一段文章，一次对话，一点进步。<br/>从你真正想说的话开始。</p><button onClick={()=>onNavigate('chat')}>开始一段对话 <ArrowUpRight size={22}/></button><div className="fv-orbit" aria-hidden="true"><span>F</span><i/><b>READ / THINK / SPEAK</b></div></section>
    <div className="fv-section-heading"><h2>今天，往前一点</h2><span>YOUR DAILY RHYTHM</span></div>
    <section className="fv-daily"><button onClick={()=>onNavigate('vocab')}><span className="fv-daily-label">词汇复习 <ArrowUpRight size={16}/></span><strong>{completed}<small> / {goal}</small></strong><div className="fv-mini-track"><i style={{width:`${Math.min(100,completed/Math.max(goal,1)*100)}%`}}/></div><span>{due ? `${due} 个词等待与你重逢` : '收藏表达，积累自己的词本'}</span></button><button onClick={()=>onNavigate('library')}><span className="fv-daily-label">我的材料 <ArrowUpRight size={16}/></span><strong>{materials.length}<small> 篇</small></strong><span className="fv-material-icons"><FileText/><Headphones/><MessageCircle/></span><span>{streak > 0 ? `已连续学习 ${streak} 天` : '面试 · 雅思 · 工作 · 生活'}</span></button></section>
    <button className="fv-continue" onClick={onContinue}><span className="fv-cover-mini"><BookOpen/></span><span><small>从上次停下的位置继续</small><strong>{bookTitle}</strong><em>双语阅读 / 随手查词</em></span><ArrowRight size={22}/></button>
    <section className="fv-quick-links"><button onClick={()=>onNavigate('notes')}><Bookmark size={18}/>笔记与摘录<ArrowUpRight size={15}/></button><button onClick={()=>onNavigate('questions')}><Brain size={18}/>题库训练<ArrowUpRight size={15}/></button><button onClick={()=>onNavigate('favorites')}><BookOpen size={18}/>阅读收藏<ArrowUpRight size={15}/></button></section>
    <p className="fv-footer-note">MAKE IT PART OF YOU.</p>
  </div>;
}

export function MaterialEditor({ material, open, onOpenChange, onSaved }: { material?: PersonalMaterial; open:boolean; onOpenChange:(open:boolean)=>void; onSaved:(m:PersonalMaterial)=>void }) {
  const [title,setTitle]=useState(''); const [textEn,setEn]=useState(''); const [textZh,setZh]=useState('');
  const [category,setCategory]=useState<PersonalMaterial['category']>('general'); const [kind,setKind]=useState<PersonalMaterial['kind']>('article');
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{if(open){setTitle(material?.title??'');setEn(material?.textEn??'');setZh(material?.textZh??'');setCategory(material?.category??'general');setKind(material?.kind??'article');setError('');}},[open,material]);
  async function save(){setBusy(true);setError('');try{if(!title.trim()||(!textEn.trim()&&!textZh.trim()))throw new Error('请填写标题和至少一段正文。');const result=await savePersonalMaterial({...material,id:material?.id??id(),title:title.trim(),textEn:textEn.trim(),textZh:textZh.trim(),category,kind,terms:material?.terms??[],summary:material?.summary??'',revision:material?.revision??1,source:material?.source??'chat',createdAt:material?.createdAt??now(),updatedAt:now()});onSaved(result);onOpenChange(false);}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  return <Dialog.Root open={open} onOpenChange={v=>{if(busy)return;if(!v && (title!==(material?.title??'')||textEn!==(material?.textEn??'')||textZh!==(material?.textZh??'')) && !window.confirm('这段内容尚未保存，确定关闭？'))return;onOpenChange(v);}}><Dialog.Portal><Dialog.Overlay className="fv-dialog-overlay"/><Dialog.Content className="fv-dialog"><header><div><Dialog.Title>{material?'编辑学习材料':'保存一段好内容'}</Dialog.Title><Dialog.Description>原文、翻译和阅读进度会保留在你的学习空间。</Dialog.Description></div><Dialog.Close aria-label="关闭编辑" className="fv-icon"><X/></Dialog.Close></header><div className="fv-editor-scroll"><label>标题<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={180}/></label><div className="fv-form-row"><label>分类<select value={category} onChange={e=>setCategory(e.target.value as PersonalMaterial['category'])}>{Object.entries(categoryLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>形式<select value={kind} onChange={e=>setKind(e.target.value as PersonalMaterial['kind'])}><option value="article">阅读文章</option><option value="expression">单词 / 表达</option><option value="memo">备忘录</option></select></label></div><label>英文原文<textarea rows={6} value={textEn} onChange={e=>setEn(e.target.value)} maxLength={100000}/></label><label>中文翻译或说明（可稍后补充）<textarea rows={4} value={textZh} onChange={e=>setZh(e.target.value)} maxLength={100000}/></label></div>{error&&<p className="fv-error" role="alert">{error}</p>}<button className="fv-primary" disabled={busy} onClick={()=>void save()}>{busy?'保存中…':'保存到学习材料'}<Check size={18}/></button></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function PersonalLibraryView({materials,onOpen,onChanged,onTerms,children}:MaterialProps&{children?:React.ReactNode}){
  const [scope,setScope]=useState<'materials'|'books'>('materials');
  const [filter,setFilter]=useState<MaterialFilter>({direction:'all',section:'all',topic:'all'});
  const [query,setQuery]=useState('');
  const [editing,setEditing]=useState<PersonalMaterial>();
  const [editor,setEditor]=useState(false);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{setStatus('');setError('');},[filter,query,scope]);
  const indexed=useMemo(()=>materials.filter(material=>!material.deletedAt).map(material=>{
    const classification=classifyMaterial(material);
    return {material,classification,searchText:materialSearchText(material,classification)};
  }),[materials]);
  const searched=useMemo(()=>indexed.filter(entry=>materialMatchesSearch(entry.searchText,query)),[indexed,query]);
  const visible=searched.filter(entry=>materialMatchesFilter(entry.classification,filter));
  const direction=materialDirections.find(option=>option.id===filter.direction);
  const sections=filter.direction==='all'?[]:materialSections[filter.direction];
  const topics=filter.direction==='ielts'?(materialTopics[filter.section]??[]):[];
  const section=sections.find(option=>option.id===filter.section);
  const topic=topics.find(option=>option.id===filter.topic);
  const selection=[direction?.label,section?.label,topic?.label].filter(Boolean).join(' / ')||'所有材料';
  const hasFilter=filter.direction!=='all'||query.trim().length>0;
  const reset=()=>{setFilter({direction:'all',section:'all',topic:'all'});setQuery('');};
  const add=()=>{setEditing(undefined);setEditor(true);};
  const count=(next:MaterialFilter)=>searched.filter(entry=>materialMatchesFilter(entry.classification,next)).length;

  return <div className="fv-library fv-library-browser">
    <div className="fv-library-scope" role="group" aria-label="材料与教材">
      <button type="button" aria-pressed={scope==='materials'} onClick={()=>setScope('materials')}><FileText size={17}/><span>学习材料</span><small>{indexed.length}</small></button>
      {children&&<button type="button" aria-pressed={scope==='books'} onClick={()=>setScope('books')}><BookOpen size={17}/><span>系统教材</span><ArrowUpRight size={15}/></button>}
    </div>
    {scope==='books'&&children?<div className="fv-library-books">{children}</div>:<>
      <div className="fv-library-tools">
        <div className="fv-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="搜索学习材料" placeholder="搜索中英文、原文或词句" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" aria-label="清除搜索" onClick={()=>setQuery('')}><X size={16}/></button>}</div>
        <button type="button" className="fv-icon" aria-label="添加材料" onClick={add}><Plus/></button>
      </div>
      <section className="fv-library-navigation" aria-label="按学习方向浏览">
        <div className="fv-library-navigation-heading"><span>学习方向</span><button type="button" aria-pressed={filter.direction==='all'} onClick={()=>setFilter({direction:'all',section:'all',topic:'all'})}>所有材料 <span>{searched.length}</span></button></div>
        <div className="fv-library-directions" data-compact={filter.direction!=='all'} role="group" aria-label="学习方向">
          {materialDirections.map(option=><button type="button" key={option.id} aria-pressed={filter.direction===option.id} onClick={()=>setFilter({direction:option.id,section:'all',topic:'all'})}>
            <span><strong>{option.label}</strong><small>{count({direction:option.id,section:'all',topic:'all'})}</small></span><em>{option.hint}</em>
          </button>)}
        </div>
        {sections.length>0&&<div className="fv-library-facets" role="group" aria-label={`${direction?.label}分类`}>
          <button type="button" aria-pressed={filter.section==='all'} onClick={()=>setFilter(current=>({...current,section:'all',topic:'all'}))}>全部</button>
          {sections.map(option=><button type="button" key={option.id} aria-pressed={filter.section===option.id} onClick={()=>setFilter(current=>({...current,section:option.id,topic:'all'}))}>{option.label}<small>{count({...filter,section:option.id,topic:'all'})}</small></button>)}
        </div>}
        {topics.length>0&&<div className="fv-library-topics" role="group" aria-label={`${section?.label}细分`}>
          <span>{filter.section==='reading'?'阅读题型':'口语部分'}</span>
          <div><button type="button" aria-pressed={filter.topic==='all'} onClick={()=>setFilter(current=>({...current,topic:'all'}))}>全部</button>{topics.map(option=><button type="button" key={option.id} title={option.hint} aria-pressed={filter.topic===option.id} onClick={()=>setFilter(current=>({...current,topic:option.id}))}>{option.label}<small>{count({...filter,topic:option.id})}</small></button>)}</div>
        </div>}
      </section>
      <div className="fv-library-result-heading"><p role="status" aria-live="polite"><strong>{selection}</strong><span>{query.trim()?`搜索“${query.trim()}” · `:''}{visible.length} 篇</span></p>{hasFilter&&<button type="button" onClick={reset}>重置筛选</button>}</div>
      {status&&<p role="status" className="fv-status">{status}</p>}
      {error&&<p role="alert" className="fv-error">{error}</p>}
      {visible.length===0?<div className="fv-empty"><FileText size={32}/>
        <h2>{indexed.length===0?'留下一段想学的内容':query.trim()?'没有找到匹配的材料':'这里还没有材料'}</h2>
        <p>{indexed.length===0?'文章、自我介绍或喜欢的表达，都可以收进来随时阅读。':query.trim()?'试试更短的关键词，或回到所有材料查找。':`之后收录的${section?.label??direction?.label??'学习'}内容会出现在这里。`}</p>
        {indexed.length>0&&hasFilter?<button type="button" className="fv-primary" onClick={reset}>查看所有材料 <ArrowRight size={18}/></button>:<button type="button" className="fv-primary" onClick={add}>收下一段原文 <Plus size={18}/></button>}
      </div>:<div className="fv-material-list">{visible.map(({material:m,classification})=><article key={m.id} className={`fv-material-card fv-category-${classification.direction}`}>
        <button type="button" className="fv-material-main" onClick={()=>onOpen(`personal-${m.id}`)}>
          <div className="fv-material-meta"><span>{materialClassificationLabel(classification)}</span><small>{m.kind==='memo'?'备忘录':m.kind==='expression'?'表达收藏':'阅读文章'}</small></div>
          <h2>{m.title}</h2><p>{m.summary||m.textEn||m.textZh}</p>
          <footer><span>{m.textEn.trim()?`${m.textEn.split(/\s+/).filter(Boolean).length} 词`:'中文材料'} · {m.terms.length} 个表达</span><ArrowUpRight size={19}/></footer>
        </button>
        <div className="fv-material-actions">
          <button type="button" onClick={()=>{setEditing(m);setEditor(true);}} aria-label={`编辑 ${m.title}`}><Edit3 size={16}/>编辑</button>
          {m.terms.length>0&&<button type="button" onClick={()=>{onTerms(m);setStatus('已加入词本，重复词条会自动跳过。');}}><Plus size={16}/>加入词本</button>}
          <button type="button" className="fv-delete" aria-label={`删除 ${m.title}`} onClick={()=>{if(window.confirm(`从材料库移除“${m.title}”？已有学习记录会保留。`)){setError('');void deletePersonalMaterial(m.id,m.revision).then(onChanged).catch(reason=>setError(errorText(reason)));}}}><Trash2 size={16}/></button>
        </div>
      </article>)}</div>}
    </>}
    <MaterialEditor open={editor} material={editing} onOpenChange={setEditor} onSaved={()=>onChanged()}/>
  </div>;
}

export function StudyChat({onChanged,onOpen,onTerms,onSettings}:MaterialProps&{onSettings:()=>void}){
  const [messages,setMessages]=useState<PersonalChatMessage[]>([]);const [draft,setDraft]=useState(()=>{try{return sessionStorage.getItem('fly-view:chat-draft')??'';}catch{return '';}});const [mode,setMode]=useState<'chat'|'collect'>('collect');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState<PersonalMaterial>();const [suggestions,setSuggestions]=useState<string[]>([]);const [editor,setEditor]=useState(false);const [raw,setRaw]=useState<PersonalMaterial>();const bottom=useRef<HTMLDivElement>(null);const reduced=useReducedMotion();const busyRef=useRef(false);
  useEffect(()=>{try{sessionStorage.setItem('fly-view:chat-draft',draft);}catch{}},[draft]);
  useEffect(()=>{void listChatMessages(80).then(setMessages).catch(e=>setError(errorText(e)));},[]);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'end'});},[messages,busy,reduced]);
  function saveRaw(content?:string){const text=(content??draft).trim();if(!text)return;setRaw({id:id(),title:text.split('\n')[0].slice(0,65),category:'general',kind:'article',textEn:/[a-z]/i.test(text)?text:'',textZh:/[a-z]/i.test(text)?'':text,terms:[],summary:'',createdAt:now(),updatedAt:now(),revision:1,source:'chat'});setEditor(true);}
  async function send(){if(!draft.trim()||busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setSaved(undefined);setSuggestions([]);const text=draft.trim();const message:PersonalChatMessage={id:id(),role:'user',content:text,createdAt:now()};try{await appendChatMessage(message);const next=[...messages,message];setMessages(next);setDraft('');const memories=await listLearningMemories();const result=await chatWithStudyAssistant({messages:next.map(({role,content})=>({role,content})),memories:memories.filter(m=>m.enabled).map(m=>m.text),mode});const reply:PersonalChatMessage={id:id(),role:'assistant',content:result.reply,createdAt:now()};await appendChatMessage(reply);setMessages([...next,reply]);if(result.material){const m=await savePersonalMaterial({...result.material,id:id(),createdAt:now(),updatedAt:now(),revision:1,source:'chat'});setSaved(m);onChanged();}setSuggestions(result.memories?.map(m=>m.text)??[]);}catch(e){setError(errorText(e));setDraft(text);}finally{setBusy(false);busyRef.current=false;}}
  return <div className="fv-chat"><div className="fv-chat-context"><span className="fv-assistant-symbol"><Sparkles size={20}/></span><div><strong>你的英语学习搭档</strong><span>对话有记忆，材料有去处。</span></div><button className="fv-icon" aria-label="AI连接设置" onClick={onSettings}><ArrowUpRight size={19}/></button></div><div className="fv-chat-messages" role="log" aria-label="学习对话">{messages.length===0&&<div className="fv-chat-welcome"><span>START WITH SOMETHING YOU LOVE.</span><h2>今天，有什么<br/>想学会的表达？</h2><p>贴一篇文章，留下一段面试自我介绍，<br/>或一起把一个观点说得更清楚。</p><div className="fv-prompt-grid">{['帮我练习英文自我介绍','怎样自然地表达不同意见？','给我一个雅思口语练习话题'].map(prompt=><button key={prompt} onClick={()=>{setMode('chat');setDraft(prompt);}}>{prompt}<ArrowUpRight size={15}/></button>)}</div></div>}{messages.map(m=><motion.div key={m.id} initial={{opacity:0,y:reduced?0:6}} animate={{opacity:1,y:0}} transition={{duration:.18}} className={`fv-message fv-message-${m.role}`}><small>{m.role==='user'?'你':'FLY · 学习助教'}</small><p>{m.content}</p>{m.role==='assistant'&&<button className="fv-message-save" onClick={()=>saveRaw(m.content)}><Plus size={14}/>收录这段表达</button>}</motion.div>)}{saved&&<div className="fv-saved-result"><span><Check size={17}/>已整理到「{categoryLabels[saved.category]}」</span><strong>{saved.title}</strong><div><button onClick={()=>onOpen(`personal-${saved.id}`)}>开始阅读<ArrowRight size={16}/></button>{saved.terms.length>0&&<button onClick={()=>onTerms(saved)}>收藏 {saved.terms.length} 个表达</button>}</div></div>}{suggestions.map(text=><button key={text} className="fv-memory-suggestion" onClick={()=>void saveLearningMemory({id:id(),text,createdAt:now(),source:'assistant',enabled:true}).then(()=>setSuggestions(s=>s.filter(v=>v!==text))).catch(e=>setError(errorText(e)))}><Brain size={16}/><span>记住这个偏好：{text}</span><Plus size={16}/></button>)}{busy&&<p role="status" className="fv-thinking"><span/><span/><span/>{mode==='collect'?'正在整理原文、翻译与表达…':'正在思考…'}</p>}<div ref={bottom}/></div>{error&&<div className="fv-error" role="alert">{error}<button onClick={onSettings}>检查 AI 设置</button><span>原文已保留，可以重试或直接保存。</span></div>}<div className="fv-composer"><div className="fv-compose-modes"><button disabled={busy} aria-pressed={mode==='collect'} onClick={()=>setMode('collect')}><FileText size={15}/>整理收录</button><button disabled={busy} aria-pressed={mode==='chat'} onClick={()=>setMode('chat')}><MessageCircle size={15}/>聊天练习</button><span>仅相关记忆参与对话</span></div><textarea aria-label="发送给学习助教" disabled={busy} value={draft} maxLength={12000} onChange={e=>setDraft(e.target.value)} placeholder={mode==='collect'?'把想学的文章、句子或自我介绍贴在这里…':'说说你想练习什么…'} rows={3} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send();}}}/><div className="fv-compose-bottom"><button onClick={()=>saveRaw()} disabled={!draft.trim()||busy}>直接保存原文</button><button className="fv-send" disabled={!draft.trim()||busy} onClick={()=>void send()} aria-label={mode==='collect'?'整理并收录':'发送消息'}><span>{mode==='collect'?'整理并收录':'发送'}</span><Send size={17}/></button></div></div><MaterialEditor material={raw} open={editor} onOpenChange={setEditor} onSaved={m=>{setSaved(m);setDraft('');onChanged();}}/></div>;
}

export function MemoryManager(){const [memories,setMemories]=useState<LearningMemory[]>([]);const [draft,setDraft]=useState('');const [error,setError]=useState('');const refresh=()=>void listLearningMemories().then(setMemories).catch(e=>setError(errorText(e)));useEffect(refresh,[]);return <section className="fv-settings-card"><div className="fv-section-heading"><h2><Brain size={20}/>学习记忆</h2><span>{memories.length} 条</span></div><p>你的目标、偏好和已确认的信息。可以随时修改或删除。</p><div className="fv-memory-input"><input value={draft} maxLength={600} onChange={e=>setDraft(e.target.value)} aria-label="新增学习记忆" placeholder="例如：先让我完整回答，再集中纠错"/><button className="fv-icon" disabled={!draft.trim()} aria-label="保存学习记忆" onClick={()=>void saveLearningMemory({id:id(),text:draft.trim(),createdAt:now(),source:'user',enabled:true}).then(()=>{setDraft('');refresh();}).catch(e=>setError(errorText(e)))}><Plus/></button></div>{memories.map(m=><div key={m.id} className="fv-memory-row"><input type="checkbox" checked={m.enabled} aria-label={`启用记忆 ${m.text}`} onChange={e=>void saveLearningMemory({...m,enabled:e.target.checked}).then(refresh).catch(e=>setError(errorText(e)))}/><span>{m.text}</span><button className="fv-icon" aria-label={`删除记忆 ${m.text}`} onClick={()=>void deleteLearningMemory(m.id).then(refresh).catch(e=>setError(errorText(e)))}><Trash2 size={16}/></button></div>)}{error&&<p role="alert" className="fv-error">{error}</p>}</section>;}
