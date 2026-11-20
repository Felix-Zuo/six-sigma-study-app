// Isolated Chromium profile and synthetic materials only. No personal data or services.
// Run: node tests/material-library.test.mjs (optional CHROME_PATH / QA_SCREENSHOT_DIR).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const browserPath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
if (!browserPath) throw new Error('Set CHROME_PATH to a Chromium executable.');
const compiled = await build({ entryPoints: ['tests/material-library.browser.tsx'], bundle: true, write: false, outdir: 'unused', platform: 'browser', format: 'esm', jsx: 'automatic', target: 'es2022', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'dataurl', '.woff': 'dataurl' } });
const js = compiled.outputFiles.find(file=>file.path.endsWith('.js')).text;
const css = compiled.outputFiles.find(file=>file.path.endsWith('.css')).text;
const server = http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':req.url==='/app.css'?'text/css':'text/html');res.end(req.url==='/app.js'?js:req.url==='/app.css'?css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fly View library QA</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'fly-view-library-qa-'));
const screenshots=path.resolve(process.env.QA_SCREENSHOT_DIR??path.join(os.tmpdir(),'fly-view-library-screenshots'));
const browser=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws;
try {
  for(let i=0;i<100&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++)await delay(100);
  const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
  const pages=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let id=0;const pending=new Map();
  ws.addEventListener('message',event=>{const data=JSON.parse(event.data);const request=pending.get(data.id);if(request){pending.delete(data.id);clearTimeout(request.timer);data.error?request.reject(new Error(JSON.stringify(data.error))):request.resolve(data.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const callId=++id;const timer=setTimeout(()=>reject(new Error(`CDP timed out: ${method}`)),20000);pending.set(callId,{resolve,reject,timer});ws.send(JSON.stringify({id:callId,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result?.value;};
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});
  for(let i=0;i<100;i++){if(await evaluate('Boolean(window.qaLibrary)'))break;await delay(100);}
  const checks=await evaluate('window.qaLibrary.run()');
  fs.mkdirSync(screenshots,{recursive:true});
  for(const width of [390,320,768]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});await delay(80);
    const layout=await evaluate(`(()=>({overflow:document.documentElement.scrollWidth>innerWidth,smallTargets:[...document.querySelectorAll('.fv-library-browser button')].filter(el=>el.getBoundingClientRect().height>0&&el.getBoundingClientRect().height<43.5).map(el=>el.textContent),cardCount:document.querySelectorAll('.fv-material-card').length}))()`);
    if(layout.overflow||layout.smallTargets.length||layout.cardCount!==3)throw new Error(`Layout at ${width}px: ${JSON.stringify(layout)}`);
    const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(screenshots,`library-reading-${width}.png`),Buffer.from(image.data,'base64'));
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('window.qaLibrary.render(window.qaLibrary.fixtures,true)');await delay(60);
  const dark=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(screenshots,'library-reading-dark.png'),Buffer.from(dark.data,'base64'));
  console.log(JSON.stringify({ok:true,checks,widths:[320,390,768],screenshots},null,2));
} finally {
  ws?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const resolved=path.resolve(profile);
  if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('fly-view-library-qa-'))try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{/* Temp profile may remain briefly locked by Chromium. */}
}
