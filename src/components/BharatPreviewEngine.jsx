import { useEffect, useState } from 'react'
import { compileProject } from '../utils/previewCompiler.js'
function makeDocument(result) {
  const importMap=JSON.stringify({imports:result.imports}).replace(/</g,'\\u003c')
  const css=result.css?'<style>'+result.css.replace(/<\/style/gi,'<\\/style')+'</style>':''
  const js=result.js.replace(/<\/script/gi,'<\\/script')
  return ['<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">','<script type="importmap">'+importMap+'</script>',css,'<style>html,body,#root{min-height:100%;margin:0}body{font-family:Inter,system-ui,sans-serif}</style>','</head><body><div id="root"></div>','<script>(function(){const send=(level,args)=>{try{parent.postMessage({__bc:true,level,text:Array.from(args).map(v=>{try{return typeof v==="string"?v:JSON.stringify(v)}catch{return String(v)}}).join(" ")},"*")}catch{}};["log","info","warn","error"].forEach(k=>{const old=console[k];console[k]=function(){send(k,arguments);old.apply(console,arguments)}});window.addEventListener("error",e=>send("error",[e.message+" (line "+(e.lineno||0)+")"]));window.addEventListener("unhandledrejection",e=>send("error",[e.reason&&e.reason.message||e.reason]));})();</script>','<script type="module">\n',js,'\n</script></body></html>'].join('')
}
export default function BharatPreviewEngine({files,analysis,reloadKey,onStatus,onError,onLog}) {
  const [documentHtml,setDocumentHtml]=useState('')
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    setError('');setDocumentHtml('');onStatus?.('running');onError?.(null)
    compileProject(files,analysis).then((result)=>{
      if(!active)return
      setDocumentHtml(makeDocument(result));onStatus?.('done')
      result.warnings.forEach((warning)=>onLog?.('Compiler warning: '+warning))
    }).catch((err)=>{
      if(!active)return
      const message=err?.errors?.map((item)=>item.text).join('\n')||err?.message||String(err)
      setError(message);onStatus?.('error');onError?.({message});onLog?.('Preview build failed: '+message)
    })
    return ()=>{active=false}
  },[files,analysis,reloadKey,onStatus,onError,onLog])
  return <div className="relative w-full h-full bg-white">{documentHtml?<iframe title="Bharat Codex live preview" sandbox="allow-scripts allow-forms allow-modals allow-popups" srcDoc={documentHtml} className="block w-full h-full border-0 bg-white"/>:<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center bg-white text-slate-700">{error?<><strong className="text-red-600">Preview build error</strong><pre className="max-w-full max-h-48 overflow-auto whitespace-pre-wrap break-words text-left text-xs">{error}</pre></>:<><span className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"/><span className="text-sm">Bharat Preview Engine compiling project…</span></>}</div>}</div>
}
