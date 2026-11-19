"""Teste da tela Funcionários + Edge Function rh-acesso-funcionario (Chrome headless)."""
import json, os, re, subprocess, sys, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:8787'
SHOTS = '/tmp/shots'
os.makedirs(SHOTS, exist_ok=True)
SENHA = 'senha-teste-123'
erros, passos = [], []
expect.set_options(timeout=10000)


def ok(msg):
    passos.append(msg)
    print('OK ', msg, flush=True)


def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'safeaccess', '-qAt', '-c', q],
                          capture_output=True, text=True, check=True).stdout.strip()


def login_app(matricula, senha):
    """Tenta o login do funcionário como o app fará (e-mail interno)."""
    corpo = json.dumps({'email': f'{matricula.lower()}@funcionarios.sacchelli.com.br', 'password': senha}).encode()
    req = urllib.request.Request(BASE + '/auth/v1/token?grant_type=password', corpo, {'Content-Type': 'application/json'})
    try:
        return urllib.request.urlopen(req).status == 200
    except urllib.error.HTTPError:
        return False


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    ctx = b.new_context(viewport={'width': 1366, 'height': 860}, locale='pt-BR', timezone_id='America/Sao_Paulo',
                        permissions=['clipboard-read', 'clipboard-write', 'camera'])
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'console.{m.type}: {m.text}') if m.type in ('error', 'warning') and 'Failed to load resource' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))

    def entrar(email):
        pg.goto(BASE + '/login.html')
        pg.fill('#email', email)
        pg.fill('input[name=senha]', SENHA)
        pg.click('#entrar')
        pg.wait_for_url('**/leitor.html')

    # ---------- RH ----------
    entrar('rh@sacchelli.com.br')
    expect(pg.locator('nav a', has_text='Funcionários')).to_be_visible()
    assert pg.locator('nav a', has_text='Operadores').count() == 0
    pg.click('nav a:has-text("Funcionários")')
    pg.wait_for_url('**/funcionarios.html')
    expect(pg.locator('#tbody tr')).to_have_count(1)
    expect(pg.locator('#tbody')).to_contain_text('João da Silva')
    expect(pg.locator('#tbody')).to_contain_text('Aguardando celular')
    ok('RH vê o menu Funcionários (sem Operadores) e a lista com a situação do acesso')

    # Novo funcionário com acesso
    pg.click('#novo')
    f = pg.locator('#form-novo')
    f.locator('input[name=nome]').fill('Ana Pereira')
    f.locator('input[name=matricula]').fill('12 34')
    f.locator('button[type=submit]').click()
    expect(pg.locator('#msg-novo')).to_contain_text('Matrícula inválida')
    f.locator('input[name=matricula]').fill('100200')
    f.locator('input[name=cpf]').fill('11144477700')
    f.locator('button[type=submit]').click()
    expect(pg.locator('#msg-novo')).to_contain_text('CPF inválido')
    f.locator('input[name=cpf]').fill('11144477735')
    expect(f.locator('input[name=cpf]')).to_have_value('111.444.777-35')
    f.locator('select[name=setorId]').select_option(label='Compras')
    f.locator('button[type=submit]').click()
    dlg = pg.locator('#dlg-acesso')
    expect(dlg).to_be_visible()
    expect(pg.locator('#dlg-acesso-t')).to_have_text('Acesso criado')
    expect(pg.locator('#acesso-matricula')).to_have_text('100200')
    senha1 = pg.inner_text('#acesso-senha')
    assert re.fullmatch(r'[A-HJ-NP-Za-hj-np-z2-9]{10}', senha1), senha1
    link1 = pg.input_value('#acesso-link')
    assert re.fullmatch(r'https://app-teste\.exemplo/convite#[0-9a-f]{64}', link1), link1
    assert pg.get_attribute('#acesso-qr', 'src').startswith('data:image/')
    pg.screenshot(path=f'{SHOTS}/10-acesso-criado.png')
    pg.keyboard.press('Escape')
    expect(dlg).to_be_visible()
    ok('novo funcionário: valida matrícula e CPF; mostra senha legível, link e QR do convite; Esc não fecha')

    pg.click('#acesso-copiar')
    expect(pg.locator('#acesso-copiar')).to_have_text('Copiado!')
    assert pg.evaluate('navigator.clipboard.readText()') == link1
    pg.click('#acesso-ok')
    ok('copiar link funciona')

    assert login_app('100200', senha1), 'login com a senha inicial falhou'
    token1 = link1.split('#')[1]
    assert sql(f"select count(*) from public.convites_passkey where token_hash = encode(sha256(convert_to('{token1}','UTF8')),'hex') and usado_em is null and expira_em > now()") == '1'
    assert sql(f"select count(*) from public.convites_passkey where token_hash = '{token1}'") == '0'
    assert sql("select criado_por = '00000000-0000-0000-0000-00000000000c' from public.convites_passkey order by created_at desc limit 1") == 't'
    ok('login do funcionário funciona com a senha gerada; banco guarda só o hash do convite, com o RH como autor')

    linha = pg.locator('#tbody tr', has_text='Ana Pereira')
    expect(linha).to_contain_text('Aguardando celular')
    expect(linha).to_contain_text('Convite até')
    expect(linha).to_contain_text('CPF •••7735')
    assert '111.444.777-35' not in pg.content() and '11144477735' not in pg.content()
    expect(pg.locator('#s-aguardando')).to_have_text('2')
    ok('lista mostra só o final do CPF e conta quem aguarda celular')

    # Matrícula repetida
    pg.click('#novo')
    f.locator('input[name=nome]').fill('Outra Pessoa')
    f.locator('input[name=matricula]').fill('100200')
    f.locator('button[type=submit]').click()
    expect(pg.locator('#msg-novo')).to_have_text('Já existe um funcionário com esta matrícula.')
    pg.click('#dlg-novo [data-fechar]')
    ok('matrícula repetida é recusada')

    # Gerenciar: novo convite e nova senha
    linha.locator('button').click()
    expect(pg.locator('#dlg-func')).to_be_visible()
    expect(pg.locator('#func-acesso')).to_contain_text('Aguardando cadastrar o celular')
    bt = pg.locator('#func-botoes button').first
    expect(bt).to_have_text('Gerar novo convite')
    bt.click()
    expect(bt).to_contain_text('Confirmar')
    bt.click()
    expect(pg.locator('#dlg-acesso-t')).to_have_text('Novo convite')
    expect(pg.locator('#acesso-login')).to_be_hidden()
    link2 = pg.input_value('#acesso-link')
    assert link2 != link1
    pg.click('#acesso-ok')
    assert sql(f"select count(*) from public.convites_passkey where token_hash = encode(sha256(convert_to('{token1}','UTF8')),'hex') and expira_em > now()") == '0'
    ok('novo convite invalida o anterior')

    pg.locator('#tbody tr', has_text='Ana Pereira').locator('button').click()
    bt = pg.locator('#func-botoes button').nth(1)
    expect(bt).to_have_text('Redefinir senha')
    bt.click(); expect(bt).to_contain_text('Confirmar'); bt.click()
    expect(pg.locator('#dlg-acesso-t')).to_have_text('Senha redefinida')
    expect(pg.locator('#acesso-convite')).to_be_hidden()
    senha2 = pg.inner_text('#acesso-senha')
    pg.click('#acesso-ok')
    assert senha2 != senha1 and login_app('100200', senha2) and not login_app('100200', senha1)
    ok('redefinir senha: a nova funciona e a antiga não')

    # Celular cadastrado e revogação
    sql("insert into public.credenciais_passkey (pessoa_id, credential_id, public_key, dispositivo) "
        "select id, 'cred-ana', '\\x00', 'Galaxy da Ana' from public.pessoas where matricula = '100200'")
    pg.reload()
    linha = pg.locator('#tbody tr', has_text='Ana Pereira')
    expect(linha).to_contain_text('1 celular')
    linha.locator('button').click()
    expect(pg.locator('#func-aparelhos')).to_contain_text('Galaxy da Ana')
    expect(pg.locator('#func-botoes')).to_contain_text('Cadastrar outro celular')
    pg.screenshot(path=f'{SHOTS}/11-gerenciar.png')
    rv = pg.locator('#func-aparelhos button').first
    rv.click(); expect(rv).to_contain_text('Confirmar'); rv.click()
    expect(pg.locator('#func-aparelhos')).to_contain_text('Revogado')
    assert sql("select revogada_em is not null from public.credenciais_passkey where credential_id = 'cred-ana'") == 't'
    ok('RH vê o celular cadastrado e revoga em dois cliques')

    # Editar: matrícula fixa, nome/setor, desativar
    pg.fill('#func-nome', 'Ana Paula Pereira')
    pg.uncheck('#func-ativo')
    pg.click('#form-func button[type=submit]')
    expect(pg.locator('#msg-func')).to_have_text('Alterações salvas.')
    expect(pg.locator('#func-acesso')).to_contain_text('Cadastro inativo')
    expect(pg.locator('#func-botoes button')).to_have_count(0)
    pg.click('#dlg-func [data-fechar]')
    expect(pg.locator('#tbody tr', has_text='Ana Paula Pereira')).to_contain_text('Inativo')
    ok('editar nome e desativar: some o botão de acesso')

    pg.select_option('#f-situacao', 'inativo')
    expect(pg.locator('#tbody tr')).to_have_count(1)
    pg.select_option('#f-situacao', '')
    pg.fill('#q', '024681')
    expect(pg.locator('#tbody tr')).to_have_count(1)
    expect(pg.locator('#tbody')).to_contain_text('João da Silva')
    pg.fill('#q', '')
    ok('filtros por situação e busca por matrícula')

    # Funcionário sem acesso → criar depois
    pg.click('#novo')
    f.locator('input[name=nome]').fill('Bruno Lima')
    f.locator('input[name=matricula]').fill('B-77')
    f.locator('input[name=criarAcesso]').uncheck()
    f.locator('button[type=submit]').click()
    expect(pg.locator('#aviso')).to_contain_text('Funcionário Bruno Lima cadastrado')
    linha = pg.locator('#tbody tr', has_text='Bruno Lima')
    expect(linha).to_contain_text('Sem acesso')
    linha.locator('button').click()
    pg.click('#func-botoes button:has-text("Criar acesso ao app")')
    expect(pg.locator('#dlg-acesso-t')).to_have_text('Acesso criado')
    senha3 = pg.inner_text('#acesso-senha')
    pg.click('#acesso-ok')
    assert login_app('B-77', senha3)
    ok('cadastrar sem acesso e criar o acesso depois (matrícula com hífen)')
    pg.screenshot(path=f'{SHOTS}/12-funcionarios.png', full_page=True)

    # ---------- PORTEIRO ----------
    pg.click('.user button')
    pg.wait_for_url('**/login.html*')
    entrar('porteiro@sacchelli.com.br')
    assert pg.locator('nav a', has_text='Funcionários').count() == 0
    msg = pg.evaluate("""async () => { try { await API.acessoFuncionario('novo_convite', '20000000-0000-0000-0000-000000000001'); return 'passou'; } catch (e) { return e.message; } }""")
    assert 'Apenas RH' in msg, msg
    pg.goto(BASE + '/funcionarios.html')
    expect(pg.locator('main')).to_contain_text('Acesso restrito')
    ok('porteiro: sem menu, sem tela e a função recusa (403)')
    b.close()

print(f'\n{len(passos)} verificações passaram.')
if erros:
    print('\nERROS NO CONSOLE:'); [print(' -', e) for e in erros]; sys.exit(1)
print('Nenhum erro no console (inclui CSP).')
