import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './firebase'
import App from './App.tsx'
import { initGlobalTerminalLogging } from './utils/terminalLogger'

// Initialize piping client-side logs to the Vite dev server terminal
initGlobalTerminalLogging()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
