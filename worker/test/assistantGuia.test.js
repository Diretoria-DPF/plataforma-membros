/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia como guia da plataforma inteira e da Biblioteca: intenções novas, papel de curador, lista branca
// (panel-library, open_library, panel-admin-library) e a frase de busca de artigos. Regra pura, sem banco.
import { matchIntent, INTENTS, PUBLIC_INTENTS, kbOutline } from '../src/assistant/kb.js';
import { buildAction, filterActions, libraryAction, ACTION_KEYS, TARGETS } from '../src/assistant/targets.js';
import { buildDocuments } from '../src/assistant/docs.js';
import { libraryTopic, cleanLibraryQuery } from '../src/assistant/libraryRefs.js';

describe('guia da plataforma: perguntas de uso → intenção', () => {
  test.each([
    ['como faço login?', 'entrar'],
    ['não consigo entrar na minha conta', 'entrar'],
    ['esqueci minha senha', 'senha'],
    ['como troco a senha?', 'senha'],
    ['como ativo a verificação em duas etapas', 'seguranca'],
    ['como crio uma conta?', 'cadastro'],
    ['o que aparece na tela de início?', 'inicio'],
    ['como instalo o app no celular?', 'instalar_app'],
    ['onde fica o blog?', 'blog_site'],
    ['o que é o número no menu?', 'menu_pendencias'],
    ['tenho notificações pendentes?', 'menu_pendencias'],
    ['o que o visitante pode fazer?', 'papeis'],
    ['me mostra o guia da plataforma', 'guia'],
    ['por onde começo?', 'guia'],
    ['como me inscrevo num evento?', 'eventos'],
    ['como mostro meu crachá na portaria', 'credencial'],
  ])('%s → %s', (message, id) => {
    const hit = matchIntent(message, [], 'member');
    expect(hit && hit.id).toBe(id);
  });

  test('as respostas do guia são passos curtos, numerados e em texto puro', () => {
    ['entrar', 'senha', 'seguranca', 'cadastro', 'instalar_app', 'blog_site', 'biblioteca', 'biblioteca_sugerir', 'biblioteca_salvar_citar', 'biblioteca_remocao', 'biblioteca_curadoria'].forEach((id) => {
      const intent = INTENTS.find((i) => i.id === id);
      expect(intent.reply).toMatch(/\n1\. /);
      expect(intent.reply).not.toMatch(/[<>]/);
      expect(intent.reply.length).toBeLessThanOrEqual(700);
    });
  });
});

describe('Lia e a Biblioteca: intenções', () => {
  test.each([
    ['Como uso a Biblioteca?', 'biblioteca'],
    ['onde busco artigos científicos?', 'biblioteca'],
    ['como sugiro um artigo?', 'biblioteca_sugerir'],
    ['quero indicar um artigo para a liga', 'biblioteca_sugerir'],
    ['como salvo um artigo nos favoritos?', 'biblioteca_salvar_citar'],
    ['como cito um artigo em ABNT?', 'biblioteca_salvar_citar'],
    ['como copio a citação em Vancouver', 'biblioteca_salvar_citar'],
    ['como peço remoção de um artigo?', 'biblioteca_remocao'],
    ['achei um artigo errado na biblioteca', 'biblioteca_remocao'],
  ])('%s → %s', (message, id) => {
    expect(matchIntent(message, [], 'member').id).toBe(id);
    expect(matchIntent(message, [], 'visitor').id).toBe(id);
  });

  test('curadoria só existe para admin ou curador; para os outros, "publicar" vira "sugerir"', () => {
    const question = 'como publico um artigo na biblioteca?';
    expect(matchIntent(question, [], 'member').id).toBe('biblioteca_sugerir');
    expect(matchIntent(question, [], 'visitor').id).toBe('biblioteca_sugerir');
    expect(matchIntent(question, [], 'admin').id).toBe('biblioteca_curadoria');
    expect(matchIntent(question, [], 'member', { curator: true }).id).toBe('biblioteca_curadoria');
    expect(matchIntent('como faço a curadoria da fila de triagem', [], 'member')).toBeNull();
    expect(matchIntent('como faço a curadoria da fila de triagem', [], 'member', { curator: true }).id).toBe('biblioteca_curadoria');
  });

  test('a curadoria não entra no acervo (RAG), no prompt da IA nem nas intenções públicas', () => {
    const curator = INTENTS.filter((i) => i.curatorOnly);
    expect(curator.map((i) => i.id)).toEqual(['biblioteca_curadoria']);
    expect(PUBLIC_INTENTS.some((i) => i.curatorOnly || i.adminOnly)).toBe(false);
    const kbSections = buildDocuments().filter((d) => d.source === 'kb').map((d) => d.section);
    curator.forEach((i) => expect(kbSections).not.toContain(i.title));
    expect(kbOutline()).not.toContain('biblioteca_curadoria');
    expect(kbOutline().length).toBeLessThan(2500);
  });

  test('as intenções da Biblioteca são marcadas (a flag library_enabled decide no serviço) e levam ao painel', () => {
    ['biblioteca', 'biblioteca_sugerir', 'biblioteca_salvar_citar', 'biblioteca_remocao'].forEach((id) => {
      const intent = INTENTS.find((i) => i.id === id);
      expect(intent.library).toBe(true);
      expect(filterActions(intent.actions, 'member').map((a) => a.target)).toContain('panel-library');
    });
    const cur = INTENTS.find((i) => i.id === 'biblioteca_curadoria');
    expect(filterActions(cur.actions, 'admin')).toEqual([{ type: 'navigate', target: 'panel-admin-library', label: 'Curadoria da Biblioteca' }]);
    expect(filterActions(cur.actions, 'member')).toEqual([]);
  });
});

