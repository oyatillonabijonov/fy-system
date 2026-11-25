// The public anketa page on its own (2026-11-25): a client opening the link on a phone used to download the whole
// staff app — 1.1 MB of script — before the form appeared (~5 s). This entry carries only what the form needs.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { Anketa } from './components/pages/Anketa'

export function mount(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <ThemeProvider>
          <Routes>
            <Route path="/anketa/:token" element={<Anketa />} />
          </Routes>
        </ThemeProvider>
      </BrowserRouter>
    </StrictMode>,
  )
}
