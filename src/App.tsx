import { Navigate, Route, Routes } from 'react-router-dom'
import { RotaProtegida } from './componentes/RotaProtegida'
import { Biometria } from './telas/Biometria'
import { Inicio } from './telas/Inicio'
import { Login } from './telas/Login'
import { Perfil } from './telas/Perfil'
import { QrCode } from './telas/QrCode'
import { RecuperarSenha } from './telas/RecuperarSenha'
import {
  AcessoAutorizado,
  AcessoRecusado,
  CodigoExpirado,
  FalhaAutenticacao,
  RecuperacaoEnviada,
  SemConexao,
} from './telas/TelasDeStatus'

/*
  MAPA DO APP: cada endereço (path) mostra uma tela (element).
  Fluxo principal do protótipo:
  Login → Início → Biometria → QR Code → Resultado do acesso
*/
function App() {
  return (
    <Routes>
      {/* Telas abertas (sem login) */}
      <Route path="/" element={<Login />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
      <Route path="/recuperar-senha/enviado" element={<RecuperacaoEnviada />} />

      {/* Telas que exigem login */}
      <Route path="/inicio" element={<RotaProtegida tela={Inicio} />} />
      <Route path="/biometria" element={<RotaProtegida tela={Biometria} />} />
      <Route path="/qr" element={<RotaProtegida tela={QrCode} />} />
      <Route path="/perfil" element={<RotaProtegida tela={Perfil} />} />
      <Route path="/codigo-expirado" element={<RotaProtegida tela={CodigoExpirado} />} />
      <Route path="/falha-autenticacao" element={<RotaProtegida tela={FalhaAutenticacao} />} />
      <Route path="/sem-conexao" element={<RotaProtegida tela={SemConexao} />} />
      <Route path="/acesso/autorizado" element={<RotaProtegida tela={AcessoAutorizado} />} />
      <Route path="/acesso/recusado" element={<RotaProtegida tela={AcessoRecusado} />} />

      {/* Endereço desconhecido → login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