describe('lista branca: Biblioteca', () => {
  test('panel-library para todo papel logado; curadoria só para admin; nada para anônimo', () => {
    ['visitor', 'member', 'admin'].forEach((role) => {
      expect(buildAction('navigate', 'panel-library', role)).toEqual({ type: 'navigate', target: 'panel-library', label: 'Biblioteca' });
    });
    expect(buildAction('navigate', 'panel-admin-library', 'member')).toBeNull();
    expect(buildAction('navigate', 'panel-admin-library', 'admin')).not.toBeNull();
    expect(buildAction('navigate', 'panel-library', null)).toBeNull();
    expect(ACTION_KEYS).toEqual(expect.arrayContaining(['navigate:panel-library', 'navigate:panel-admin-library', 'open_library:search']));
  });

  test('"Ver na Biblioteca" leva a busca pronta, limpa e curta; sem papel ou sem termo, nada', () => {
    expect(libraryAction('member', '  paracetamol   hepático ')).toEqual({ type: 'open_library', target: 'search', label: 'Ver na Biblioteca', query: 'paracetamol hepático' });
    expect(libraryAction('member', '<script>x</script> dose').query).toBe('script x /script dose');
    expect(libraryAction('member', 'a'.repeat(300)).query.length).toBe(120);
    expect(libraryAction(null, 'dose')).toBeNull();
    expect(libraryAction('member', '   ')).toBeNull();
    expect(libraryAction('member', { toString: () => 'x' })).toBeNull();
    expect(cleanLibraryQuery('a\u0000b‮c')).toBe('a b c');
  });

  test('open_library não entra no texto de destinos do acervo; panel-library entra', () => {
    expect(TARGETS.some((t) => t.type === 'open_library')).toBe(false);
    expect(TARGETS.some((t) => t.target === 'panel-library')).toBe(true);
  });
});

describe('frase de busca de artigos (libraryTopic)', () => {
  test.each([
    ['tem artigos sobre paracetamol?', 'paracetamol'],
    ['me indica artigos de toxicologia forense', 'toxicologia forense'],
    ['quero referências sobre intoxicação por metanol', 'intoxicação metanol'],
    ['quais artigos científicos em português sobre dipirona?', 'dipirona'],
    ['estudos sobre hepatotoxicidade do paracetamol', 'hepatotoxicidade paracetamol'],
    ['o que tem na biblioteca sobre antidotos', 'antidotos'],
    ['Preciso de bibliografia a respeito de farmacocinética clínica', 'farmacocinética clínica'],
  ])('%s → "%s"', (message, topic) => {
    expect(libraryTopic(message)).toBe(topic);
  });

  test.each([
    ['como sugiro um artigo?'],
    ['como cito um artigo sobre dipirona?'],
    ['como salvo artigos sobre dor nos favoritos'],
    ['como uso a biblioteca?'],
    ['artigos'],
    ['artigos sobre'],
    ['artigos sobre o de que'],
    ['quais eventos estão abertos?'],
    ['como peço remoção de um artigo sobre dose?'],
    ['como publico artigos sobre toxicologia?'],
  ])('"%s" não é pedido de artigos', (message) => {
    expect(libraryTopic(message)).toBeNull();
  });

  test('entrada que não é texto ou longa demais não vira busca', () => {
    expect(libraryTopic(null)).toBeNull();
    expect(libraryTopic({})).toBeNull();
    expect(libraryTopic('artigos sobre ' + 'dose '.repeat(40)).split(' ').length).toBeLessThanOrEqual(6);
  });
});
