import { Check, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { Carregando } from '../componentes/Carregando'
import { LayoutTela } from '../componentes/LayoutTela'
import { Mensagem } from '../componentes/Mensagem'
import { capturarConviteDoEndereco, esquecerConvite, lerConvite } from '../dados/convite'
import { cadastrarCelular, ErroPasskey, navegadorSuportaBiometria } from '../servicos/passkey'
import { useSessao } from '../sessao/useSessao'

/*
  Cadastro do celular (aberta pelo QR que o RH mostra).
  Segurança: além do convite, a pessoa precisa estar logada com a
  matrícula e a senha DELA. Quem fotografar o QR do RH não consegue usar.
*/

// Roda uma vez, quando o arquivo carrega: guarda o token do link antes de qualquer redirecionamento
capturarConviteDoEndereco()

type Etapa = 'inicial' | 'cadastrando' | 'pronto'

export function Convite() {
  const navegar = useNavigate()
  const { carregando, funcionario, precisaTrocarSenha } = useSessao()
  const [etapa, setEtapa] = useState<Etapa>('inicial')
  const [erro, setErro] = useState('')
  const [token, setToken] = useState(() => {
    capturarConviteDoEndereco() // caso o link tenha sido aberto com o app já aberto
    return lerConvite()
  })

  // Outro QR lido com esta tela aberta: só o "#" muda e a página não recarrega
  useEffect(() => {
    function novoLink() {
      capturarConviteDoEndereco()
      setToken(lerConvite())
      setErro('')
      setEtapa('inicial')
    }
    window.addEventListener('hashchange', novoLink)
    return () => window.removeEventListener('hashchange', novoLink)
  }, [])

  if (carregando) return <Carregando />
  if (funcionario && precisaTrocarSenha) return <Navigate to="/trocar-senha" replace />

  if (!token && etapa !== 'pronto') {
    return (
      <LayoutTela titulo="Cadastrar celular">
        <Mensagem tipo="aviso">Convite não encontrado. Leia de novo o QR Code que o RH mostrou.</Mensagem>
        <Botao className="mt-6" onClick={() => navegar('/')}>
          Ir para o app
        </Botao>
      </LayoutTela>
    )
  }

  async function cadastrar() {
    setErro('')
    setEtapa('cadastrando')
    try {
      await cadastrarCelular(token!)
      esquecerConvite()
      setEtapa('pronto')
    } catch (e) {
      const falha = e as ErroPasskey
      if (falha.codigo === 'convite' || falha.codigo === 'ja_cadastrado') esquecerConvite()
      setErro(falha.message)
      setEtapa('inicial')
    }
  }

  const pronto = etapa === 'pronto'

  return (
    <LayoutTela titulo={pronto ? 'Tudo pronto!' : 'Cadastrar este celular'}>
      <div className="mt-2 flex flex-col items-center text-center">
        <div
          className={`flex size-30 items-center justify-center rounded-full ${
            pronto ? 'bg-sucesso-claro text-sucesso' : 'bg-info-claro text-institucional'
          }`}
        >
          {pronto ? <Check size={40} aria-hidden /> : <Smartphone size={40} strokeWidth={1.6} aria-hidden />}
        </div>
        <div aria-live="polite">
          <h2 className="mt-8 text-[24px] font-bold text-marinho">
            {pronto ? 'Celular cadastrado' : 'Use a biometria deste celular'}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-secundario">
            {pronto
              ? 'Agora você já pode gerar seu QR Code de acesso com a digital ou o rosto.'
              : funcionario
                ? `${funcionario.primeiroNome}, confirme com a digital, o rosto ou o PIN deste celular. Ela fica só no aparelho.`
                : 'Para continuar, entre com a sua matrícula e senha.'}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {erro && <Mensagem tipo="erro">{erro}</Mensagem>}

        {!funcionario && <Botao onClick={() => navegar('/')}>Entrar</Botao>}

        {funcionario && !pronto && !navegadorSuportaBiometria() && (
          <Mensagem tipo="aviso">
            Este navegador não permite biometria. Abra o link no Chrome (Android) ou no Safari (iPhone).
          </Mensagem>
        )}

        {funcionario && !pronto && navegadorSuportaBiometria() && lerConvite() && (
          <Botao onClick={cadastrar} disabled={etapa === 'cadastrando'}>
            {etapa === 'cadastrando' ? 'Aguardando a biometria…' : 'Cadastrar com biometria'}
          </Botao>
        )}

        {funcionario && (pronto || !lerConvite()) && (
          <Botao onClick={() => navegar('/inicio', { replace: true })}>Ir para o início</Botao>
        )}
      </div>
    </LayoutTela>
  )
}
