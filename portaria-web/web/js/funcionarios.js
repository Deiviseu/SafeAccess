/* Funcionários: cadastro pelo RH e liberação do acesso ao app do celular. */
iniciarPagina('funcionarios', async () => {
  const TAMANHO = 15;
  const MATRICULA_VALIDA = /^[A-Za-z0-9._-]{1,30}$/;
  let todos = [], filtrados = [], atual = null;

  // ---------- situação do acesso ao app ----------
  function situacao(f) {
    if (!f.ativo) return 'inativo';
    if (!f.tem_login) return 'sem_login';
    return f.aparelhos > 0 ? 'celular' : 'aguardando';
  }

  function badgeAcesso(f) {
    const s = situacao(f);
    const caixa = el('div');
    if (s === 'inativo') return filhos(caixa, badge('neutro', 'Inativo'));
    if (s === 'sem_login') return filhos(caixa, badge('warn', 'Sem acesso'));
    if (s === 'celular') return filhos(caixa, badge('ok', f.aparelhos === 1 ? '1 celular' : `${f.aparelhos} celulares`));
    return filhos(caixa, badge('warn', 'Aguardando celular'),
      el('div', 'muted', f.convite_expira_em ? 'Convite até ' + fmtDataHora(f.convite_expira_em) : 'Convite vencido'));
  }

  // ---------- tabela ----------
  const pag = criarPaginador({ info: $('#info'), prev: $('#prev'), next: $('#next'), tamanho: TAMANHO, aoMudar: desenhar });

  function linha(f) {
    const quem = el('div');
    filhos(quem, el('strong', null, f.nome), el('div', 'muted', juntar('Mat. ' + f.matricula, f.documento_final && 'CPF •••' + f.documento_final)));
    const b = el('button', 'btn btn-sm', 'Gerenciar');
    b.type = 'button';
    b.setAttribute('aria-label', 'Gerenciar ' + f.nome);
    b.addEventListener('click', () => abrirGerenciar(f.pessoa_id));
    const tr = el('tr');
    tr.append(td(quem), td(f.setor || '—'), td(badgeAcesso(f)),
      td(f.ultimo_login ? fmtDataHora(f.ultimo_login) : (f.tem_login ? 'Nunca entrou' : '—')), td(b));
    return tr;
  }

  function desenhar(pagina = pag.pagina) {
    const ini = (pagina - 1) * TAMANHO, fatia = filtrados.slice(ini, ini + TAMANHO);
    $('#tbody').replaceChildren(...(fatia.length ? fatia.map(linha) : [linhaVazia(5, todos.length ? 'Nenhum funcionário com esses filtros.' : 'Nenhum funcionário cadastrado ainda.')]));
    pag.definirTotal(filtrados.length);
  }

  function filtrar() {
    const q = $('#q').value.toLowerCase().trim(), setor = $('#f-setor').value, sit = $('#f-situacao').value;
    filtrados = todos.filter(f => `${f.nome} ${f.matricula}`.toLowerCase().includes(q)
      && (!setor || f.setor_id === setor) && (!sit || situacao(f) === sit));
    pag.reiniciar();
    desenhar(1);
  }

  async function carregar() {
    todos = await API.funcionarios();
    const ativos = todos.filter(f => f.ativo);
    $('#s-ativos').textContent = ativos.length;
    $('#s-login').textContent = ativos.filter(f => f.tem_login).length;
    $('#s-celular').textContent = ativos.filter(f => f.aparelhos > 0).length;
    const aguardando = ativos.filter(f => situacao(f) === 'aguardando').length;
    $('#s-aguardando').textContent = aguardando;
    $('#s-aguardando-card').classList.toggle('alerta', aguardando > 0);
    filtrar();
  }

  $('#q').addEventListener('input', filtrar);
  $('#f-setor').addEventListener('change', filtrar);
  $('#f-situacao').addEventListener('change', filtrar);
  for (const b of document.querySelectorAll('[data-fechar]')) b.addEventListener('click', () => b.closest('dialog').close());

  // ---------- resultado: senha e convite ----------
  const dlgAcesso = $('#dlg-acesso');
  dlgAcesso.addEventListener('cancel', e => e.preventDefault()); // Esc não fecha: a senha só aparece agora
  $('#acesso-ok').addEventListener('click', () => dlgAcesso.close());
  $('#acesso-copiar').addEventListener('click', async () => {
    const b = $('#acesso-copiar');
    try { await navigator.clipboard.writeText($('#acesso-link').value); b.textContent = 'Copiado!'; }
    catch { $('#acesso-link').select(); b.textContent = 'Use Ctrl+C'; }
    setTimeout(() => { b.textContent = 'Copiar link'; }, 2500);
  });

  function mostrarAcesso(titulo, r) {
    $('#dlg-acesso-t').textContent = titulo;
    $('#acesso-quem').textContent = juntar(r.nome, 'Matrícula ' + r.matricula);
    $('#acesso-login').hidden = !r.senha;
    if (r.senha) {
      $('#acesso-matricula').textContent = r.matricula;
      $('#acesso-senha').textContent = r.senha;
    }
    $('#acesso-convite').hidden = !r.convite;
    if (r.convite) {
      const q = window.qrcode(0, 'M');
      q.addData(r.convite.link);
      q.make();
      $('#acesso-qr').src = q.createDataURL(5, 4);
      $('#acesso-link').value = r.convite.link;
      $('#acesso-expira').textContent = 'Válido até ' + fmtDataHora(r.convite.expira_em) + '. Depois disso, gere um novo convite.';
    }
    dlgAcesso.showModal();
  }

  // ---------- novo funcionário ----------
  const dlgNovo = $('#dlg-novo'), formNovo = $('#form-novo'), msgNovo = $('#msg-novo');
  $('#novo-cpf').addEventListener('input', e => { e.target.value = mascararCpf(e.target.value); });
  $('#novo').addEventListener('click', () => { formNovo.reset(); msgNovo.textContent = ''; dlgNovo.showModal(); });

  formNovo.addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(formNovo));
    f.nome = f.nome.trim().replace(/\s+/g, ' ');
    f.matricula = f.matricula.trim();
    if (f.nome.length < 3) { msgNovo.textContent = 'Informe o nome completo.'; return; }
    if (!MATRICULA_VALIDA.test(f.matricula)) { msgNovo.textContent = 'Matrícula inválida: use só letras, números, ponto, hífen ou sublinhado.'; return; }
    if (f.cpf && !cpfValido(f.cpf)) { msgNovo.textContent = 'CPF inválido. Deixe em branco se não quiser informar.'; return; }
    const b = formNovo.querySelector('[type=submit]');
    b.disabled = true;
    try {
      const novo = await API.criarFuncionario({ nome: f.nome, matricula: f.matricula, setorId: f.setorId, cpf: f.cpf });
      dlgNovo.close();
      await carregar();
      if (!f.criarAcesso) { avisar(`Funcionário ${f.nome} cadastrado.`, 'ok'); return; }
      try {
        mostrarAcesso('Acesso criado', await API.acessoFuncionario('criar', novo.id));
        await carregar();
      } catch (err) {
        avisar(`Funcionário cadastrado, mas o acesso ao app não foi criado: ${err.message} Use "Gerenciar" para tentar de novo.`);
      }
    } catch (err) {
      msgNovo.textContent = err.message;
    } finally { b.disabled = false; }
  });

  // ---------- gerenciar ----------
  const dlgFunc = $('#dlg-func'), formFunc = $('#form-func'), msgFunc = $('#msg-func');

  async function acao(tipo, titulo) {
    const r = await API.acessoFuncionario(tipo, atual.pessoa_id);
    dlgFunc.close();
    mostrarAcesso(titulo, r);
    await carregar();
  }

  async function desenharAparelhos() {
    const lista = await API.aparelhos(atual.pessoa_id);
    $('#func-aparelhos').replaceChildren(...(lista.length ? lista.map(a => {
      const li = el('li'), t = el('div');
      filhos(t, el('strong', null, a.dispositivo || 'Celular'),
        el('div', 'muted', juntar('Cadastrado em ' + fmtDataHora(a.created_at), a.ultimo_uso_em && 'último uso ' + fmtDataHora(a.ultimo_uso_em))));
      li.append(t, a.revogada_em
        ? badge('neutro', 'Revogado')
        : botaoConfirmar('Revogar', 'Confirmar revogação?', async () => {
          await API.revogarAparelho(a.id);
          await Promise.all([desenharAparelhos(), carregar()]);
        }));
      return li;
    }) : [el('li', 'muted', 'Nenhum celular cadastrado.')]));
  }

  function desenharAcesso() {
    const f = atual, s = situacao(f), botoes = $('#func-botoes');
    const textos = {
      inativo: 'Cadastro inativo: reative para liberar o acesso.',
      sem_login: 'Ainda não tem login no app.',
      aguardando: f.convite_expira_em ? `Login criado. Aguardando cadastrar o celular (convite até ${fmtDataHora(f.convite_expira_em)}).` : 'Login criado, mas o convite venceu. Gere um novo.',
      celular: `Acesso liberado em ${f.aparelhos === 1 ? '1 celular' : f.aparelhos + ' celulares'}.`,
    };
    $('#func-acesso').textContent = textos[s];
    botoes.replaceChildren();
    if (!f.ativo) return;
    if (!f.tem_login) {
      botoes.append(botaoAcao('Criar acesso ao app', () => acao('criar', 'Acesso criado')));
      return;
    }
    botoes.append(
      botaoConfirmar(s === 'celular' ? 'Cadastrar outro celular' : 'Gerar novo convite', 'Confirmar? O convite anterior deixa de valer',
        () => acao('novo_convite', 'Novo convite'), 'btn btn-sm btn-primary'),
      botaoConfirmar('Redefinir senha', 'Confirmar? A senha atual deixa de valer', () => acao('redefinir_senha', 'Senha redefinida')),
    );
  }

  async function abrirGerenciar(pessoaId) {
    atual = todos.find(f => f.pessoa_id === pessoaId);
    if (!atual) return;
    $('#dlg-func-t').textContent = atual.nome;
    $('#func-sub').textContent = juntar('Matrícula ' + atual.matricula, atual.documento_final && 'CPF •••' + atual.documento_final);
    $('#func-nome').value = atual.nome;
    $('#func-setor').value = atual.setor_id || '';
    $('#func-ativo').checked = atual.ativo;
    msgFunc.textContent = '';
    msgFunc.className = 'msg';
    desenharAcesso();
    $('#func-aparelhos').replaceChildren(el('li', 'muted', 'Carregando…'));
    dlgFunc.showModal();
    try { await desenharAparelhos(); } catch (e) { tratarErro(e); }
  }

  formFunc.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = $('#func-nome').value.trim().replace(/\s+/g, ' ');
    if (nome.length < 3) { msgFunc.textContent = 'Informe o nome completo.'; return; }
    const campos = { nome, setor_id: $('#func-setor').value || null, ativo: $('#func-ativo').checked };
    const b = formFunc.querySelector('[type=submit]');
    b.disabled = true;
    try {
      await API.atualizarFuncionario(atual.pessoa_id, campos);
      await carregar();
      atual = todos.find(f => f.pessoa_id === atual.pessoa_id);
      $('#dlg-func-t').textContent = atual.nome;
      desenharAcesso();
      msgFunc.textContent = 'Alterações salvas.';
      msgFunc.className = 'msg ok';
    } catch (err) {
      msgFunc.textContent = err.message;
      msgFunc.className = 'msg';
    } finally { b.disabled = false; }
  });

  // ---------- início ----------
  const setores = await API.setores();
  for (const s of setores) {
    $('#f-setor').append(new Option(s.nome, s.id));
    for (const sel of document.querySelectorAll('.sel-setor')) sel.append(new Option(s.nome, s.id));
  }
  await carregar();
});
