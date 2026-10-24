import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import ErrorConsole, { ErrorBoundary, startErrorCapture } from './components/ErrorConsole.jsx'

// Saare errors pakadne shuru karo (console.error, crash, promise errors)
startErrorCapture()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <ErrorConsole />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
)
