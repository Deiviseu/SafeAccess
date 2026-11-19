"""Teste do app do funcionário (login real) no Chrome com tela de celular."""
import json, os, re, subprocess, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

APP = 'http://localhost:4174'
SB = 'http://127.0.0.1:8787'
SHOTS = '/tmp/shots'
os.makedirs(SHOTS, exist_ok=True)
erros, passos = [], []
expect.set_options(timeout=10000)


def ok(msg):
    passos.append(msg); print('OK ', msg, flush=True)


def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'safeaccess', '-qAt', '-c', q],
                          capture_output=True, text=True, check=True).stdout.strip()


def post(url, corpo, token=None):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = 'Bearer ' + token
    return json.load(urllib.request.urlopen(urllib.request.Request(url, json.dumps(corpo).encode(), h)))


# RH entra e libera o acesso da Ana pela Edge Function (como na tela Funcionários)
rh = post(SB + '/auth/v1/token?grant_type=password', {'email': 'rh@sacchelli.com.br', 'password': 'senha-teste-123'})['access_token']
ana = sql("insert into public.pessoas (tipo, nome, matricula, setor_id) values ('funcionario','Ana Paula Pereira','100200','10000000-0000-0000-0000-000000000001') returning id").splitlines()[0]
senha_inicial = post(SB + '/functions/v1/rh-acesso-funcionario', {'acao': 'criar', 'pessoa_id': ana}, rh)['senha']

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    ctx = b.new_context(**p.devices['Pixel 7'], locale='pt-BR', timezone_id='America/Sao_Paulo')
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'console.{m.type}: {m.text}') if m.type in ('error', 'warning') and 'Failed to load resource' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))

    def entrar(matricula, senha):
        pg.get_by_label('Matrícula').fill(matricula)
        pg.get_by_label('Senha', exact=True).fill(senha)
        pg.get_by_role('button', name='Entrar').click()

    pg.goto(APP + '/inicio')
    pg.wait_for_url(APP + '/')
    expect(pg.get_by_text('Bem-vindo de volta')).to_be_visible()
    assert 'demonstração' not in pg.content().lower()
    ok('sem login, /inicio volta para o login; nada de dados de demonstração')

    entrar('100200', 'senha-errada')
    expect(pg.get_by_role('alert')).to_have_text('Matrícula ou senha inválida.')
    expect(pg.get_by_label('Senha', exact=True)).to_have_value('')
    ok('senha errada: mensagem clara e campo de senha limpo')

    entrar(' 100200 ', senha_inicial)
    pg.wait_for_url(APP + '/trocar-senha')
    expect(pg.get_by_role('heading', name='Crie sua senha')).to_be_visible()
    expect(pg.get_by_text('Olá, Ana.')).to_be_visible()
    pg.goto(APP + '/inicio')
    pg.wait_for_url(APP + '/trocar-senha')
    ok('primeiro acesso: login com a senha do RH leva à troca obrigatória (não dá para pular)')

    def trocar(nova, conf=None):
        pg.get_by_label('Nova senha', exact=True).fill(nova)
        pg.get_by_label('Confirme a nova senha').fill(nova if conf is None else conf)
        pg.get_by_role('button', name='Salvar senha').click()

    trocar('abc12')
    expect(pg.get_by_role('alert')).to_contain_text('pelo menos 8')
    trocar('abcdefghij')
    expect(pg.get_by_role('alert')).to_contain_text('letras e números')
    trocar('ana100200x')
    expect(pg.get_by_role('alert')).to_contain_text('matrícula')
    trocar('Portaria2026', 'Portaria2025')
    expect(pg.get_by_role('alert')).to_contain_text('não são iguais')
    if re.search(r'\d', senha_inicial) and re.search(r'[A-Za-z]', senha_inicial):
        trocar(senha_inicial)  # igual à atual: o servidor recusa
        expect(pg.get_by_role('alert')).to_have_text('A nova senha precisa ser diferente da atual.')
    ok('regras da nova senha: tamanho, letras+números, sem matrícula, confirmação e diferente da atual')

    trocar('Portaria2026')
    pg.wait_for_url(APP + '/inicio')
    expect(pg.get_by_text('Senha alterada com sucesso.')).to_be_visible()
    expect(pg.get_by_role('heading', name='Olá, Ana.')).to_be_visible()
    expect(pg.get_by_text('Matrícula 100200 · Compras')).to_be_visible()
    expect(pg.get_by_text('Nenhum acesso registrado ainda.')).to_be_visible()
    pg.screenshot(path=f'{SHOTS}/20-app-inicio.png')
    ok('senha trocada → Início com nome, matrícula e setor reais')

    # Passagens registradas pela portaria aparecem no app (e o login continua salvo após recarregar)
    sql(f"insert into public.movimentacoes (pessoa_id, metodo_entrada, entrada_registrada_por) values ('{ana}', 'qr', '00000000-0000-0000-0000-00000000000b')")
    sql(f"update public.movimentacoes set saida_em = now(), metodo_saida = 'manual', saida_registrada_por = '00000000-0000-0000-0000-00000000000b' where pessoa_id = '{ana}'")
    pg.reload()
    expect(pg.get_by_role('heading', name='Olá, Ana.')).to_be_visible()
    lista = pg.locator('ul').first
    expect(lista.locator('li')).to_have_count(2)
    expect(lista.locator('li').nth(0)).to_contain_text('Saída registrada')
    expect(lista.locator('li').nth(0)).to_contain_text('Manual')
    expect(lista.locator('li').nth(1)).to_contain_text('Entrada registrada')
    expect(lista.locator('li').nth(1)).to_contain_text('QR Code')
    ok('login continua salvo ao recarregar; últimos acessos vêm do banco (entrada por QR, saída manual)')

    pg.get_by_role('link', name='Perfil').click()
    pg.wait_for_url(APP + '/perfil')
    expect(pg.get_by_text('Compras')).to_be_visible()
    pg.get_by_role('button', name='Alterar senha').click()
    expect(pg.get_by_role('heading', name='Alterar senha')).to_be_visible()
    pg.get_by_role('button', name='Cancelar').click()
    pg.wait_for_url(APP + '/perfil')
    pg.screenshot(path=f'{SHOTS}/21-app-perfil.png')
    pg.get_by_role('button', name='Sair da conta').click()
    pg.get_by_role('dialog').get_by_role('button', name='Sair').click()
    pg.wait_for_url(APP + '/')
    pg.goto(APP + '/perfil')
    pg.wait_for_url(APP + '/')
    ok('perfil real, alterar senha opcional e sair encerra a sessão')

    entrar('100200', 'Portaria2026')
    pg.wait_for_url(APP + '/inicio')
    ok('com a senha nova, entra direto no Início (sem pedir troca)')

    # RH redefine a senha → próximo login exige troca de novo
    nova_rh = post(SB + '/functions/v1/rh-acesso-funcionario', {'acao': 'redefinir_senha', 'pessoa_id': ana}, rh)['senha']
    pg.get_by_role('link', name='Perfil').click()
    pg.get_by_role('button', name='Sair da conta').click()
    pg.get_by_role('dialog').get_by_role('button', name='Sair').click()
    pg.wait_for_url(APP + '/')
    entrar('100200', 'Portaria2026')
    expect(pg.get_by_role('alert')).to_have_text('Matrícula ou senha inválida.')
    entrar('100200', nova_rh)
    pg.wait_for_url(APP + '/trocar-senha')
    trocar('Sacchelli77')
    pg.wait_for_url(APP + '/inicio')
    ok('senha redefinida pelo RH: a antiga para de valer e a troca volta a ser obrigatória')

    # RH desativa o cadastro: quem estava logado cai no próximo carregamento, e o login é recusado
    sql(f"update public.pessoas set ativo = false where id = '{ana}'")
    pg.reload()
    pg.wait_for_url(APP + '/')
    entrar('100200', 'Sacchelli77')
    expect(pg.get_by_role('alert')).to_have_text('Seu cadastro não está ativo no app. Procure o RH.')
    pg.screenshot(path=f'{SHOTS}/22-app-inativo.png')
    ok('funcionário desativado: sessão encerrada e login recusado com mensagem do RH')

    pg.get_by_role('link', name='Esqueci minha senha').click()
    expect(pg.get_by_text('Procure o RH com a sua matrícula.')).to_be_visible()
    ok('recuperar senha orienta procurar o RH (sem simulação de e-mail)')
    b.close()

print(f'\n{len(passos)} verificações passaram.')
if erros:
    print('\nERROS NO CONSOLE:'); [print(' -', e) for e in erros]; sys.exit(1)
print('Nenhum erro no console.')
