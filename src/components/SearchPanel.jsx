import { useMemo, useState } from 'react'
import { Search, X, FileCode2 } from 'lucide-react'

const pathOf = (f) => (f.folder ? f.folder + '/' + f.name : f.name)
const MAX_MATCHES = 300

// Project-wide search: saari files me dhoondo, result pe click karo to file wahi line pe khulegi
export default function SearchPanel({ files, onOpen, onClose }) {
  const [q, setQ] = useState('')
  const [caseSens, setCaseSens] = useState(false)

  const results = useMemo(() => {
    const term = q.trim()
    if (term.length < 2) return { groups: [], total: 0, capped: false }
    const needle = caseSens ? term : term.toLowerCase()
    const groups = []
    let total = 0
    let capped = false
    for (const f of files) {
      const lines = String(f.content || '').split('\n')
      const hits = []
      for (let i = 0; i < lines.length; i++) {
        const hay = caseSens ? lines[i] : lines[i].toLowerCase()
        if (hay.includes(needle)) {
          if (total >= MAX_MATCHES) { capped = true; break }
          total++
          hits.push({ line: i + 1, text: lines[i].trim().slice(0, 160) })
        }
      }
      if (hits.length) groups.push({ path: pathOf(f), hits })
      if (capped) break
    }
    return { groups, total, capped }
  }, [q, caseSens, files])

  return (
    <div className="h-full flex flex-col bg-surface border-r border-edge min-h-0">
      <div className="p-2 border-b border-edge flex items-center gap-1.5">
        <div className="flex-1 flex items-center gap-1.5 bg-raise border border-edge rounded-md px-2">
          <Search size={13} className="text-faint shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Saari files me dhoondo"
            className="flex-1 min-w-0 bg-transparent py-1.5 text-xs text-body outline-none placeholder:text-faint"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} className="text-faint hover:text-body" title="Clear">
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCaseSens((c) => !c)}
          title="Capital / small letter alag maano"
          className={`px-1.5 py-1 rounded-md text-[11px] font-bold border ${caseSens ? 'bg-blue-600 text-white border-blue-600' : 'text-mute border-edge hover:bg-raise'}`}
        >
          Aa
        </button>
        {onClose && (
          <button type="button" onClick={onClose} title="Search band karo" className="p-1 rounded-md text-faint hover:text-body hover:bg-raise">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 text-xs">
        {q.trim().length < 2 ? (
          <p className="p-3 text-faint">Kam se kam 2 akshar likho. (Ctrl+Shift+F se kahin se bhi khol sakte ho)</p>
        ) : results.total === 0 ? (
          <p className="p-3 text-faint">Kuch nahi mila.</p>
        ) : (
          <>
            <p className="px-3 py-1.5 text-[11px] text-faint">
              {results.total}{results.capped ? '+' : ''} match, {results.groups.length} file me
            </p>
            {results.groups.map((g) => (
              <div key={g.path} className="mb-1">
                <div className="flex items-center gap-1.5 px-3 py-1 text-body font-semibold bg-raise/60">
                  <FileCode2 size={12} className="shrink-0" />
                  <span className="truncate">{g.path}</span>
                  <span className="ml-auto text-faint font-normal">{g.hits.length}</span>
                </div>
                {g.hits.map((h) => (
                  <button
                    key={g.path + h.line}
                    type="button"
                    onClick={() => onOpen(g.path, h.line)}
                    className="w-full text-left flex gap-2 px-3 py-1 hover:bg-raise text-mute"
                  >
                    <span className="text-faint w-7 shrink-0 text-right">{h.line}</span>
                    <span className="truncate font-mono">{h.text}</span>
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
