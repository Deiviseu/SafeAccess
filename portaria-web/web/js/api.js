/* Camada de dados: tudo que fala com o Supabase passa por aqui.
 * As regras (horário do servidor, operador logado, uma entrada aberta por
 * pessoa, validação de CPF, permissões) ficam no banco. Esta camada só chama
 * as funções e traduz os erros para mensagens que o porteiro entende. */
(() => {
  const cfg = window.SAFEACCESS_CONFIG || {};
  const configurado = Boolean(cfg.supabaseUrl && cfg.supabaseKey)
    && !/SEU-PROJETO|COLE_AQUI/.test(cfg.supabaseUrl + cfg.supabaseKey);

  // Sessão no sessionStorage: fechou o navegador, saiu do sistema
  // (computador da portaria é compartilhado entre turnos).
  const sb = configurado
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;

  class ErroApi extends Error {
    constructor(mensagem, codigo) { super(mensagem); this.codigo = codigo; }
  }

  const MENSAGENS_RESTRICAO = {
    pessoas_cpf_valido: 'CPF inválido.',
    pessoas_nome_valido: 'O nome deve ter entre 3 e 150 caracteres.',
    pessoas_documento_unico: 'Já existe um cadastro com este documento.',
    mov_uma_aberta_por_pessoa: 'Esta pessoa já está dentro.',
    mov_textos_tamanho: 'Texto muito longo em pessoa visitada, motivo ou observação.',
    pessoas_textos_tamanho: 'Texto muito longo em empresa ou observação.',
    usuarios_nome_valido: 'O nome deve ter entre 3 e 120 caracteres.',
    pessoas_matricula_unica: 'Já existe um funcionário com esta matrícula.',
    pessoas_matricula_formato: 'Matrícula inválida: use só letras, números, ponto, hífen ou sublinhado (até 30).',
    pessoas_func_matricula: 'Informe a matrícula do funcionário.',
  };

  function traduzir(error) {
    if (error instanceof ErroApi) return error;
    const msg = (error && error.message) || '';
    for (const [restricao, texto] of Object.entries(MENSAGENS_RESTRICAO)) {
      if (msg.includes(restricao)) return new ErroApi(texto, error.code);
    }
    // Mensagens escritas por nós nas funções do banco
    if (['P0001', 'P0002', '22023'].includes(error.code)) return new ErroApi(msg, error.code);
    if (error.code === '42501') {
      return new ErroApi(/permission denied/i.test(msg) ? 'Você não tem permissão para esta ação.' : msg, error.code);
    }
    if (error.code === 'PGRST301' || error.code === 'PGRST303' || error.status === 401 || /JWT/i.test(msg)) {
      return new ErroApi('Sua sessão expirou. Entre novamente.', 'sessao');
    }
    if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)) {
      return new ErroApi('Sem conexão com o servidor. Verifique a internet e tente de novo.', 'rede');
    }
    console.error('Erro não tratado da API:', error);
    return new ErroApi('Não foi possível concluir a operação. Tente novamente.', error.code);
  }

  async function exec(consulta) {
    let resposta;
    try { resposta = await consulta; } catch (e) { throw traduzir(e); }
    if (resposta.error) throw traduzir(resposta.error);
    return resposta.data;
  }

  // "2026-11-17" → meia-noite no fuso do computador
  function inicioDoDia(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d);
  }

  // Termo usado dentro de um filtro "or" do PostgREST: tira os caracteres
  // reservados da sintaxe (, . : ( ) ") e os curingas do ilike (% * _ \)
  function limparTermo(t) {
    return String(t || '').replace(/[,.:()"%*_\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function aplicarFiltros(q, f = {}) {
    const t = limparTermo(f.termo);
    if (t) q = q.or(`nome.ilike.%${t}%,empresa.ilike.%${t}%,matricula.ilike.%${t}%`);
    if (f.de) q = q.gte('entrada_em', inicioDoDia(f.de).toISOString());
    if (f.ate) {
      const fim = inicioDoDia(f.ate);
      fim.setDate(fim.getDate() + 1);
      q = q.lt('entrada_em', fim.toISOString());
    }
    if (f.tipo) q = q.eq('tipo', f.tipo);
    if (f.situacao === 'dentro') q = q.is('saida_em', null);
    if (f.situacao === 'saiu') q = q.not('saida_em', 'is', null);
    return q;
  }

  const COLS_MOV = 'movimentacao_id,entrada_em,saida_em,dentro,metodo_entrada,metodo_saida,pessoa_id,nome,tipo,'
    + 'empresa,matricula,setor_destino,pessoa_visitada,motivo,entrada_registrada_por,saida_registrada_por';
  const COLS_DENTRO = 'movimentacao_id,entrada_em,pessoa_id,nome,tipo,empresa,matricula,setor_destino,pessoa_visitada,metodo_entrada';

  window.API = {
    configurado,
    ErroApi,
    traduzir,

    // ---------- sessão ----------
    async sessao() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },

    async entrar(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) {
        if (/invalid login credentials/i.test(error.message)) throw new ErroApi('E-mail ou senha incorretos.');
        if (error.status === 429) throw new ErroApi('Muitas tentativas. Aguarde alguns minutos e tente de novo.');
        throw traduzir(error);
      }
      const op = await this.operadorAtual();
      if (!op) {
        await sb.auth.signOut();
        throw new ErroApi('Este usuário não tem acesso ao sistema da portaria. Procure o administrador.');
      }
      return op;
    },

    async sair() {
      await sb.auth.signOut().catch(() => {});
    },

    aoSair(fn) {
      sb.auth.onAuthStateChange(evento => { if (evento === 'SIGNED_OUT') fn(); });
    },

    // Operador logado (null se não for operador ativo, ex.: login de funcionário do app)
    async operadorAtual() {
      const { data, error } = await sb.auth.getUser(); // confere o token no servidor
      if (error || !data.user) return null;
      const op = await exec(sb.from('usuarios_sistema').select('id,nome,perfil,ativo').eq('id', data.user.id).maybeSingle());
      return op && op.ativo ? { ...op, email: data.user.email } : null;
    },

    // ---------- portaria ----------
    consumirQr: token => exec(sb.rpc('consumir_qr_token', { p_token: token })),

    buscarPessoas: termo => exec(sb.rpc('buscar_pessoas', { p_termo: termo, p_limite: 15 })),

    registrarEntrada: (pessoaId, extra = {}) => exec(sb.rpc('registrar_entrada', {
      p_pessoa_id: pessoaId,
      p_setor_destino_id: extra.setorId || null,
      p_pessoa_visitada: extra.visitada || null,
      p_motivo: extra.motivo || null,
      p_observacao: extra.observacao || null,
    })),

    registrarSaida: movimentacaoId => exec(sb.rpc('registrar_saida', { p_movimentacao_id: movimentacaoId })),

    registrarEntradaExterno: v => exec(sb.rpc('registrar_entrada_externo', {
      p_tipo: v.tipo,
      p_nome: v.nome,
      p_documento_tipo: v.documentoTipo,
      p_documento: v.documento,
      p_empresa: v.empresa || null,
      p_setor_destino_id: v.setorId || null,
      p_pessoa_visitada: v.visitada || null,
      p_motivo: v.motivo || null,
      p_observacao: v.observacao || null,
    })),

    async pessoa(id) {
      const p = await exec(sb.from('pessoas')
        .select('id,nome,tipo,empresa,matricula,documento_tipo,documento_final,ativo')
        .eq('id', id).maybeSingle());
      if (!p) return null;
      const aberta = await exec(sb.from('vw_pessoas_dentro').select('movimentacao_id,entrada_em').eq('pessoa_id', id).maybeSingle());
      return { ...p, aberta };
    },

    async pessoaPorDocumento(tipo, documento) {
      const id = await exec(sb.rpc('buscar_pessoa_por_documento', { p_documento_tipo: tipo, p_documento: documento }));
      return id ? this.pessoa(id) : null;
    },

    setores: () => exec(sb.from('setores').select('id,nome').eq('ativo', true).order('nome')),

    dentroAgora: () => exec(sb.from('vw_pessoas_dentro').select(COLS_DENTRO).order('entrada_em', { ascending: true }).limit(1000)),

    resumo: () => exec(sb.rpc('resumo_portaria')),

    // ---------- histórico ----------
    async movimentacoes(filtros, pagina, tamanho) {
      const ini = (pagina - 1) * tamanho;
      let q = sb.from('vw_movimentacoes').select(COLS_MOV, { count: 'exact' });
      q = aplicarFiltros(q, filtros).order('entrada_em', { ascending: false }).order('movimentacao_id')
        .range(ini, ini + tamanho - 1);
      let r;
      try { r = await q; } catch (e) { throw traduzir(e); }
      if (r.error) throw traduzir(r.error);
      return { linhas: r.data, total: r.count ?? 0 };
    },

    // Busca em blocos de 1000 (limite padrão do PostgREST), até `limite` linhas
    async movimentacoesParaExportar(filtros, limite = 10000) {
      const todas = [];
      for (let ini = 0; ini < limite; ini += 1000) {
        const bloco = await exec(aplicarFiltros(sb.from('vw_movimentacoes').select(COLS_MOV), filtros)
          .order('entrada_em', { ascending: false }).order('movimentacao_id')
          .range(ini, Math.min(ini + 999, limite - 1)));
        todas.push(...bloco);
        if (bloco.length < 1000) break;
      }
      return todas;
    },

    // ---------- funcionários (RH/admin) ----------
    funcionarios: () => exec(sb.rpc('listar_funcionarios')),

    criarFuncionario: f => exec(sb.from('pessoas').insert({
      tipo: 'funcionario',
      nome: f.nome,
      matricula: f.matricula,
      setor_id: f.setorId || null,
      documento_tipo: f.cpf ? 'cpf' : null,
      documento: f.cpf || null,
    }).select('id').single()),

    async atualizarFuncionario(id, campos) {
      const linhas = await exec(sb.from('pessoas').update(campos).eq('id', id).select('id'));
      if (!linhas.length) throw new ErroApi('Você não tem permissão para alterar este funcionário.');
    },

    aparelhos: pessoaId => exec(sb.from('credenciais_passkey')
      .select('id,dispositivo,created_at,ultimo_uso_em,revogada_em')
      .eq('pessoa_id', pessoaId).order('created_at', { ascending: false })),

    async revogarAparelho(id) {
      // o horário é gravado pelo servidor; revogação não pode ser desfeita
      const linhas = await exec(sb.from('credenciais_passkey').update({ revogada_em: new Date().toISOString() }).eq('id', id).select('id'));
      if (!linhas.length) throw new ErroApi('Você não tem permissão para revogar este celular.');
    },

    // acao: 'criar' | 'novo_convite' | 'redefinir_senha'
    async acessoFuncionario(acao, pessoaId) {
      const { data, error } = await sb.functions.invoke('rh-acesso-funcionario', { body: { acao, pessoa_id: pessoaId } });
      if (error) {
        let msg = null;
        try { msg = (await error.context.json()).erro; } catch { /* resposta sem JSON */ }
        throw new ErroApi(msg || 'Não foi possível concluir. Verifique se a função rh-acesso-funcionario foi publicada.');
      }
      return data;
    },

    // ---------- operadores (admin) ----------
    operadores: () => exec(sb.rpc('listar_operadores')),

    async atualizarOperador(id, campos) {
      const linhas = await exec(sb.from('usuarios_sistema').update(campos).eq('id', id).select('id'));
      if (!linhas.length) throw new ErroApi('Você não tem permissão para alterar este operador.');
    },

    async criarOperador(dados) {
      const { data, error } = await sb.functions.invoke('admin-criar-operador', { body: dados });
      if (error) {
        let msg = null;
        try { msg = (await error.context.json()).erro; } catch { /* resposta sem JSON */ }
        throw new ErroApi(msg || 'Não foi possível criar o operador. Verifique se a função admin-criar-operador foi publicada.');
      }
      return data;
    },
  };
})();
