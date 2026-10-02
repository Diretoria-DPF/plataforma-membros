# Revisão técnica prévia — 30 compostos v2 (PR 3.2, Bloco C)

- **Arquivos:** `compostos-a.json` (15) e `compostos-b.json` (15).
- **Revisor:** agente de revisão farmacológica, em 02/10/2026. É uma revisão prévia, não aprovação; a aprovação é do conselho.
- **Veredito do agente:** precisa de correções. Há 2 problemas de gravidade alta e várias médias.
- **Ressalva do revisor:** os valores de Goodman & Gilman (Apêndice II) que ele cita vêm de memória. O conselho confere na obra.

## Decisões para a aplicação
- **Valor de bula ou de literatura primária fora de `fontes.json`:** vai com `exception: true` e `justificativa`, nunca atribuído a um livro que não o traz.
- **`pk.cmaxRef`:** nenhum por enquanto. Não há valor com página nas obras listadas; o teste canônico usa só o Tmax.
- **Hidroclorotiazida:** passa a usar os valores de livro-texto (G&G: Vd ≈ 0,83 L/kg, t½ ≈ 2,5 h), no lugar dos terminais de bula.
- **Glibenclamida:** mantém t½ 10 h (terminal), com `exception` e justificativa. A duração do efeito, de 12 a 24 h, entra em `pd.efeito`.

## Correções
| Arq. | id | Campo | Problema | Correção | Grav. |
|---|---|---|---|---|---|
| b | atropina | clinicalUse | "Reversão do bloqueio muscarínico da neostigmina" está invertido. | "Antissialogogo na pré-anestesia e prevenção dos efeitos muscarínicos (bradicardia, hipersecreção) da neostigmina na reversão do bloqueio neuromuscular". | alta |
| a | aas | pk.tmax, pk.ka | Flip-flop: ka < ke, e a curva cai com o dobro da t½ exibida. | `tmax` 0,3; `ka` 3,5 (Tmax simulado ≈ 0,32 h); citar a faixa de 0,25 a 0,5 h. | alta |
| a | amoxicilina | pk.tmax, pk.ka | Flip-flop leve: 1,5 h é inalcançável com t½ de 1 h. | `tmax` 1,0; `ka` 1,5. | média |
| b | omeprazol | pk.tmax | Valor forçado. | `tmax` 1,3 (`ka` 0,9); faixa de 0,5 a 3,5 h no texto. | baixa |
| a | dipirona | sources | Os livros listados cobrem mal; Rowland com título duvidoso. | `exception: true` + justificativa (parâmetros do 4-MAA de literatura primária e bula; obra `airton` pendente de confirmação). | média |
| a | enalapril | pk.vd | Vd aparente ajustado, sem valor de livro. | Manter 50 L; fonte por `exception` com a justificativa; dizer isso em `pd.efeito`. | média |
| a | hidroclorotiazida | pk.vd, pk.halfLife | Valores terminais atribuídos a Goodman. | `vd` 58; `halfLife` 2,5; `ka` ≈ 0,82, recalculado para Tmax de 2 h. | média |
| b | metformina | pk.vd; pd.efeito | Vd alto; "hipoglicemiante". | `vd` 200; t½ declarado como terminal; "efeito anti-hiperglicemiante (redução da produção hepática de glicose)". | média/baixa |
| b | glibenclamida | pk.halfLife | O livro tabela valor menor. | Manter 10 h, com `exception` (t½ terminal de bula) e a duração de 12 a 24 h em `pd.efeito`. | média |
| b | sertralina | pk.F | F absoluta não determinada. | `exception` + justificativa ("estimativa didática"); aviso em `pd.efeito`. | média |
| b | sertralina, fluoxetina | pd.efeito | "Ocupação do SERT" com EC50 da faixa terapêutica. | "Efeito antidepressivo. A EC50 usada reflete a faixa terapêutica clínica, não a ocupação do SERT, que satura em concentrações bem menores." | média |
| b | atropina | pd.efeito | O texto contém "revisar". | Remover; "EC50 de efeitos muscarínicos em indivíduos sadios (≈ 1 a 4 ng/mL); na intoxicação a EC50 aparente é maior". | média |
| b | azitromicina | pd.efeito | Cmax do modelo ≈ 5× abaixo do sérico. | Acrescentar o aviso de que o modelo plasmático não representa a concentração tecidual. | média |
| a | anlodipino, amoxicilina | targetSid | Ausente (o código cairia no fígado). | Anlodipino: `za:left-ventricle`. Amoxicilina: `za:palatine-tonsil-r`. Conferir que existem em `structures.json`. | média |
| b | todos | clinicalUse | Notas do modelo aparecem como indicações. | Mover as notas para `pd.efeito`; em `clinicalUse` ficam só indicações; padronizar a pontuação. | média |
| a, b | todos | sources[].ref | Títulos genéricos; Katzung citado para tmax. | Refs por tema honesto (sem inventar capítulo); `pk.*` unificado em Goodman (tabela de dados farmacocinéticos) quando o dado é de lá, senão `exception`. | média |
| a | prednisolona | pk.vd | Fonte Rowland. | `obraId` goodman. | baixa |
| a, b | atenolol, hidroclorotiazida, gentamicina, vancomicina, metformina; azitromicina, enoxaparina | metabolites | Ausente. | `[]` nos excretados inalterados; azitromicina e enoxaparina com os itens propostos (inativos). | baixa |
| b | gentamicina, vancomicina | pk.tmax | O tmax de fim de infusão não é simulado. | `tmax` 0 e `ka` 0; infusão citada em `pd.efeito`. | baixa |
| a | paracetamol | contraindications; interactions | "Dose > 4 g" como CI; etanol "grave". | CI: "Hepatopatia grave descompensada"; o limite de dose sai da lista; etanol: "moderada". | baixa |
| b | varfarina | interactions | Rifampicina "moderada". | "grave". | baixa |
| a, b | vários | contraindications | Cautelas listadas como CI. | Separar; tirar "cautela" da lista de CI. | baixa |
| b | amitriptilina, sertralina | pd.efeito | Falta o aviso de dose única. | "A dose única simulada não atinge a faixa terapêutica de equilíbrio". | baixa |
| b | midazolam | pd.efeito | EC50 é a do início do efeito. | "Ansiólise e sedação leve (início do efeito)". | baixa |
| a | diclofenaco | targetSid | Fígado foge do padrão dos AINEs. | `za:stomach`. | baixa |
| b | enoxaparina | targetSid | Ventrículo esquerdo. | `za:pulmonary-trunk` (TEV e embolia pulmonar). | baixa |
| a, b | vários | texto | Anglicismos e grafia inconsistente. | clearance → depuração; feedback → retrocontrole; DOACs → ACODs; off-label → uso fora da bula; SIADH → SSIHAD; bolus → em bolo; t1/2 → t½; AUC → ASC; β-lactâmico. | baixa |

