# L06: Golden set ampliado da Lia (depois de L03)

**Objetivo.** Medir a recuperação sobre o conteúdo novo de L03 e travar regressões: perguntas positivas para as fontes novas, mais perguntas negativas, e baseline atualizado.

**Passo 0.** Leia `worker/test/ragEval.test.js` (métricas, `BASELINE_RECALL_AT_4`, tolerância de 0,07, negativos sem nenhum trecho), `worker/test/fixtures/rag-eval.json` (formato `{ pergunta, secao }`; `secao: null` = negativo) e os títulos novos em `worker/src/assistant/docsConteudo.js` (de L03). Se `docsConteudo.js` não existir, pare e reporte.

**Arquivos-donos.** `worker/test/fixtures/rag-eval.json` e `worker/test/ragEval.test.js`.

**Requisitos.**
1. Pelo menos 2 positivas por fonte nova (`plataforma`, `modulos`, `publicacoes`, `processo`, `faq`, `saude`), totalizando pelo menos 12. As perguntas devem soar como as de um membro e usar **paráfrase** (não copie palavras do título nem da primeira frase da seção).
2. Pelo menos 4 negativas novas, fora do domínio (culinária, futebol, geografia, programação). Nenhuma pode tocar em saúde nem na Liga: essas têm resposta legítima na base.
3. Mantenha as 24 positivas atuais e os negativos existentes; não apague nenhuma pergunta.
4. Rode o teste e atualize `BASELINE_RECALL_AT_4` para o valor medido (`acertos/total`) e o comentário do histórico (data 2026-10-09, quantas positivas, recall e falsos positivos), no estilo do comentário atual.
5. Se um negativo achar trecho, **não** apague o negativo. Reporte a seção culpada para L03 ou para a sessão principal.
6. Mantenha a fixture em UTF-8 sem BOM e com LF.

**Aceite (comando).**
```bash
cd "C:/Users/Administrador/Desktop/plataforma membro/worker" && npm test -- -i test/ragEval.test.js test/docsConteudo.test.js
```
Esperado: verde, 0 falsos positivos e a linha `[ragEval] recall@4 = X/Y` colada no relatório.

**Regras.** Sem git, sem banco, sem flag. Não mexa em `constants.js` (os limiares são calibrados em outra etapa). GateGuard: se o hook pedir fatos, escreva 2 linhas (quem usa: o CI do worker e a calibração O21/O36; a instrução: "conteúdo novo da base com golden set ampliado") e repita a mesma chamada.

**Relatório (até 12 linhas).** Positivas e negativas antes e depois, o recall@4 antes e depois, as seções que não aparecem no top 4 e a sugestão de reescrita.
