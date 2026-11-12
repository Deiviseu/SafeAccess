# SafeAccess · App do funcionário (protótipo)

App do "cartão" do funcionário do sistema de portaria da **Aços F. Sacchelli**,
feito a partir do protótipo do Figma (*Portaria Inteligente*).

> **Demonstração:** os dados são fictícios e a biometria, o QR Code e a
> validação são **simulados**. Nada é enviado para o banco ainda.

## Como rodar

```bash
npm install     # instala as bibliotecas (só na primeira vez)
npm run dev     # abre em http://localhost:5173
```

Outros comandos: `npm run build` (gera a versão final) e `npm run lint` (procura erros).

**Login de demonstração:** toque nos campos para preencher sozinho
(matrícula `024681`, senha `demo1234`).

## Tecnologias

| Biblioteca | Para quê |
|---|---|
| React + TypeScript | Telas em componentes, com tipos que evitam erros |
| Vite | Servidor de desenvolvimento e build |
| Tailwind CSS | Estilo direto nas classes (`bg-marinho`, `rounded-cartao`...) |
| React Router | Troca de telas pelo endereço (`/inicio`, `/qr`...) |
| qrcode.react | Desenha o QR Code |
| lucide-react | Ícones |

## Estrutura (onde está cada coisa)

```
src/
├── main.tsx              Ponto de partida: liga o roteador e a sessão
├── App.tsx               MAPA do app: qual endereço mostra qual tela
├── index.css             Cores, fonte e cantos do design system do Figma
├── dados/demo.ts         Dados fictícios (funcionário, últimos acessos)
├── sessao/               Quem está logado (Context API)
├── componentes/          Peças reutilizáveis = componentes do Figma
│   ├── Botao.tsx             Botão/Primário, Secundário e Contorno
│   ├── CampoTexto.tsx        Campo/Matrícula e Campo/Senha (com o olho)
│   ├── CardFuncionario.tsx   Card/Funcionário
│   ├── Mensagem.tsx          Mensagem/Ativo, Erro e Aviso
│   ├── NavegacaoInferior.tsx Navegação/Início, Acesso e Perfil
│   ├── Cabecalho.tsx         "PORTARIA INTELIGENTE" + título + Cenários
│   ├── LayoutTela.tsx        Molde comum das telas internas
│   ├── TelaStatus.tsx        Molde das telas de resultado (ícone + título)
│   ├── Modal.tsx             Janela por cima (Cenários, Sair, Ajuda)
│   ├── ModalCenarios.tsx     "Testar cenários" do protótipo
│   └── RotaProtegida.tsx     Bloqueia telas sem login
└── telas/                Uma tela (ou grupo de telas) por arquivo
    ├── Login.tsx             01, 11, 12, 13 e 22 do Figma
    ├── RecuperarSenha.tsx    14
    ├── Inicio.tsx            02 e 20
    ├── Biometria.tsx         03, 15 e 16
    ├── QrCode.tsx            04 e 17
    ├── TelasDeStatus.tsx     05, 06, 07, 08, 09 e 19
    └── Perfil.tsx            10, 18 e 21
```

## Telas e endereços

| Endereço | Tela |
|---|---|
| `/` | Login |
| `/recuperar-senha` · `/recuperar-senha/enviado` | Recuperação de senha |
| `/inicio` | Início |
| `/biometria` | Autenticação biométrica → validando → confirmada |
| `/qr` | QR Code (30 s; vermelho nos últimos 10 s) |
| `/codigo-expirado` | Código expirado |
| `/falha-autenticacao` | Falha na biometria |
| `/sem-conexao` | Sem conexão |
| `/acesso/autorizado` · `/acesso/recusado` | Resultado do acesso |
| `/perfil` | Perfil e configurações |

## Roteiro de estudo (leia nesta ordem)

1. **`Botao.tsx`**: o componente mais simples. Repare na prop `variante`.
2. **`CardFuncionario.tsx`**: recebe dados por prop e mostra na tela.
3. **`Login.tsx`**: `useState` (campos, erro) e formulário.
4. **`Inicio.tsx`**: listas com `.map()`.
5. **`TelaStatus.tsx` + `TelasDeStatus.tsx`**: um molde reaproveitado por seis telas.
6. **`QrCode.tsx`**: `useEffect` com temporizador.
7. **`App.tsx` + `RotaProtegida.tsx`**: navegação e proteção de telas.
8. **`sessao/`**: Context (dados compartilhados entre telas).

## Próximos passos

- Ligar ao Supabase (login real e dados do funcionário vindos do banco).
- Trocar a biometria simulada por passkey (WebAuthn) e o QR ilustrativo
  pelo token de 60 s das Edge Functions.
- Transformar em PWA (instalável no celular) com `vite-plugin-pwa`.
