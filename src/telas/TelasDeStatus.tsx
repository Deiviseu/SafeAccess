import { Check, Clock, ScanFace, WifiOff, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CardFuncionario } from '../componentes/CardFuncionario'
import { Mensagem } from '../componentes/Mensagem'
import { TelaStatus } from '../componentes/TelaStatus'
import type { Funcionario } from '../dados/demo'

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

// Cartões de funcionário + data/hora, usados nas duas telas de resultado
function DetalhesDoAcesso({ funcionario }: { funcionario: Funcionario }) {
  return (
    <>
      <CardFuncionario funcionario={funcionario} />
      <div className="rounded-cartao bg-branco p-4 text-center">
        <p className="text-[17px] font-semibold text-marinho">10 nov 2026 · 07:42</p>
        <p className="mt-1 text-[13px] text-secundario">Portaria principal · dados demonstrativos</p>
      </div>
    </>
  )
}

// Figma: 08 · Acesso validado
export function AcessoAutorizado({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  return (
    <TelaStatus
      tituloTela="Resultado do acesso"
      Icone={Check}
      tom="sucesso"
      titulo="Acesso autorizado"
      texto="Sua identidade foi validada. Você já pode seguir para a entrada."
      conteudo={<DetalhesDoAcesso funcionario={funcionario} />}
      acoes={<Botao onClick={() => navegar('/inicio')}>Voltar ao início</Botao>}
    />
  )
}

// Figma: 09 · Acesso recusado
export function AcessoRecusado({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  return (
    <TelaStatus
      tituloTela="Resultado do acesso"
      Icone={X}
      tom="erro"
      titulo="Acesso não autorizado"
      texto="Seu acesso está fora do horário permitido nesta demonstração. Procure a portaria."
      conteudo={<DetalhesDoAcesso funcionario={funcionario} />}
      acoes={<Botao onClick={() => navegar('/inicio')}>Voltar ao início</Botao>}
    />
  )
}

// Figma: 19 · Recuperação enviada
export function RecuperacaoEnviada() {
  const navegar = useNavigate()
  return (
    <TelaStatus
      tituloTela="Recuperação de acesso"
      Icone={Check}
      tom="sucesso"
      corTitulo="text-marinho"
      titulo="Orientações disponíveis"
      texto="Em um ambiente real, você receberá as instruções pelo canal cadastrado. Se precisar de ajuda, procure o RH."
      conteudo={<Mensagem tipo="aviso">Simulação: nenhuma mensagem foi enviada.</Mensagem>}
      acoes={<Botao onClick={() => navegar('/')}>Voltar ao login</Botao>}
    />
  )
}
