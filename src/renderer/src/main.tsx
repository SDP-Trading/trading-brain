import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider, applyThemeClass } from './lib/theme'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/sonner'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'

// Antes del primer render, para que no haya destello del tema equivocado.
applyThemeClass()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={400}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>
)
