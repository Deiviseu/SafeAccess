import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CampoTexto } from '../componentes/CampoTexto'
import { Carregando } from '../componentes/Carregando'
import { LayoutTela } from '../componentes/LayoutTela'
import { Mensagem } from '../componentes/Mensagem'
import { lerConvite } from '../dados/convite'
import { useSessao } from '../sessao/useSessao'

/*
  Troca de senha.
  - Obrigatória no primeiro acesso e depois que o RH redefine a senha
    (o login vem marcado com trocar_senha = true).
  - Também pode ser aberta pelo Perfil, quando o funcionário quiser.
*/
export function TrocarSenha() {
  const navegar = useNavigate()
  const { carregando, funcionario, precisaTrocarSenha, trocarSenha, sair } = useSessao()
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (carregando) return <Carregando />
  if (!funcionario) return <Navigate to="/" replace />

  function validar(): string {
    if (nova.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
    if (!/[A-Za-z]/.test(nova) || !/\d/.test(nova)) return 'Misture letras e números.'
    if (nova.toLowerCase().includes(funcionario!.matricula.toLowerCase())) return 'Não use a sua matrícula na senha.'
    if (nova !== confirmacao) return 'As duas senhas não são iguais.'
    return ''
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const problema = validar()
    if (problema) {
      setErro(problema)
      return
    }
    setEnviando(true)
    try {
      await trocarSenha(nova)
      navegar(lerConvite() ? '/convite' : '/inicio', { replace: true, state: { senhaTrocada: true } })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <LayoutTela titulo={precisaTrocarSenha ? 'Crie sua senha' : 'Alterar senha'}>
      <p className="text-[15px] leading-relaxed text-secundario">
        {precisaTrocarSenha
          ? `Olá, ${funcionario.primeiroNome}. Por segurança, troque a senha que o RH entregou por uma só sua.`
          : 'Escolha uma nova senha para entrar no app.'}
      </p>

      <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
        <CampoTexto
          rotulo="Nova senha"
          type="password"
          autoComplete="new-password"
          value={nova}
          onChange={(e) => {
            setNova(e.target.value)
            setErro('')
          }}
        />
        <CampoTexto
          rotulo="Confirme a nova senha"
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => {
            setConfirmacao(e.target.value)
            setErro('')
          }}
        />
        <p className="text-[13px] text-secundario">Pelo menos 8 caracteres, com letras e números.</p>

        {erro && <Mensagem tipo="erro">{erro}</Mensagem>}

        <Botao type="submit" className="mt-2" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar senha'}
        </Botao>
        {precisaTrocarSenha ? (
          <Botao variante="contorno" onClick={async () => { await sair(); navegar('/', { replace: true }) }}>
            Sair
          </Botao>
        ) : (
          <Botao variante="contorno" onClick={() => navegar('/perfil')}>
            Cancelar
          </Botao>
        )}
      </form>
    </LayoutTela>
  )
}
