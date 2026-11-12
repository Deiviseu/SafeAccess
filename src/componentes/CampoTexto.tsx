import { Eye, EyeOff } from 'lucide-react'
import { useId, useState, type InputHTMLAttributes } from 'react'

/*
  Figma: "Campo/Matrícula", "Campo/Senha" e "Campo/Senha visível".
  Se tipo="password", aparece o olho para mostrar/esconder a senha.
*/
type CampoTextoProps = InputHTMLAttributes<HTMLInputElement> & {
  rotulo: string
}

export function CampoTexto({ rotulo, type = 'text', ...resto }: CampoTextoProps) {
  const id = useId() // liga o <label> ao <input> (acessibilidade)
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  const ehSenha = type === 'password'

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[14px] font-medium text-texto">
        {rotulo}
      </label>
      <div className="relative">
        <input
          id={id}
          type={ehSenha && senhaVisivel ? 'text' : type}
          className="h-14 w-full rounded-campo border border-borda bg-branco px-4 text-[16px] text-texto placeholder:text-secundario focus:border-institucional focus:outline-none"
          {...resto}
        />
        {ehSenha && (
          <button
            type="button"
            onClick={() => setSenhaVisivel(!senhaVisivel)}
            aria-label={senhaVisivel ? 'Esconder senha' : 'Mostrar senha'}
            className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center text-institucional"
          >
            {senhaVisivel ? <EyeOff size={22} /> : <Eye size={22} />}
          </button>
        )}
      </div>
    </div>
  )
}
