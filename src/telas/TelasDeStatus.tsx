import { Check, Clock, ScanFace, WifiOff, X } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CardFuncionario } from '../componentes/CardFuncionario'
import { TelaStatus } from '../componentes/TelaStatus'
import { formatarDataHora, type LeituraQr } from '../dados/funcionario'
import type { Funcionario } from '../dados/tipos'

/*
  Telas de resultado. Todas usam o molde <TelaStatus>,
  só mudando ícone, cores, textos e botões (props!).
*/

// Figma: 05 · Código expirado
export function CodigoExpirado() {
  const navegar = useNavigate()
  return (
    <TelaStatus
      tituloTela="Código expirado"
      Icone={Clock}
      tom="aviso"
      titulo="Seu código expirou"
      texto="Por segurança, cada QR Code tem uma validade limitada. Gere um novo para entrar."
      acoes={
        <>
          {/* Gerar novo código exige a biometria de novo */}
          <Botao onClick={() => navegar('/biometria')}>Gerar novo código</Botao>
          <Botao variante="contorno" onClick={() => navegar('/inicio')}>
            Voltar ao início
          </Botao>
        </>
      }
    />
  )
}

// Figma: 06 · Falha na autenticação
export function FalhaAutenticacao() {
  const navegar = useNavigate()
  return (
    <TelaStatus
      tituloTela="Autenticação"
      Icone={ScanFace}
      tom="erro"
      titulo="Não foi possível reconhecer"
      texto="A biometria não foi reconhecida. Tente novamente no seu dispositivo."
      acoes={
        <>
          <Botao onClick={() => navegar('/biometria')}>Tentar novamente</Botao>
          <Botao variante="contorno" onClick={() => navegar('/inicio')}>
            Cancelar
          </Botao>
        </>
      }
    />
  )
}

// Figma: 07 · Sem conexão
export function SemConexao() {
  const navegar = useNavigate()
  return (
    <TelaStatus
      tituloTela="Conexão indisponível"
      Icone={WifiOff}
      tom="info"
      titulo="Você está sem conexão"
      texto="Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
      conteudo={
        <div className="rounded-cartao bg-branco p-4">
          <p className="text-[16px] font-semibold text-marinho">Precisa entrar agora?</p>
          <p className="mt-2 text-[13px] leading-relaxed text-secundario">
            Se o problema continuar, procure a equipe da portaria para orientação.
          </p>
        </div>
      }
      acoes={
        <>
          <Botao onClick={() => navegar('/biometria')}>Tentar novamente</Botao>
          <Botao variante="contorno" onClick={() => navegar('/inicio')}>
            Voltar ao início
          </Botao>
        </>
      }
    />
  )
}

// Cartões de funcionário + data/hora da leitura na portaria
function DetalhesDoAcesso({ funcionario, quando }: { funcionario: Funcionario; quando: string }) {
  return (
    <>
      <CardFuncionario funcionario={funcionario} />
      <div className="rounded-cartao bg-branco p-4 text-center">
        <p className="text-[17px] font-semibold text-marinho">{formatarDataHora(quando)}</p>
        <p className="mt-1 text-[13px] text-secundario">Portaria · leitura do QR Code</p>
      </div>
    </>
  )
}

// Figma: 08 · Acesso validado (chega aqui quando a portaria lê o QR)
export function AcessoAutorizado({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  const leitura = useLocation().state as LeituraQr | null
  if (!leitura?.quando) return <Navigate to="/inicio" replace />
  const saida = leitura.tipo === 'saida'
  return (
    <TelaStatus
      tituloTela="Resultado do acesso"
      Icone={Check}
      tom="sucesso"
      titulo={saida ? 'Saída registrada' : 'Entrada autorizada'}
      texto={saida ? 'Sua saída foi registrada na portaria. Até a próxima!' : 'A portaria leu seu QR Code. Você já pode seguir para a entrada.'}
      conteudo={<DetalhesDoAcesso funcionario={funcionario} quando={leitura.quando} />}
      acoes={<Botao onClick={() => navegar('/inicio', { replace: true })}>Voltar ao início</Botao>}
    />
  )
}

// Figma: 09 · Acesso recusado
export function AcessoRecusado() {
  const navegar = useNavigate()
  return (
    <TelaStatus
      tituloTela="Resultado do acesso"
      Icone={X}
      tom="erro"
      titulo="Acesso não autorizado"
      texto="Seu acesso não foi liberado. Procure a equipe da portaria."
      acoes={<Botao onClick={() => navegar('/inicio')}>Voltar ao início</Botao>}
    />
  )
}
