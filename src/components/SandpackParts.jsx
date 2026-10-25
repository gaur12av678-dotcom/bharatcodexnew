// Sandpack (browser me chalne wala Vite/React runtime) ke tukde.
// Ye file Preview.jsx se "lazy" load hoti hai, taaki baaki app halka rahe.
import { useEffect } from 'react'
import { SandpackProvider, SandpackPreview, SandpackConsole, useSandpack } from '@codesandbox/sandpack-react'

const FIX_CSS = `
.sp-wrapper { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.sp-wrapper .sp-preview, .sp-wrapper .sp-preview-container, .sp-wrapper .sp-preview-iframe { height: 100% !important; width: 100% !important; }
.sp-wrapper .sp-console { height: 100% !important; }
`

export function Shell({ files, theme, entry, externalResources, children }) {
  return (
    <SandpackProvider
      template="react"
      theme={theme}
      files={files}
      customSetup={entry ? { entry } : undefined}
      options={{ autorun: true, recompileMode: 'delayed', recompileDelay: 600, externalResources: externalResources || [] }}
    >
      <style>{FIX_CSS}</style>
      <div className="h-full min-h-0 flex flex-col">{children}</div>
    </SandpackProvider>
  )
}

export function PreviewPane() {
  return (
    <SandpackPreview
      showNavigator={false}
      showRefreshButton={false}
      showOpenInCodeSandbox={false}
      showOpenNewtab={false}
      showRestartButton={false}
      style={{ height: '100%', width: '100%' }}
    />
  )
}

export function ConsolePane() {
  return <SandpackConsole showHeader={false} resetOnPreviewRestart style={{ height: '100%' }} />
}

// Sandpack ki status / errors ko parent tak pahunchata hai (kuch render nahi karta)
export function Bridge({ onStatus, onError, onLog }) {
  const { sandpack, listen } = useSandpack()

  useEffect(() => {
    onStatus(sandpack.status)
    onLog('status: ' + sandpack.status)
  }, [sandpack.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const e = sandpack.error
    onError(e ? { message: e.message, path: e.path, line: e.line } : null)
  }, [sandpack.error]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stop = listen((msg) => {
      if (msg.type === 'action' && msg.action === 'show-error') {
        onError({ message: msg.message || msg.title, path: msg.path, line: msg.line })
        onLog('error: ' + (msg.title || msg.message))
      }
      if (msg.type === 'done') {
        if (!msg.compilatonError) onError(null)
        onLog(msg.compilatonError ? 'build done, error ke saath' : 'build done')
      }
    })
    return stop
  }, [listen]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
