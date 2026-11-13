import * as esbuild from 'esbuild-wasm'
import wasmURL from 'esbuild-wasm/esbuild.wasm?url'

let initialized
function initialize() {
  if (!initialized) initialized = esbuild.initialize({ wasmURL, worker: false })
  return initialized
}
function cleanPath(path) {
  const parts = []
  String(path).replace(/\\/g, '/').split('/').forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') parts.pop()
    else parts.push(part)
  })
  return parts.join('/')
}
function findFile(files, path) {
  const base = cleanPath(path)
  const options = /\.[a-z0-9]+$/i.test(base) ? [base] : [base,base+'.tsx',base+'.ts',base+'.jsx',base+'.js',base+'.mjs',base+'.css',base+'.json',base+'/index.tsx',base+'/index.jsx',base+'/index.ts',base+'/index.js']
  return options.find((candidate) => files[candidate] !== undefined)
}
function makeImportMap(files) {
  let pkg = {}
  try { pkg = JSON.parse(files['package.json'] || '{}') } catch {}
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  const imports = { react:'https://esm.sh/react@18.3.1','react/':'https://esm.sh/react@18.3.1/','react-dom/client':'https://esm.sh/react-dom@18.3.1/client?external=react','react-dom/':'https://esm.sh/react-dom@18.3.1/?external=react' }
  Object.entries(deps).forEach(([name, version]) => {
    if (imports[name]) return
    const v = String(version || 'latest').replace(/^[~^]/, '')
    imports[name] = 'https://esm.sh/' + name + (v && v !== 'latest' ? '@' + v : '')
    imports[name + '/'] = imports[name] + '/'
  })
  return imports
}
export async function compileProject(projectFiles, analysis) {
  await initialize()
  const files = Object.fromEntries(Object.entries(projectFiles || {}).map(([path,value]) => [cleanPath(path),String(value ?? '')]))
  const htmlPath = Object.keys(files).find((path) => /(^|\/)index\.html?$/i.test(path)) || 'index.html'
  const html = files[htmlPath] || ''
  const script = /<script[^>]+type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html) || /<script[^>]+src=["']([^"']+)["'][^>]*type=["']module["']/i.exec(html)
  let entry = analysis && analysis.entry
  if (script) {
    const raw = script[1].replace(/^\//, '')
    entry = findFile(files,raw) || findFile(files,(htmlPath.includes('/') ? htmlPath.slice(0,htmlPath.lastIndexOf('/')+1) : '')+raw) || entry
  }
  entry = entry || ['src/main.jsx','src/main.tsx','src/index.jsx','src/index.tsx','src/main.js','src/index.js','src/App.jsx','src/App.tsx','main.jsx','index.jsx'].find((path) => files[path] !== undefined)
  if (!entry) throw new Error('React entry file nahi mili. src/main.jsx ya src/main.tsx banao.')
  const plugin = { name:'bharat-virtual-project', setup(build) {
    build.onResolve({filter:/.*/}, (args) => {
      if (args.kind === 'entry-point') return {path:cleanPath(args.path),namespace:'bharat'}
      if (args.path.startsWith('.') || args.path.startsWith('/') || args.path.startsWith('@/') || args.path.startsWith('~/')) {
        let requested=args.path
        if(requested.startsWith('@/')) requested='src/'+requested.slice(2)
        if(requested.startsWith('~/')) requested='src/'+requested.slice(2)
        const base=requested.startsWith('/') ? requested.slice(1) : cleanPath((args.importer ? args.importer.slice(0,args.importer.lastIndexOf('/')+1) : '')+requested)
        const hit=findFile(files,base)
        return hit ? {path:hit,namespace:'bharat'} : {errors:[{text:'Project file not found: '+args.path+' (from '+args.importer+')'}]}
      }
      return {path:args.path,external:true}
    })
    build.onLoad({filter:/.*/,namespace:'bharat'}, (args) => {
      const contents=files[args.path]
      if(contents===undefined)return {errors:[{text:'Missing project file: '+args.path}]}
      const ext=args.path.split('.').pop().toLowerCase()
      const loader=ext==='tsx'?'tsx':ext==='ts'?'ts':ext==='jsx'?'jsx':ext==='json'?'json':ext==='css'?'css':['svg','png','jpg','jpeg','webp','gif','woff','woff2'].includes(ext)?'dataurl':'js'
      return {contents,loader,resolveDir:args.path.includes('/')?args.path.slice(0,args.path.lastIndexOf('/')):''}
    })
  }}
  const result=await esbuild.build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'browser',target:['es2020'],jsx:'automatic',sourcemap:'inline',logLevel:'silent',plugins:[plugin]})
  return {js:result.outputFiles.find((file)=>file.path.endsWith('.js'))?.text||'',css:result.outputFiles.filter((file)=>file.path.endsWith('.css')).map((file)=>file.text).join('\n'),imports:makeImportMap(files),warnings:(result.warnings||[]).map((warning)=>warning.text)}
}
