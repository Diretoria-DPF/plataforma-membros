/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * guiaPlataforma.test.js — guia geral da plataforma na base da Lia (docs/lia/GUIA-PLATAFORMA.md →
 * worker/src/assistant/guiaPlataforma.js → buildDocuments(), fonte 'guia-plataforma').
 * Garante: o módulo gerado é igual ao markdown (quebras de linha normalizadas), as seções de
 * administração ficam fora do acervo, cada trecho cabe e não tem cara de instrução, o guia cobre
 * todas as áreas pedidas e só cita rótulos de tela que existem de verdade no front.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIA_PLATAFORMA_MARKDOWN, GUIA_SOURCE, isAdminSection } from '../src/assistant/guiaPlataforma.js';
import { buildDocuments, chunkMarkdown } from '../src/assistant/docs.js';
import { looksLikeInjection } from '../src/assistant/moderationRules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const lf = (text) => String(text).replace(/\r\n?/g, '\n');
const readRepo = (rel) => lf(fs.readFileSync(path.join(repo, rel), 'utf8'));
const MD = readRepo('docs/lia/GUIA-PLATAFORMA.md');
const sectionsOf = (markdown) => (markdown.match(/^## .+$/gm) || []).map((l) => l.slice(3).trim());

// Arquivos do front onde os rótulos citados pelo guia precisam existir (o guia não inventa tela).
const FRONT_FILES = [
  'frontend/index.html', 'frontend/app.js', 'frontend/mfa.js', 'frontend/credential.js', 'frontend/messaging.js',
  'frontend/library.js', 'frontend/library-detail.js', 'frontend/blog.html', 'frontend/blog/instalar.js',
  'frontend/admin-ai.js', 'frontend/admin-library.js', 'frontend/admin-library-lote.js', 'frontend/home.js', 'frontend/app-menu.js',
];
const UI_LABELS = [
  'Esqueci minha senha', 'Enviar link', 'Salvar nova senha', 'Criar conta', 'Completar perfil (opcional)', 'Verificar', 'Mostrar senha',
  'Trocar foto', 'Salvar perfil', 'Salvar preferências', 'Enviar feedback', 'Minhas métricas',
  'Ativar verificação em duas etapas', 'Confirmar e ativar', 'Baixar .txt',
  'Ver eventos', 'Ver tarefas', 'Abrir mensagens',
  'Inscrever-se', 'Inscrição confirmada', 'Meu crachá virtual (QR de presença)', 'Ampliar QR', 'Salvar imagem',
  'Enviar proposta', 'Minhas propostas', 'Votação aberta', 'Comentar', 'Voto registrado',
  'Aderir', 'Marcar como concluída', 'Comentários', 'Enviar mensagem', 'Limpar',
  'Enviar pedido', 'Pedidos de amizade', 'Adicionar de volta', 'Recusar', 'Denunciar', 'Enviar denúncia',
  'Acessar blog', 'Conheça a LAIFT', 'Instalar o blog',
  'Sugerir artigo', 'Enviar sugestão', 'Sugestão enviada.', 'Buscar artigos', 'Limpar filtros', 'Carregar mais', 'Só acesso aberto',
  'Abrir no site oficial', 'Salvar nos favoritos', 'Remover dos favoritos', 'Copiar citação', 'Citação copiada.', 'Voltar às coleções',
  'Reindexar base da Lia', 'Buscar dados', 'Aprovar referência', 'Publicar', 'Trabalho em lote',
];

describe('guia da plataforma: fonte única', () => {
  test('o módulo gerado é igual ao markdown (rode node scripts/gen-guia-plataforma.mjs se divergir)', () => {
    expect(lf(GUIA_PLATAFORMA_MARKDOWN)).toBe(MD);
  });

  test('o acervo traz uma seção por "## " do guia, menos as de administração', () => {
    const fromDocs = buildDocuments().filter((d) => d.source === GUIA_SOURCE).map((d) => d.section);
    const expected = sectionsOf(MD).filter((s) => !isAdminSection(s));
    expect(fromDocs).toEqual(expected);
    expect(fromDocs.length).toBeGreaterThanOrEqual(18);
    expect(sectionsOf(MD).filter(isAdminSection).length).toBeGreaterThanOrEqual(2);
    expect(buildDocuments().some((d) => d.source === GUIA_SOURCE && /^Administração/.test(d.section))).toBe(false);
    expect(buildDocuments().some((d) => /Reindexar|curadoria da Biblioteca/i.test(d.section))).toBe(false);
  });

  test('cada trecho cabe em 1.200 caracteres, é texto puro e não passa no filtro de injeção', () => {
    chunkMarkdown(GUIA_SOURCE, MD).forEach((chunk) => {
      expect(chunk.content.length).toBeLessThanOrEqual(1200);
      expect(chunk.content).not.toMatch(/[<>]/);
      expect(looksLikeInjection(chunk.content)).toBe(false);
    });
  });

  test.each([
    ['Entrar'], ['Criar conta'], ['senha'], ['Perfil'], ['duas etapas'], ['Início'], ['Aprender'], ['Eventos'],
    ['Crachá'], ['Propostas'], ['Tarefas'], ['Mensagens'], ['Equipe'], ['Biblioteca'], ['Blog'], ['Instalar'],
    ['Menu'], ['Papéis'], ['modo administrador'],
  ])('cobre a área "%s"', (word) => {
    expect(sectionsOf(MD).some((s) => s.toLowerCase().includes(word.toLowerCase()))).toBe(true);
  });

  test('passos curtos e numerados: toda seção de uso começa pelo passo 1', () => {
    const semPassos = ['Tela Início: o resumo', 'Papéis: visitante, membro e administrador', 'Menu e avisos de pendência', 'Administração: Reindexar a base da Lia'];
    chunkMarkdown(GUIA_SOURCE, MD).filter((c) => !semPassos.includes(c.section)).forEach((c) => {
      expect({ section: c.section, numbered: /\b1\. /.test(c.content) }).toEqual({ section: c.section, numbered: true });
    });
  });

  test('o guia não inventa tela: cada rótulo citado existe no front', () => {
    const front = FRONT_FILES.map(readRepo).join('\n');
    UI_LABELS.forEach((label) => {
      expect({ label, noGuia: MD.includes(label) }).toEqual({ label, noGuia: true });
      expect({ label, noFront: front.includes(label) }).toEqual({ label, noFront: true });
    });
  });

  test('sem e-mail fora do oficial e sem sequência longa de dígitos', () => {
    const emails = MD.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || [];
    expect(emails.every((e) => e === 'laiftligauninassau@gmail.com')).toBe(true);
    expect(MD).not.toMatch(/\d{8,}/);
  });
});
