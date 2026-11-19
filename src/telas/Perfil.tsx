import { Smartphone, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { LayoutTela } from '../componentes/LayoutTela'
import { Mensagem } from '../componentes/Mensagem'
import { Modal } from '../componentes/Modal'
import { listarCelulares, removerCelular, type Celular } from '../dados/funcionario'
import type { Funcionario } from '../dados/tipos'
import { useSessao } from '../sessao/useSessao'

/*
  Figma: 10 · Perfil e configurações e 21 · Confirmar saída.
  "Celulares cadastrados" mostra os aparelhos com biometria (passkey)
  que podem gerar o QR. Remover um celular é definitivo.
*/
export function Perfil({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  const { sair } = useSessao()
  const [confirmarSaida, setConfirmarSaida] = useState(false)
  const [celulares, setCelulares] = useState<Celular[] | null>(null)
  const [remover, setRemover] = useState<Celular | null>(null)
  const [erro, setErro] = useState('')

  async function carregarCelulares() {
    try {
      setCelulares(await listarCelulares())
    } catch {
      setErro('Não foi possível carregar os celulares agora.')
    }
  }

  useEffect(() => {
    let ativo = true
    listarCelulares()
      .then((lista) => ativo && setCelulares(lista))
      .catch(() => ativo && setErro('Não foi possível carregar os celulares agora.'))
    return () => {
      ativo = false
    }
  }, [])

  async function confirmarRemocao() {
    if (!remover) return
    try {
      await removerCelular(remover.id)
      setRemover(null)
      await carregarCelulares()
    } catch {
      setRemover(null)
      setErro('Não foi possível remover. Tente de novo.')
    }
  }

  async function sairDaConta() {
    await sair()
    navegar('/', { replace: true })
  }

  const dados = [
    { rotulo: 'Matrícula', valor: funcionario.matricula },
    { rotulo: 'Setor', valor: funcionario.setor || 'Não informado' },
    { rotulo: 'Conta', valor: 'Funcionário' },
  ]

  return (
    <LayoutTela titulo="Meu perfil" comNavegacao>
      <div className="flex flex-col items-center text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-info-claro text-institucional">
          <User size={34} strokeWidth={1.8} aria-hidden />
        </div>
        <p className="mt-4 text-[24px] font-bold text-marinho">{funcionario.nome}</p>
        <p className="mt-1 text-[15px] text-secundario">Matrícula {funcionario.matricula}</p>
      </div>

      <div className="mt-5">
        <Mensagem tipo="ativo">Cadastro ativo</Mensagem>
      </div>

      {/* <dl> = lista de "termo: valor", ideal para dados de perfil */}
      <dl className="mt-5 flex flex-col gap-6 rounded-cartao bg-branco p-4">
        {dados.map((d) => (
          <div key={d.rotulo} className="grid grid-cols-[100px_1fr] text-[14px]">
            <dt className="text-secundario">{d.rotulo}</dt>
            <dd className="font-medium text-texto">{d.valor}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-7 text-[18px] font-bold text-marinho">Celulares com biometria</h2>
      {erro && (
        <div className="mt-3">
          <Mensagem tipo="erro">{erro}</Mensagem>
        </div>
      )}
      {celulares === null && !erro && <p className="mt-3 text-[14px] text-secundario">Carregando…</p>}
      {celulares?.length === 0 && (
        <p className="mt-3 text-[14px] text-secundario">Nenhum celular cadastrado. Peça o convite ao RH.</p>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {celulares?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-cartao bg-branco p-4">
            <Smartphone size={22} className="shrink-0 text-institucional" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-marinho">{c.nome}</p>
              <p className="text-[12px] text-secundario">
                Cadastrado em {c.cadastradoEm}
                {c.ultimoUso && ` · último uso ${c.ultimoUso}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRemover(c)}
              className="h-11 shrink-0 px-2 text-[14px] font-semibold text-erro"
              aria-label={`Remover ${c.nome}`}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-secundario">Trocou de celular? Peça ao RH um novo convite.</p>

      <Botao variante="contorno" className="mt-6" onClick={() => navegar('/trocar-senha')}>
        Alterar senha
      </Botao>
      <Botao variante="contorno" className="mt-3" onClick={() => setConfirmarSaida(true)}>
        Sair da conta
      </Botao>

      <Modal
        aberto={remover !== null}
        onFechar={() => setRemover(null)}
        titulo="Remover este celular?"
        descricao={`${remover?.nome ?? ''} não vai mais gerar QR Code. Para usar de novo, só com um novo convite do RH.`}
      >
        <Botao variante="secundario" onClick={confirmarRemocao}>
          Remover
        </Botao>
        <Botao variante="contorno" onClick={() => setRemover(null)}>
          Cancelar
        </Botao>
      </Modal>

      <Modal
        aberto={confirmarSaida}
        onFechar={() => setConfirmarSaida(false)}
        titulo="Sair da conta?"
        descricao="Para entrar de novo, use sua matrícula e senha."
      >
        <Botao variante="secundario" onClick={sairDaConta}>
          Sair
        </Botao>
        <Botao variante="contorno" onClick={() => setConfirmarSaida(false)}>
          Cancelar
        </Botao>
      </Modal>
    </LayoutTela>
  )
}
