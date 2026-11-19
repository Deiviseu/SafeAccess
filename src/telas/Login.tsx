import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CampoTexto } from '../componentes/CampoTexto'
import { Carregando } from '../componentes/Carregando'
import { Mensagem } from '../componentes/Mensagem'
import { useSessao } from '../sessao/useSessao'

/*
  Figma: 01 · Login, 11 · Login preenchido, 12 · Senha visível e 13 · Login inválido.
  Agora o login é real (Supabase Auth): a matrícula vira o e-mail interno
  <matricula>@funcionarios.sacchelli.com.br, igual ao criado pelo RH na portaria.
*/
export function Login() {
  const navegar = useNavigate()
  const { carregando, funcionario, precisaTrocarSenha, entrar } = useSessao()

  // Estado = valores que mudam e fazem a tela se redesenhar
  const [matricula, setMatricula] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Já está logado (login salvo no celular)? Pula o login.
  if (carregando) return <Carregando />
  if (funcionario) return <Navigate to={precisaTrocarSenha ? '/trocar-senha' : '/inicio'} replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault() // impede o navegador de recarregar a página

    if (!matricula.trim() || !senha) {
      setErro('Preencha a matrícula e a senha.')
      return
    }
    setEnviando(true)
    try {
      const { precisaTrocarSenha: trocar } = await entrar(matricula, senha)
      navegar(trocar ? '/trocar-senha' : '/inicio', { replace: true })
    } catch (e) {
      setErro((e as Error).message)
      setSenha('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-fundo">
      {/* Cabeçalho azul-marinho */}
      <header className="bg-marinho px-6 pt-16 pb-7 text-branco">
        <p className="text-[32px] leading-tight font-bold">Aços F. Sacchelli</p>
        <div className="mt-3 h-1 w-11 rounded-full bg-amarelo" />
        <p className="mt-6 text-[12px] font-semibold tracking-wide text-amarelo uppercase">
          Portaria inteligente
        </p>
        <p className="mt-3 text-[22px] leading-snug">Seu próximo acesso, mais simples e seguro.</p>
      </header>

      <main className="flex-1 px-6 pt-6">
        <h1 className="text-[26px] font-bold text-marinho">Bem-vindo de volta</h1>
        <p className="mt-1 text-[15px] text-secundario">Entre com sua matrícula e senha.</p>

        <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
          <CampoTexto
            rotulo="Matrícula"
            placeholder="Sua matrícula"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={matricula}
            onChange={(e) => {
              setMatricula(e.target.value)
              setErro('')
            }}
          />
          <CampoTexto
            rotulo="Senha"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value)
              setErro('')
            }}
          />

          <Link to="/recuperar-senha" className="self-start py-1 text-[15px] font-semibold text-institucional">
            Esqueci minha senha
          </Link>

          <Botao type="submit" className="mt-3" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Botao>

          {/* Renderização condicional: só aparece se houver erro */}
          {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
        </form>
      </main>

      <footer className="px-6 py-8 text-center">
        <p className="text-[13px] text-secundario">Primeiro acesso? Use a matrícula e a senha que o RH entregou.</p>
      </footer>
    </div>
  )
}
