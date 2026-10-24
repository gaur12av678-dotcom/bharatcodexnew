import { useEffect, useMemo, useState } from 'react'
import { Monitor, Smartphone, Tablet, RefreshCw, Terminal, Trash2 } from 'lucide-react'

const escapeScript = (code = '') => code.replace(/<\/script/gi, '<\\/script')

// Console capture — user code ke logs parent ko bhejta hai
const CONSOLE_HOOK = `<script>
(function () {
  var send = function (level, args) {
    var text = args.map(function (a) {
      if (typeof a === 'object' && a !== null) { try { return JSON.stringify(a) } catch (e) { return String(a) } }
      return String(a)
    }).join(' ')
    try { parent.postMessage({ __bc: true, level: level, text: text }, '*') } catch (e) {}
  }
  ;['log', 'info', 'warn', 'error'].forEach(function (level) {
    var orig = console[level]
    console[level] = function () { send(level, Array.prototype.slice.call(arguments)); orig.apply(console, arguments) }
  })
  window.onerror = function (msg, src, line) { send('error', [msg + ' (line ' + line + ')']) }
})()
<\/script>`

// Multi-file support: saari CSS + JS merge, index.html / App.jsx kahi bhi ho
const pick = (files, regex) => Object.keys(files).filter((k) => regex.test(k)).sort()
const findOne = (files, regex) => pick(files, regex)[0]

const buildReactSrcDoc = (files) => {
  const css = pick(files, /\.css$/i).map((k) => files[k]).join('\n')
  const jsx = pick(files, /\.jsx$/i)
    .filter((k) => !/(^|\/)main\.jsx$/i.test(k))   // main.jsx render khud karta hai — skip
    .map((k) => escapeScript(stripImports(files[k])))
    .join('\n\n')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
${CONSOLE_HOOK}
<script type="text/babel" data-presets="react">
${jsx}
const __root = ReactDOM.createRoot(document.getElementById('root'));
__root.render(<App />);
<\/script>
</body>
</html>`
}
// Import/export lines hata do — saari jsx files ek saath compile hoti hain
const stripImports = (code) => code
  .replace(/^\s*import\s[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/export\s+default\s+/g, '')
// Plain HTML/CSS/JS project — index.html ke andar saari CSS + JS inline merge
const buildWebSrcDoc = (files) => {
  const htmlKey = findOne(files, /(^|\/)index\.html?$/i) || findOne(files, /\.html?$/i)
  const css = pick(files, /\.css$/i).map((k) => files[k]).join('\n')
  const js = pick(files, /\.m?js$/i).map((k) => escapeScript(files[k])).join('\n;\n')
  let html = htmlKey ? files[htmlKey] : '<!-- index.html nahi mila -->'
  // local <link rel="stylesheet"> aur <script src> hata do (inline merge ho rahe hain)
  html = html
    .replace(/<link[^>]+rel=["']?stylesheet["']?[^>]*href=["'](?!https?:|\/\/)[^"']+["'][^>]*>/gi, '')
    .replace(/<link[^>]+href=["'](?!https?:|\/\/)[^"']+\.css["'][^>]*>/gi, '')
    .replace(/<script[^>]+src=["'](?!https?:|\/\/)[^"']+["'][^>]*>\s*<\/script>/gi, '')
  const head = `<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n${CONSOLE_HOOK}\n<style>${css}</style>`
  const body = js ? `<script>\n${js}\n<\/script>` : ''
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, head + '\n</head>')
  else html = `<!DOCTYPE html><html><head>${head}</head><body>` + html
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, body + '\n</body>')
  return html + body + (/<body/i.test(html) ? '' : '</body></html>')
}

const VIEWPORTS = {
  mobile: { width: 375, icon: Smartphone },
  tablet: { width: 768, icon: Tablet },
  desktop: { width: '100%', icon: Monitor },
}

const LOG_COLORS = {
  log: 'text-mute', info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400',
}

export default function Preview({ type, files }) {
  const [vp, setVp] = useState('desktop')
  const [reloadKey, setReloadKey] = useState(0)
  const [logs, setLogs] = useState([])
  const [showConsole, setShowConsole] = useState(true)

  const srcDoc = useMemo(
    () => (type === 'react' ? buildReactSrcDoc(files) : buildWebSrcDoc(files)),
    [type, files]
  )

  // iframe se aaye logs suno
  useEffect(() => {
    const handler = (event) => {
      const data = event.data
      if (!data || !data.__bc) return
      setLogs((prev) => [...prev.slice(-199), { level: data.level, text: data.text }])
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const active = VIEWPORTS[vp]

  return (
    <div className="h-full min-h-0 flex flex-col bg-base text-body transition-colors duration-200">
      {/* Toolbar */}
      <div className="min-h-10 shrink-0 flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-edge bg-surface">
        <span className="text-[11px] font-bold text-faint uppercase tracking-widest">Live Preview</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-raise rounded-lg p-1 border border-edge">
          {Object.entries(VIEWPORTS).map(([key, viewport]) => {
            const Icon = viewport.icon
            return (
              <button key={key} type="button" onClick={() => setVp(key)} title={key}
                className={`p-1.5 rounded-md transition ${vp === key ? 'bg-blue-600 text-white' : 'text-mute hover:text-body hover:bg-edge'}`}>
                <Icon size={15} />
              </button>
            )
          })}
        </div>
        <span className="text-[11px] font-mono text-faint bg-raise border border-edge rounded-md px-2 py-1">
          {active.width === '100%' ? 'Full' : `${active.width}px`}
        </span>
        <button type="button" onClick={() => { setReloadKey((k) => k + 1); setLogs([]) }} title="Reload" className="p-1.5 rounded-md text-mute hover:text-body hover:bg-raise transition">
          <RefreshCw size={15} />
        </button>
        <button type="button" onClick={() => setShowConsole((s) => !s)} title="Console"
          className={`p-1.5 rounded-md transition relative ${showConsole ? 'text-blue-400 bg-raise' : 'text-mute hover:text-body hover:bg-raise'}`}>
          <Terminal size={15} />
          {logs.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 overflow-auto p-3 flex justify-center bg-base">
        <div className="bg-white rounded-xl overflow-hidden shadow-2xl ring-1 ring-edge transition-[width] duration-300 shrink-0"
          style={{ width: active.width === '100%' ? '100%' : `${active.width}px`, maxWidth: '100%', height: '100%', minHeight: '200px' }}>
          <iframe key={reloadKey} title="Project live preview" sandbox="allow-scripts" srcDoc={srcDoc} className="block w-full h-full bg-white border-0" />
        </div>
      </div>

      {/* Console panel */}
      {showConsole && (
        <div className="h-36 shrink-0 flex flex-col border-t border-edge bg-surface">
          <div className="flex items-center justify-between px-3 py-1 border-b border-edge">
            <span className="text-[11px] font-bold text-faint uppercase tracking-widest">Console</span>
            <button type="button" onClick={() => setLogs([])} title="Clear console" className="p-1 rounded text-faint hover:text-body">
              <Trash2 size={13} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-faint">console.log() yahan dikhega...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`${LOG_COLORS[log.level] || 'text-mute'} whitespace-pre-wrap break-all`}>
                  {log.level === 'warn' && '⚠ '}{log.level === 'error' && '✖ '}{log.text}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
