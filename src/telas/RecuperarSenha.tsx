import { useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { LayoutTela } from '../componentes/LayoutTela'

/*
  Figma: 14 · Recuperar senha.
  O login usa um e-mail interno (nenhum e-mail é enviado), então a
  recuperação é presencial: o RH gera uma nova senha na tela
  "Funcionários" da portaria, e o app pede a troca no próximo acesso.
*/
export function RecuperarSenha() {
  const navegar = useNavigate()

  return (
    <LayoutTela titulo="Recuperar senha">
      <h2 className="mt-2 text-[28px] font-bold text-marinho">Vamos ajudar você</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-secundario">
        Para sua segurança, a senha é redefinida pessoalmente.
      </p>

      <ol className="mt-6 flex flex-col gap-4 rounded-cartao bg-branco p-5 text-[15px] text-texto">
        <li>
          <strong className="text-marinho">1.</strong> Procure o RH com a sua matrícula.
        </li>
        <li>
          <strong className="text-marinho">2.</strong> O RH gera uma senha nova para você.
        </li>
        <li>
          <strong className="text-marinho">3.</strong> Entre no app com essa senha e crie a sua.
        </li>
      </ol>

      <div className="mt-auto flex flex-col gap-3 pt-10 pb-4">
        <Botao onClick={() => navegar('/')}>Voltar ao login</Botao>
      </div>
    </LayoutTela>
  )
}
