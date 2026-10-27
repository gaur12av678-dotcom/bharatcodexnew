import { useState } from 'react'
import { X, ClipboardPaste } from 'lucide-react'

// Mobile par Monaco editor me long-press paste kai baar kaam nahi karta.
// Yahan ek normal text box hai — isme paste hamesha chalta hai.
export default function PasteBox({ fileName, initialMode = 'insert', onApply, onClose }) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState(initialMode) // 'insert' = cursor par, 'replace' = poori file
  const [note, setNote] = useState('')

  const fromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { setText(t); setNote('') } else setNote('Clipboard khaali hai.')
    } catch {
      setNote('Browser ne clipboard nahi padhne diya. Box me long-press karke Paste dabao.')
    }
  }

  const apply = () => {
    if (!text) return
    if (mode === 'replace' && !window.confirm(`"${fileName}" ka poora code is naye code se badal dena hai?\n\n(Purana code History me bacha rahega.)`)) return
    onApply(text, mode)
  }

  const modeBtn = (key, label) => (
    <button type="button" onClick={() => setMode(key)}
      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition ${mode === key ? 'bg-blue-600 text-white' : 'text-mute hover:text-body'}`}>
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-xl max-h-[92dvh] flex flex-col bg-surface border border-edge rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <h2 className="flex items-center gap-2 text-sm font-bold text-body truncate">
            <ClipboardPaste size={16} className="text-blue-400 shrink-0" /> Code paste karo — <span className="text-mute font-medium truncate">{fileName}</span>
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-mute hover:text-body hover:bg-raise"><X size={18} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3 min-h-0">
          <div className="flex bg-raise border border-edge rounded-lg p-0.5">
            {modeBtn('insert', 'Cursor par daalo')}
            {modeBtn('replace', 'Poori file replace')}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Yahan long-press karke Paste karo..."
            className="w-full h-56 sm:h-72 resize-none bg-raise border border-edge rounded-lg p-3 font-mono text-xs text-body placeholder-faint focus:outline-none focus:border-blue-500"
          />
          {note && <p className="text-xs text-yellow-400">{note}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={fromClipboard} className="px-3 py-2 rounded-lg text-xs font-semibold text-mute bg-raise hover:text-body border border-edge">Clipboard se lo</button>
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-semibold text-mute hover:text-body">Cancel</button>
            <button type="button" onClick={apply} disabled={!text}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white">
              {mode === 'replace' ? 'Replace karo' : 'Daalo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
