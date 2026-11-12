import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CampoTexto } from '../componentes/CampoTexto'
import { LayoutTela } from '../componentes/LayoutTela'
import { Mensagem } from '../componentes/Mensagem'
import { loginDemo } from '../dados/demo'

// Figma: 14 · Recuperar senha
export function RecuperarSenha() {
  const navegar = useNavigate()
  const [matricula, setMatricula] = useState('')
  const [erro, setErro] = useState('')

  function continuar(evento: FormEvent) {
    evento.preventDefault()
    if (!matricula.trim()) {
      setErro('Informe sua matrícula ou usuário.')
      return
    }
    navegar('/recuperar-senha/enviado')
  }

  return (
    <LayoutTela titulo="Recuperar senha">
      <h2 className="mt-2 text-[28px] font-bold text-marinho">Vamos ajudar você</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-secundario">
        Informe sua matrícula para visualizar as orientações de recuperação de acesso.
      </p>

      <form onSubmit={continuar} noValidate className="mt-8 flex flex-1 flex-col">
        <CampoTexto
          rotulo="Matrícula ou usuário"
          placeholder="Toque para preencher"
          inputMode="numeric"
          value={matricula}
          onFocus={() => !matricula && setMatricula(loginDemo.matricula)}
          onChange={(e) => {
            setMatricula(e.target.value)
            setErro('')
          }}
        />

        <div className="mt-6 rounded-campo bg-info-claro p-4">
          <p className="text-[16px] font-semibold text-institucional">Recuperação demonstrativa</p>
          <p className="mt-2 text-[13px] leading-relaxed text-secundario">
            Nenhum e-mail ou solicitação real será enviado. Use apenas os dados fictícios deste protótipo.
          </p>
        </div>

        {erro && (
          <div className="mt-4">
            <Mensagem tipo="erro">{erro}</Mensagem>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-10 pb-4">
          <Botao type="submit">Continuar</Botao>
          <Botao variante="contorno" onClick={() => navegar('/')}>
            Voltar ao login
          </Botao>
        </div>
      </form>
    </LayoutTela>
  )
}
