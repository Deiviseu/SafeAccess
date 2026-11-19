import { Check, LogIn, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CardFuncionario } from '../componentes/CardFuncionario'
import { LayoutTela } from '../componentes/LayoutTela'
import { Mensagem } from '../componentes/Mensagem'
import { buscarUltimosAcessos } from '../dados/funcionario'
import type { Funcionario, RegistroAcesso } from '../dados/tipos'

// Figma: 02 · Início — com os dados reais do funcionário
export function Inicio({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  const local = useLocation()
  const senhaTrocada = local.state?.senhaTrocada === true

  // null = ainda carregando
  const [acessos, setAcessos] = useState<RegistroAcesso[] | null>(null)
  const [erroAcessos, setErroAcessos] = useState(false)

  // Busca os últimos acessos ao abrir a tela
  useEffect(() => {
    let ativo = true
    buscarUltimosAcessos(funcionario.id)
      .then((lista) => ativo && setAcessos(lista))
      .catch(() => ativo && setErroAcessos(true))
    return () => {
      ativo = false // saiu da tela antes da resposta: ignora
    }
  }, [funcionario.id])

  return (
    <LayoutTela titulo={`Olá, ${funcionario.primeiroNome}.`} comNavegacao>
      <div className="flex flex-col gap-3">
        {senhaTrocada && <Mensagem tipo="ativo">Senha alterada com sucesso.</Mensagem>}
        <CardFuncionario funcionario={funcionario} />
        <Mensagem tipo="ativo">Cadastro ativo</Mensagem>
      </div>

      {/* Cartão de destaque "Pronto para entrar?" */}
      <section className="mt-6 rounded-cartao bg-marinho p-5 text-branco">
        <p className="text-[11px] font-semibold tracking-wide text-amarelo uppercase">
          Seu acesso, na palma da mão
        </p>
        <h2 className="mt-3 text-[24px] font-bold">Pronto para entrar?</h2>
        <p className="mt-1 text-[15px] text-branco/85">Confirme sua identidade e gere seu QR Code.</p>
        <Botao className="mt-4" onClick={() => navegar('/biometria')}>
          Solicitar acesso
        </Botao>
      </section>

      <h2 className="mt-8 text-[20px] font-bold text-marinho">Últimos acessos</h2>
      {erroAcessos && <p className="mt-4 text-[14px] text-secundario">Não foi possível carregar agora.</p>}
      {!erroAcessos && acessos === null && <p className="mt-4 text-[14px] text-secundario">Carregando…</p>}
      {acessos?.length === 0 && <p className="mt-4 text-[14px] text-secundario">Nenhum acesso registrado ainda.</p>}

      {/* Listas: .map() transforma cada item do array em um pedaço de tela */}
      <ul className="mt-4 flex flex-col gap-5">
        {acessos?.map((registro) => {
          const Icone = registro.descricao.startsWith('Saída') ? LogOut : registro.metodo ? LogIn : Check
          return (
            <li key={registro.id} className="flex gap-4">
              <Icone size={22} className="mt-0.5 shrink-0 text-institucional" aria-hidden />
              <div>
                <p className="text-[16px] text-texto">{registro.descricao}</p>
                <p className="text-[13px] text-secundario">
                  {registro.quando}
                  {registro.metodo && ` · ${registro.metodo}`}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </LayoutTela>
  )
}
