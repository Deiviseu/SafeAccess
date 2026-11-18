/* Histórico de movimentações: filtros no servidor, paginação e CSV. */
iniciarPagina('logs', async () => {
  const TAMANHO = 20;
  const tbody = $('#tbody');
  let seq = 0;

  function filtros() {
    return {
      termo: $('#q').value,
      de: $('#de').value,
      ate: $('#ate').value,
      tipo: $('#tipo').value,
      situacao: $('#situacao').value,
    };
  }

  function linha(m) {
    const pessoa = el('div');
    filhos(pessoa, el('strong', null, m.nome), el('div', 'muted', m.empresa || (m.matricula && 'Mat. ' + m.matricula)));
    const metodo = m.metodo_saida && m.metodo_saida !== m.metodo_entrada
      ? `${METODOS[m.metodo_entrada]} / ${METODOS[m.metodo_saida]}` : METODOS[m.metodo_entrada];
    const por = el('div');
    filhos(por, el('div', null, m.entrada_registrada_por || '—'),
      m.saida_registrada_por && m.saida_registrada_por !== m.entrada_registrada_por && el('div', 'muted', 'Saída: ' + m.saida_registrada_por));
    const tr = el('tr');
    tr.append(
      td(fmtDataHora(m.entrada_em)),
      td(m.saida_em ? fmtDataHora(m.saida_em) : badge(horasDesde(m.entrada_em) > 12 ? 'warn' : 'ok', 'Dentro')),
      td(pessoa),
      td(TIPOS_PESSOA[m.tipo] || m.tipo),
      Object.assign(td(juntar(m.setor_destino, m.pessoa_visitada) || '—'), { className: 'quebra' }),
      td(metodo),
      td(por),
    );
    return tr;
  }

  const pag = criarPaginador({ info: $('#info'), prev: $('#prev'), next: $('#next'), tamanho: TAMANHO, aoMudar: carregar });

  async function carregar(pagina = pag.pagina) {
    const f = filtros(), atual = ++seq;
    if (f.de && f.ate && f.de > f.ate) { avisar('A data inicial é maior que a data final.'); return; }
    try {
      const { linhas, total } = await API.movimentacoes(f, pagina, TAMANHO);
      if (atual !== seq) return;
      tbody.replaceChildren(...(linhas.length ? linhas.map(linha) : [linhaVazia(7)]));
      pag.definirTotal(total);
    } catch (e) { tratarErro(e); }
  }

  const recarregar = () => { pag.reiniciar(); carregar(1); };
  $('#q').addEventListener('input', debounce(recarregar, 350));
  for (const id of ['de', 'ate', 'tipo', 'situacao']) $('#' + id).addEventListener('change', recarregar);

  $('#csv').addEventListener('click', async () => {
    const b = $('#csv'), f = filtros();
    b.disabled = true;
    b.textContent = 'Exportando…';
    try {
      const dados = await API.movimentacoesParaExportar(f);
      if (!dados.length) { avisar('Nenhum registro para exportar com esses filtros.'); return; }
      // Sem documento: a exportação não leva dados pessoais além do necessário (LGPD)
      baixarCsv(`acessos-${hojeIso()}.csv`, [
        ['Entrada', 'Saída', 'Nome', 'Tipo', 'Empresa', 'Matrícula', 'Setor de destino', 'Pessoa visitada', 'Motivo',
          'Método de entrada', 'Método de saída', 'Entrada registrada por', 'Saída registrada por'],
        ...dados.map(m => [fmtDataHora(m.entrada_em), m.saida_em ? fmtDataHora(m.saida_em) : 'Ainda dentro', m.nome,
          TIPOS_PESSOA[m.tipo] || m.tipo, m.empresa, m.matricula, m.setor_destino, m.pessoa_visitada, m.motivo,
          METODOS[m.metodo_entrada], METODOS[m.metodo_saida] || '', m.entrada_registrada_por, m.saida_registrada_por]),
      ]);
      avisar(`${dados.length} registro(s) exportado(s)` + (dados.length >= 10000 ? ' (limite de 10.000; refine os filtros).' : '.'), 'ok');
    } catch (e) {
      tratarErro(e);
    } finally {
      b.disabled = false;
      b.textContent = 'Exportar CSV';
    }
  });

  async function resumo() {
    const r = await API.resumo();
    $('#s-entradas').textContent = r.entradas_hoje;
    $('#s-saidas').textContent = r.saidas_hoje;
    $('#s-dentro').textContent = r.dentro_agora;
    $('#s-12h').textContent = r.dentro_mais_12h;
    $('#s-12h-card').classList.toggle('alerta', r.dentro_mais_12h > 0);
  }

  await Promise.all([resumo(), carregar(1)]);
});