## Aplicação
- **Aplicado (02/10/2026):** todas as linhas de "Correções" e das "Decisões" nos dois arquivos, com `review.status: "editorial"` mantido e `compounds.json` intocado. Os `targetSid` propostos (`za:left-ventricle`, `za:palatine-tonsil-r`, `za:stomach`, `za:pulmonary-trunk`) existem em `structures.json`.
- **Validações:** ajv contra `compoundV2` sem erros nos 30 compostos; Tmax simulado a até 7% (aas 0,32 h, amoxicilina 0,96 h, omeprazol 1,26 h, hidroclorotiazida 2,00 h) do `tmax` citado, sem flip-flop, e IV com `tmax` 0 (gentamicina e vancomicina também com `ka` 0); `obraId` todos em `fontes.json`; busca pelos termos proibidos vazia; sem URL, DOI ou PMID.
- **Exceções com justificativa:** dipirona (`pk.F`, `pk.halfLife`, `pk.vd`, `pk.tmax`, obra `airton`), enalapril (`pk.vd`), sertralina (`pk.F`), glibenclamida e metformina (`pk.halfLife`, t½ terminal).
- **Aplicado só em parte ou com decisão minha:** os itens propostos de `metabolites` de azitromicina e enoxaparina não estavam na lista e foram redigidos aqui (inativos), para o conselho conferir; as refs de mecanismo, uso e efeitos adversos foram mantidas (já são por tema), e só as de `pk.*` foram unificadas em Goodman; as cautelas tiradas de `contraindications` foram para `pd.efeito`. Nenhuma linha deixou de ser aplicada.
