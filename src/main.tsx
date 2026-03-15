import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import GameSelect from './pages/GameSelect.tsx'
import AuditionGame from './pages/AuditionGame.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/game">
      <Routes>
        <Route path="/" element={<GameSelect />} />
        <Route path="/snake" element={<App />} />
        <Route path="/audition" element={<AuditionGame />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
