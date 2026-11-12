import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CampoTexto } from '../componentes/CampoTexto'
import { Mensagem } from '../componentes/Mensagem'
import { Modal } from '../componentes/Modal'
import { funcionarioDemo, loginDemo } from '../dados/demo'
import { useSessao } from '../sessao/useSessao'

/*
  Figma: 01 · Login, 11 · Login preenchido, 12 · Senha visível,
         13 · Login inválido e 22 · Ajuda de acesso.
  As quatro primeiras são a MESMA tela em estados diferentes —
  no React isso é só uma questão de valores no useState.
*/
export function Login() {
  const navegar = useNavigate()
  const { entrar } = useSessao()

  // Estado = valores que mudam e fazem a tela se redesenhar
  const [matricula, setMatricula] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ajudaAberta, setAjudaAberta] = useState(false)

  function enviar(evento: FormEvent) {
    evento.preventDefault() // impede o navegador de recarregar a página

    if (!matricula || !senha) {
      setErro('Preencha a matrícula e a senha.')
      return
    }
    if (matricula !== loginDemo.matricula || senha !== loginDemo.senha) {
      setErro('Matrícula ou senha inválida.')
      return
    }
    entrar(funcionarioDemo)
    navegar('/inicio')
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
        <p className="mt-1 text-[15px] text-secundario">Entre com seus dados corporativos.</p>

        <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
          <CampoTexto
            rotulo="Matrícula ou usuário"
            placeholder="Toque para preencher"
            autoComplete="username"
            inputMode="numeric"
            value={matricula}
            // Demonstração: ao tocar no campo vazio, preenche sozinho
            onFocus={() => !matricula && setMatricula(loginDemo.matricula)}
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
            onFocus={() => !senha && setSenha(loginDemo.senha)}
            onChange={(e) => {
              setSenha(e.target.value)
              setErro('')
            }}
          />

          <Link to="/recuperar-senha" className="self-start py-1 text-[15px] font-semibold text-institucional">
            Esqueci minha senha
          </Link>

          <Botao type="submit" className="mt-3">
            Entrar
          </Botao>

          {/* Renderização condicional: só aparece se houver erro */}
          {erro ? (
            <Mensagem tipo="erro">{erro}</Mensagem>
          ) : (
            <p className="text-center text-[12px] text-secundario">
              Toque nos campos para usar dados de demonstração.
            </p>
          )}
        </form>
      </main>

      <footer className="py-8 text-center">
        <button type="button" onClick={() => setAjudaAberta(true)} className="text-[13px] text-secundario">
          Como testar este protótipo
        </button>
      </footer>

      <Modal
        aberto={ajudaAberta}
        onFechar={() => setAjudaAberta(false)}
        titulo="Como testar o acesso"
        descricao="Toque nos campos do login para preencher os dados fictícios. Use “Cenários” para explorar erros, expiração e validação. Nenhuma informação é enviada."
      >
        <Botao variante="contorno" onClick={() => setAjudaAberta(false)}>
          Entendi
        </Botao>
      </Modal>
    </div>
  )
}
