import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { SessaoProvider } from './sessao/SessaoProvider'

/*
  Ponto de partida do app. As "camadas" em volta do <App />:
  - BrowserRouter: permite trocar de tela pelo endereço (/inicio, /qr...)
  - SessaoProvider: guarda quem está logado para todas as telas
*/
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessaoProvider>
        <App />
      </SessaoProvider>
    </BrowserRouter>
  </StrictMode>,
)
