/* Tela da portaria: QR Code, registro manual e quem está dentro. */
iniciarPagina('leitor', async () => {
  const st = $('#cam-status'), res = $('#resultado');
  let dentro = [], resTimer;

  // ---------------- Resultado em destaque ----------------
  function mostrarResultado({ ok, titulo, nome, detalhe }) {
    res.className = 'resultado ' + (ok ? 'ok' : 'bad');
    filhos(res, el('strong', 'res-titulo', titulo), nome && el('div', 'res-nome', nome), detalhe && el('div', 'muted', detalhe));
    res.hidden = false;
    clearTimeout(resTimer);
    resTimer = setTimeout(() => { res.hidden = true; }, 10000);
  }

  // ---------------- Painel: números e lista de quem está dentro ----------------
  async function atualizarPainel() {
    const [r, lista] = await Promise.all([API.resumo(), API.dentroAgora()]);
    $('#s-dentro').textContent = r.dentro_agora;
    $('#s-externos').textContent = r.externos_dentro;
    $('#s-entradas').textContent = r.entradas_hoje;
    $('#s-12h').textContent = r.dentro_mais_12h;
    $('#s-12h-card').classList.toggle('alerta', r.dentro_mais_12h > 0);
    dentro = lista;
    desenharDentro();
  }

  async function aposRegistro() {
    await Promise.all([atualizarPainel(), buscar()]);
  }

  function botaoSaida(movimentacaoId) {
    return botaoConfirmar('Registrar saída', 'Confirmar saída?', async () => {
      const r = await API.registrarSaida(movimentacaoId);
      mostrarResultado({ ok: true, titulo: 'SAÍDA REGISTRADA', nome: r.nome, detalhe: 'Às ' + fmtHora(r.em) + ' (manual)' });
      await aposRegistro();
    });
  }

  function desenharDentro() {
    const f = $('#filtro-dentro').value.trim().toLowerCase();
    const lista = f ? dentro.filter(m => [m.nome, m.empresa, m.matricula].join(' ').toLowerCase().includes(f)) : dentro;
    $('#dentro-total').textContent = dentro.length;
    if (!lista.length) {
      $('#dentro').replaceChildren(linhaVazia(5, f ? 'Ninguém encontrado com esse filtro.' : 'Ninguém dentro da empresa no momento.'));
      return;
    }
    $('#dentro').replaceChildren(...lista.map(m => {
      const quem = el('div');
      filhos(quem, el('strong', null, m.nome), el('div', 'muted', m.empresa || (m.matricula && 'Mat. ' + m.matricula)));
      const quando = el('div');
      const muitoTempo = horasDesde(m.entrada_em) > 12;
      filhos(quando, el('div', null, fmtDataHora(m.entrada_em)),
        muitoTempo ? badge('warn', tempoDesde(m.entrada_em)) : el('div', 'muted', tempoDesde(m.entrada_em)));
      const tr = el('tr');
      tr.append(td(quando), td(quem), td(TIPOS_PESSOA[m.tipo] || m.tipo),
        td(juntar(m.setor_destino, m.pessoa_visitada) || '—'), td(botaoSaida(m.movimentacao_id)));
      return tr;
    }));
  }

  $('#filtro-dentro').addEventListener('input', desenharDentro);

  // ---------------- Registro manual ----------------
  const busca = $('#busca'), lista = $('#resultados');
  let seq = 0;

  function itemPessoa(p) {
    const li = el('li'), info = el('div'), acoes = el('div', 'acoes');
    filhos(info, el('strong', null, p.nome),
      el('div', 'muted', juntar(TIPOS_PESSOA[p.tipo], p.matricula && 'Mat. ' + p.matricula, p.empresa, p.setor,
        p.documento_final && 'Doc. •••' + p.documento_final)));
    if (!p.ativo) {
      acoes.append(badge('bad', 'Cadastro inativo'));
    } else if (p.movimentacao_id) {
      acoes.append(badge('ok', 'Dentro desde ' + fmtHora(p.entrada_em)), botaoSaida(p.movimentacao_id));
    } else if (p.tipo === 'funcionario') {
      acoes.append(botaoAcao('Registrar entrada', async () => {
        const r = await API.registrarEntrada(p.pessoa_id);
        mostrarResultado({ ok: true, titulo: 'ENTRADA REGISTRADA', nome: r.nome, detalhe: 'Às ' + fmtHora(r.em) + ' (manual)' });
        await aposRegistro();
      }));
    } else {
      // visitante conhecido: abre o formulário para informar destino e motivo
      const a = el('a', 'btn btn-sm btn-primary', 'Registrar entrada');
      a.href = 'visitante.html?pessoa=' + encodeURIComponent(p.pessoa_id);
      acoes.append(a);
    }
    li.append(info, acoes);
    return li;
  }

  async function buscar() {
    const termo = busca.value.trim(), atual = ++seq;
    if (termo.length < 2) { lista.replaceChildren(); return; }
    try {
      const pessoas = await API.buscarPessoas(termo);
      if (atual !== seq) return; // chegou resposta de uma busca antiga
      lista.replaceChildren(...(pessoas.length
        ? pessoas.map(itemPessoa)
        : [el('li', 'muted', 'Ninguém encontrado. Se for a primeira visita, use “Novo visitante”.')]));
    } catch (e) { tratarErro(e); }
  }
  busca.addEventListener('input', debounce(buscar, 300));

  // ---------------- QR Code ----------------
  const FORMATO_TOKEN = /^[0-9a-f]{64}$/i;
  // O QR é de uso único: se continuar na frente da câmera, não consulta de
  // novo (evita trocar o "Autorizado" por "já utilizado" na tela).
  const jaLidos = new Set();

  async function aoLerQr(valor) {
    if (jaLidos.has(valor)) return;
    jaLidos.add(valor);
    if (jaLidos.size > 200) jaLidos.delete(jaLidos.values().next().value);

    if (!FORMATO_TOKEN.test(valor)) {
      mostrarResultado({ ok: false, titulo: 'QR CODE NÃO RECONHECIDO', detalhe: 'Este QR Code não é um cartão SafeAccess.' });
      await pausa(1500);
      return;
    }
    st.textContent = 'Validando QR Code…';
    try {
      const r = await API.consumirQr(valor);
      if (r.status === 'autorizado') {
        const p = r.pessoa || {};
        mostrarResultado({
          ok: true,
          titulo: r.tipo === 'saida' ? 'SAÍDA REGISTRADA' : 'ENTRADA AUTORIZADA',
          nome: p.nome,
          detalhe: juntar(p.matricula && 'Matrícula ' + p.matricula, p.setor),
        });
      } else {
        mostrarResultado({ ok: false, titulo: 'ACESSO NEGADO', detalhe: r.mensagem || 'QR Code inválido.' });
      }
      atualizarPainel().catch(tratarErro);
    } catch (e) {
      mostrarResultado({ ok: false, titulo: 'FALHA NA VALIDAÇÃO', detalhe: e.message });
      jaLidos.delete(valor); // o QR não foi consumido: permite ler de novo
      if (e.codigo === 'sessao') tratarErro(e);
    } finally {
      st.textContent = 'Leitor ativo. Aponte o QR Code para a câmera.';
    }
    await pausa(2500); // tempo para a pessoa ver o resultado e tirar o celular
  }

  const leitor = criarLeitorQr($('#video'), aoLerQr);

  async function ligarCamera() {
    $('#cam-btn').hidden = true;
    st.textContent = 'Solicitando acesso à câmera…';
    try {
      await leitor.iniciar();
      $('#placeholder').hidden = true;
      $('#live').hidden = false;
      st.textContent = 'Leitor ativo. Aponte o QR Code para a câmera.';
    } catch (e) {
      const motivos = {
        NotAllowedError: 'Acesso à câmera bloqueado. Libere a câmera para este site (ícone ao lado do endereço) e clique em “Ativar câmera”.',
        NotFoundError: 'Nenhuma câmera encontrada. Use o registro manual.',
        NotReadableError: 'A câmera está em uso por outro programa. Feche-o e clique em “Ativar câmera”.',
        InsecureContext: 'A câmera só funciona com HTTPS (ou em localhost). Use o registro manual.',
      };
      st.textContent = motivos[e.name] || 'Não foi possível ligar a câmera. Use o registro manual.';
      $('#cam-btn').hidden = false;
      console.warn(e);
    }
  }
  $('#cam-btn').addEventListener('click', ligarCamera);
  window.addEventListener('pagehide', () => leitor.parar());

  // ---------------- Início ----------------
  await atualizarPainel();
  setInterval(() => { if (!document.hidden) atualizarPainel().catch(tratarErro); }, 30000);
  ligarCamera();
});
