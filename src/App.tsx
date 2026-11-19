import { Navigate, Route, Routes } from 'react-router-dom'
import { RotaProtegida } from './componentes/RotaProtegida'
import { Biometria } from './telas/Biometria'
import { Convite } from './telas/Convite'
import { Inicio } from './telas/Inicio'
import { Login } from './telas/Login'
import { Perfil } from './telas/Perfil'
import { QrCode } from './telas/QrCode'
import { RecuperarSenha } from './telas/RecuperarSenha'
import { TrocarSenha } from './telas/TrocarSenha'
import {
  AcessoAutorizado,
  AcessoRecusado,
  CodigoExpirado,
  FalhaAutenticacao,
  SemConexao,
} from './telas/TelasDeStatus'

/*
  MAPA DO APP: cada endereço (path) mostra uma tela (element).
  Fluxo principal:
  Convite do RH → Login → (Trocar senha no 1º acesso) → Cadastrar celular
  Início → Biometria → QR Code → Resultado do acesso (quando a portaria lê)
*/
function App() {
  return (
    <Routes>
      {/* Telas abertas (sem login) */}
      <Route path="/" element={<Login />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
      {/* Link do QR que o RH mostra: cadastra o celular (pede login se precisar) */}
      <Route path="/convite" element={<Convite />} />

      {/* Logado, mas fora da RotaProtegida: é o caminho obrigatório do 1º acesso */}
      <Route path="/trocar-senha" element={<TrocarSenha />} />

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
