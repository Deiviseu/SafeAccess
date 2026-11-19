import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { supabaseConfigurado } from './servicos/supabase'
import { SessaoProvider } from './sessao/SessaoProvider'

/*
  Ponto de partida do app. As "camadas" em volta do <App />:
  - BrowserRouter: permite trocar de tela pelo endereço (/inicio, /qr...)
  - SessaoProvider: guarda quem está logado para todas as telas
*/
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigurado ? (
      <BrowserRouter>
        <SessaoProvider>
          <App />
        </SessaoProvider>
      </BrowserRouter>
    ) : (
      // Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
      <div className="mx-auto max-w-[430px] p-6 text-center">
        <h1 className="mt-20 text-[22px] font-bold text-marinho">App não configurado</h1>
        <p className="mt-3 text-[15px] text-secundario">
          Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja o arquivo .env.example).
        </p>
      </div>
    )}
  </StrictMode>,
)
