import type { AuthError, Session } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import { carregarFuncionario } from '../dados/funcionario'
import type { Funcionario } from '../dados/tipos'
import { emailDaMatricula, MATRICULA_VALIDA, supabase } from '../servicos/supabase'
import { SessaoContexto } from './contexto'

/*
  O Provider "embrulha" o app inteiro (veja main.tsx) e guarda quem está logado.
  O login é do Supabase Auth e fica salvo no celular: ao abrir o app de novo,
  a pessoa continua logada (o QR só sai depois da biometria).
*/

const NAO_E_FUNCIONARIO = 'Seu cadastro não está ativo no app. Procure o RH.'

// Erros do Supabase → mensagens para o funcionário
function traduzir(erro: AuthError | Error): string {
  const msg = erro.message || ''
  if (/invalid login credentials/i.test(msg)) return 'Matrícula ou senha inválida.'
  if ('status' in erro && erro.status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  if (/different from the old password/i.test(msg)) return 'A nova senha precisa ser diferente da atual.'
  if (/weak|at least|characters/i.test(msg)) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.'
  if (/fetch|network|load failed/i.test(msg)) return 'Sem conexão com o servidor. Verifique sua internet.'
  return 'Não foi possível concluir. Tente novamente.'
}

const precisaTrocar = (s: Session | null) => s?.user.user_metadata?.trocar_senha === true

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null)
  const [precisaTrocarSenha, setPrecisaTrocarSenha] = useState(false)

  // Acompanha o login: ao abrir o app, ao entrar, ao sair e ao trocar a senha
  useEffect(() => {
    let montado = true

    async function aplicar(sessao: Session | null) {
      try {
        if (!sessao) {
          setFuncionario(null)
          setPrecisaTrocarSenha(false)
          return
        }
        const f = await carregarFuncionario()
        if (!montado) return
        if (!f) {
          await supabase.auth.signOut() // login de quem não é funcionário ativo
          return
        }
        setFuncionario(f)
        setPrecisaTrocarSenha(precisaTrocar(sessao))
      } catch {
        // sem conexão ao abrir: continua deslogado; a tela de login mostra o erro ao tentar
      } finally {
        if (montado) setCarregando(false)
      }
    }

    const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      // A biblioteca recomenda não chamar o Supabase dentro deste aviso: agenda para logo depois
      setTimeout(() => aplicar(sessao), 0)
    })
    return () => {
      montado = false
      data.subscription.unsubscribe()
    }
  }, [])

  async function entrar(matricula: string, senha: string) {
    if (!MATRICULA_VALIDA.test(matricula.trim())) throw new Error('Matrícula ou senha inválida.')
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailDaMatricula(matricula), password: senha })
    if (error) throw new Error(traduzir(error))

    let f: Funcionario | null
    try {
      f = await carregarFuncionario()
    } catch (e) {
      await supabase.auth.signOut()
      throw new Error(traduzir(e as Error), { cause: e })
    }
    if (!f) {
      await supabase.auth.signOut()
      throw new Error(NAO_E_FUNCIONARIO)
    }
    const trocar = precisaTrocar(data.session)
    setFuncionario(f)
    setPrecisaTrocarSenha(trocar)
    return { precisaTrocarSenha: trocar }
  }

  async function trocarSenha(novaSenha: string) {
    const { error } = await supabase.auth.updateUser({ password: novaSenha, data: { trocar_senha: false } })
    if (error) throw new Error(traduzir(error))
    setPrecisaTrocarSenha(false)
  }

  async function sair() {
    setFuncionario(null)
    setPrecisaTrocarSenha(false)
    await supabase.auth.signOut()
  }

  return (
    <SessaoContexto.Provider
      value={{
        carregando,
        funcionario,
        precisaTrocarSenha,
        entrar,
        trocarSenha,
        sair,
      }}
    >
      {children}
    </SessaoContexto.Provider>
  )
}
