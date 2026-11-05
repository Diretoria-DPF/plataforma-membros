/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Migração 053 (banco próprio de química) contra um Postgres real (PGlite): fontes semeadas, proveniência
// obrigatória, nivel_conteudo e o gatilho que reprova processo 'completo' para espécie restrita.
import { createMigratedDb } from './helpers/pgliteSql.js';

const KEY = (n) => 'ABCDEFGHIJKLMN-ABCDEFGHIJ-' + n;

describe('053 — banco próprio de química', () => {
  let db;
  let fonte;
  beforeAll(async () => {
    db = await createMigratedDb();
    fonte = (await db.query("SELECT id FROM chem_sources WHERE slug = 'curadoria_laift'")).rows[0].id;
  }, 60000);
  afterAll(async () => { await db.close(); });

  const novaSubstancia = (slug, key, extra = {}) => {
    const c = { nivel: 'completo', restricao: null, ...extra };
    return db.query(
      `INSERT INTO chem_substances (inchikey, slug, smiles, smiles_canon, formula, nome_pt, nivel_conteudo, restricao)
       VALUES ($1, $2, 'O', 'O', 'H2O', $3, $4, $5) RETURNING id`,
      [KEY(key), slug, slug, c.nivel, c.restricao]
    ).then((r) => r.rows[0].id);
  };

  test('fontes de referência semeadas, só as permitidas, nenhuma não redistribuível', async () => {
    const { rows } = await db.query('SELECT slug, redistribuivel FROM chem_sources ORDER BY slug');
    expect(rows.map((r) => r.slug)).toEqual(['chebi', 'chembl', 'curadoria_laift', 'ord', 'pdb', 'pubchem', 'rdkit']);
    expect(rows.every((r) => r.redistribuivel)).toBe(true);
  });

  test('a flag lab_chem_proxy_enabled nasce desligada', async () => {
    const { rows } = await db.query("SELECT enabled FROM feature_flags WHERE key = 'lab_chem_proxy_enabled'");
    expect(rows).toEqual([{ enabled: false }]);
  });

  test('InChIKey mal formado e espécie restrita marcada como completa são recusados', async () => {
    await expect(db.query("INSERT INTO chem_substances (inchikey, slug, smiles, smiles_canon, formula, nome_pt) VALUES ('abc','x','O','O','H2O','x')")).rejects.toThrow();
    await expect(novaSubstancia('restrita_completa', 'A', { restricao: 'ilicita', nivel: 'completo' })).rejects.toThrow();
  });

  test('propriedade exige fonte, valor e confiança de 1 a 5', async () => {
    const id = await novaSubstancia('agua', 'B');
    await db.query("INSERT INTO chem_properties (substance_id, chave, valor_num, unidade, source_id, fetched_at, confianca) VALUES ($1,'bp',100,'°C',$2, now(), 2)", [id, fonte]);
    await expect(db.query("INSERT INTO chem_properties (substance_id, chave, valor_num, unidade, source_id, fetched_at, confianca) VALUES ($1,'fp',0,'°C',$2, now(), 9)", [id, fonte])).rejects.toThrow();
    await expect(db.query("INSERT INTO chem_properties (substance_id, chave, unidade, source_id, fetched_at) VALUES ($1,'fp','°C',$2, now())", [id, fonte])).rejects.toThrow();
    await expect(db.query("INSERT INTO chem_properties (substance_id, chave, valor_num, unidade, source_id, fetched_at) VALUES ($1,'fp',1,'°C',NULL, now())", [id])).rejects.toThrow();
  });

  test('gatilho: processo de síntese "completo" para espécie educacional é recusado; educacional passa', async () => {
    const op = await novaSubstancia('opioide', 'C', { nivel: 'educacional', restricao: 'opioide_sintese' });
    const ins = (nivel, tipo) => db.query(
      "INSERT INTO pharma_processes (slug, nome_pt, tipo, nivel_conteudo, produto_substance_id, source_id) VALUES ($1,'p',$2,$3,$4,$5)",
      ['p_' + nivel + '_' + tipo, tipo, nivel, op, fonte]
    );
    await expect(ins('completo', 'sintese')).rejects.toThrow(/educacional/);
    await ins('educacional', 'sintese');
    // formulação do produto acabado (insumo → medicamento) de espécie opioide por rota é permitida
    await ins('completo', 'formulacao');
  });

  test('gatilho: processo "completo" de espécie de guerra ou ilícita é recusado em qualquer tipo, e UPDATE também', async () => {
    const id = await novaSubstancia('ilicita', 'D', { nivel: 'educacional', restricao: 'ilicita' });
    await expect(db.query("INSERT INTO pharma_processes (slug, nome_pt, tipo, nivel_conteudo, produto_substance_id, source_id) VALUES ('i1','p','formulacao','completo',$1,$2)", [id, fonte])).rejects.toThrow(/restrita/);
    await db.query("INSERT INTO pharma_processes (slug, nome_pt, tipo, nivel_conteudo, produto_substance_id, source_id) VALUES ('i2','p','formulacao','educacional',$1,$2)", [id, fonte]);
    await expect(db.query("UPDATE pharma_processes SET nivel_conteudo = 'completo' WHERE slug = 'i2'")).rejects.toThrow(/restrita/);
  });

  test('gatilho: não rebaixa substância a educacional enquanto houver rota de síntese completa', async () => {
    const id = await novaSubstancia('comum', 'E');
    await db.query("INSERT INTO pharma_processes (slug, nome_pt, tipo, nivel_conteudo, produto_substance_id, source_id) VALUES ('c1','p','sintese','completo',$1,$2)", [id, fonte]);
    await expect(db.query("UPDATE chem_substances SET nivel_conteudo = 'educacional', restricao = 'toxina_potente' WHERE id = $1", [id])).rejects.toThrow(/passe-a a educacional/);
  });

  test('passos, formulação, teste de CQ e equipamento aceitam linhas válidas', async () => {
    const id = await novaSubstancia('ativo', 'F');
    const p = (await db.query("INSERT INTO pharma_processes (slug, nome_pt, source_id) VALUES ('cap1','Cápsulas',$1) RETURNING id", [fonte])).rows[0].id;
    const eq = (await db.query("INSERT INTO lab_equipment (slug, nome_pt, tipo) VALUES ('balanca1','Balança analítica','balanca') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO pharma_process_steps (process_id, ordem, acao, descricao_pt, equipment_id) VALUES ($1,1,'pesar','Pesar o ativo',$2)", [p, eq]);
    await expect(db.query("INSERT INTO pharma_process_steps (process_id, ordem, acao, descricao_pt) VALUES ($1,1,'pesar','repetido')", [p])).rejects.toThrow();
    await db.query("INSERT INTO pharma_formulation_items (process_id, substance_id, funcao, quantidade, unidade) VALUES ($1,$2,'ativo',100,'mg')", [p, id]);
    await db.query("INSERT INTO pharma_qc_tests (process_id, ensaio, criterio, metodo_ref, source_id) VALUES ($1,'peso_medio','conforme a referência citada','Ref. citada',$2)", [p, fonte]);
    await expect(db.query("INSERT INTO pharma_qc_tests (ensaio, criterio, metodo_ref, source_id) VALUES ('x','y','z',$1)", [fonte])).rejects.toThrow();
  });

  test('RLS forçado e política laift_worker_all em todas as tabelas novas', async () => {
    const tabelas = ['chem_sources', 'chem_substances', 'chem_substance_aliases', 'chem_properties', 'chem_reactions', 'chem_reaction_species', 'lab_equipment', 'pharma_processes', 'pharma_process_steps', 'pharma_formulation_items', 'pharma_qc_tests'];
    const { rows } = await db.query(
      `SELECT c.relname FROM pg_class c WHERE c.relname = ANY($1)
       AND c.relrowsecurity AND c.relforcerowsecurity
       AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'laift_worker_all')`,
      [tabelas]
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...tabelas].sort());
  });
});
