import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AuthGate from './components/AuthGate.tsx'
import ConsentBanner from './components/ConsentBanner.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>{(account) => <App account={account} />}</AuthGate>
    <ConsentBanner />
  </StrictMode>,
)
