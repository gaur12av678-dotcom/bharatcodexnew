import { useMemo, useState } from 'react'
import {
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
} from 'lucide-react'

// User code mein </script> aaye to script tag prematurely close na ho.
const escapeScript = (code = '') =>
  code.replace(/<\/script/gi, '<\\/script')

const buildWebSrcDoc = (files) => `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>${files['style.css'] || ''}</style>
</head>
<body>
${files['index.html'] || ''}
<script>${escapeScript(files['script.js'] || '')}<\/script>
</body>
</html>`

const buildReactSrcDoc = (files) => `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
<style>${files['styles.css'] || ''}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
${escapeScript(files['App.jsx'] || '')}
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
    () =>
      type === 'react'
        ? buildReactSrcDoc(files)
        : buildWebSrcDoc(files),
    [type, files]
  )

  const active = VIEWPORTS[vp]

  return (
    <div className="h-full min-h-0 flex flex-col bg-base text-body transition-colors duration-200">
      {/* Preview toolbar */}
      <div className="min-h-10 shrink-0 flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-edge bg-surface">
        <span className="text-[11px] font-bold text-faint uppercase tracking-widest">
          Live Preview
        </span>

        <div className="flex-1" />

        {/* Responsive viewport selector */}
        <div className="flex items-center gap-1 bg-raise rounded-lg p-1 border border-edge">
          {Object.entries(VIEWPORTS).map(([key, viewport]) => {
            const Icon = viewport.icon
            const selected = vp === key

            return (
              <button
                key={key}
                type="button"
                onClick={() => setVp(key)}
                title={`${key.charAt(0).toUpperCase()}${key.slice(1)} preview`}
                aria-label={`${key} preview`}
                aria-pressed={selected}
                className={`p-1.5 rounded-md transition ${
                  selected
                    ? 'bg-blue-600 text-white'
                    : 'text-mute hover:text-body hover:bg-edge'
                }`}
              >
                <Icon size={15} />
              </button>
            )
          })}
        </div>

        {/* Current viewport width */}
        <span className="text-[11px] font-mono text-faint bg-raise border border-edge rounded-md px-2 py-1">
          {active.width === '100%'
            ? 'Full'
            : `${active.width}px`}
        </span>

        {/* Reload */}
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          title="Reload preview"
          aria-label="Reload preview"
          className="p-1.5 rounded-md text-mute hover:text-body hover:bg-raise transition"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Preview canvas */}
      <div className="flex-1 min-h-0 overflow-auto p-3 flex justify-center bg-base">
        <div
          className="bg-white rounded-xl overflow-hidden shadow-2xl ring-1 ring-edge transition-[width] duration-300 shrink-0"
          style={{
            width:
              active.width === '100%'
                ? '100%'
                : `${active.width}px`,
            maxWidth: '100%',
            height: '100%',
            minHeight: '200px',
          }}
        >
          <iframe
            key={reloadKey}
            title="Project live preview"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="block w-full h-full bg-white border-0"
          />
        </div>
      </div>
    </div>
  )
}

