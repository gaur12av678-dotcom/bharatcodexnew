import { useMemo, useState } from 'react'
import { Monitor, Smartphone, Tablet, RefreshCw } from 'lucide-react'

// </script> tag user code me aaye to preview break na ho
const escapeScript = (code) => code.replace(/<\/script>/gi, '<\\/script>')

const buildWebSrcDoc = (f) => `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>${f['style.css'] || ''}</style>
</head>
<body>
${f['index.html'] || ''}
<script>${escapeScript(f['script.js'] || '')}<\/script>
</body>
</html>`

const buildReactSrcDoc = (f) => `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
<style>${f['styles.css'] || ''}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
${escapeScript(f['App.jsx'] || '')}
const __root = ReactDOM.createRoot(document.getElementById('root'));
__root.render(<App />);
<\/script>
</body>
</html>`

const VIEWPORTS = {
  mobile: { width: 375, icon: Smartphone },
  tablet: { width: 768, icon: Tablet },
  desktop: { width: '100%', icon: Monitor },
}

export default function Preview({ type, files }) {
  const [vp, setVp] = useState('desktop')
  const [reloadKey, setReloadKey] = useState(0)

  const srcDoc = useMemo(
    () => (type === 'react' ? buildReactSrcDoc(files) : buildWebSrcDoc(files)),
    [type, files]
  )

  const active = VIEWPORTS[vp]

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <div className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-slate-800">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
          Live Preview
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
          {Object.entries(VIEWPORTS).map(([key, v]) => (
            <button
              key={key}
              onClick={() => setVp(key)}
              title={key}
              className={`p-1.5 rounded-md transition ${
                vp === key ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <v.icon size={15} />
            </button>
          ))}
        </div>
        <span className="text-[11px] font-mono text-slate-500 bg-slate-900 border border-slate-800 rounded-md px-2 py-1">
          {active.width === '100%' ? 'Full' : `${active.width}px`}
        </span>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          title="Reload preview"
          className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-slate-800 transition"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 flex justify-center">
        <div
          className="bg-white rounded-xl overflow-hidden shadow-2xl ring-1 ring-slate-800 transition-all duration-300"
          style={{
            width: active.width === '100%' ? '100%' : active.width,
            maxWidth: '100%',
            height: '100%',
          }}
        >
          <iframe
            key={reloadKey}
            title="preview"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="w-full h-full bg-white"
          />
        </div>
      </div>
    </div>
  )
}
