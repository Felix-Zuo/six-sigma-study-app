import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { put, get } from '@vercel/blob';
const args=process.argv.slice(2);const option=name=>args[args.indexOf(name)+1];
if(!args.includes('--config')||!args.includes('--apk')) throw new Error('Pass --config outside the repository and --apk.');
const configPath=path.resolve(option('--config'));const root=path.resolve('.');
if(configPath.startsWith(root+path.sep)) throw new Error('Credentials must stay outside the repository.');
const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));const apk=path.resolve(option('--apk'));
const size=fs.statSync(apk).size;const bytes=fs.readFileSync(apk);const sha256=createHash('sha256').update(bytes).digest('hex');
const pathname='releases/fly-view-0.9.0.apk';
await put(pathname,bytes,{access:'private',token:cfg.blobToken,addRandomSuffix:false,allowOverwrite:true,contentType:'application/vnd.android.package-archive'});
const result=await get(pathname,{access:'private',token:cfg.blobToken,useCache:false});
if(!result||result.statusCode!==200)throw new Error('Private upload verification failed.');
const digest=createHash('sha256');let received=0;for await(const chunk of result.stream){digest.update(chunk);received+=chunk.length;}
if(received!==size||digest.digest('hex')!==sha256)throw new Error('Uploaded APK hash mismatch.');
const manifest={version:'0.9.0-beta',versionCode:900,notes:['新增聊天收录与分类材料库，文章直接进入双语阅读。','新增可管理的学习记忆、个人空间同步与备份恢复。','重构手机首页、导航和阅读工具栏，修复存储与语境复用问题。','新增经过完整性及签名校验的应用内更新。'],apkUrl:cfg.endpoint+'/api/download',sha256,size,publishedAt:new Date().toISOString()};
fs.writeFileSync('server/release-manifest.mjs','// Verified private APK; public metadata contains no credentials.\nexport const releaseManifest = '+JSON.stringify(manifest,null,2)+';\n');
console.log(JSON.stringify({uploaded:true,verified:true,size,sha256,manifest:'server/release-manifest.mjs'}));
