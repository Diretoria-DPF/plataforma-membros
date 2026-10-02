# Prompt de tradução dos nomes — v3 (02/10/2026)

Usado pelo agente `atlas-tradutor-pt` (`.claude/agents/atlas-tradutor-pt.md`), um lote por chamada (PR 3.1.3, Onda 3). Toda mudança aqui sobe a versão (v2, v3…) e fica registrada no fim do arquivo; os `.pt.tsv` gerados citam a versão usada no relatório do PR.

## Fontes obrigatórias
1. **Glossário do atlas:** `frontend/modulos/anatomia-3d/data/atlas/glossario-pt.json`. O termo em `term_pt` vence; nunca use nada de `avoid`.
2. **Terminologia Anatômica (FIPAT, edição em português da SBA)**: seguir as convenções abaixo. A lista completa não é anexada ao prompt (tamanho e direitos); na dúvida entre duas formas, marque ` ??`.

## Regras
1. **Substantivo primeiro, adjetivos depois:** "Posterior tibiofibular ligament" → "Ligamento tibiofibular posterior"; "Long head of biceps femoris" → "Cabeça longa do músculo bíceps femoral".
2. **Termos oficiais:** Músculo, Nervo, Artéria, Veia, Linfonodo(s), Ligamento, Tendão, Fáscia, Bainha, Ramo, Tronco, Plexo, Giro, Sulco, Núcleo, Lobo, Segmento, Face (para *surface*), Margem (*border*), Incisura (*notch*), Forame, Fossa, Processo, Tubérculo, Tuberosidade, Côndilo, Epicôndilo, Cabeça, Colo, Corpo, Parte (*part*), Porção apenas quando a TA usar.
3. **Músculos com "músculo" explícito** quando o original é só o nome próprio: "Adductor minimus" → "Músculo adutor mínimo"; "Gluteus medius muscle" → "Músculo glúteo médio".
4. **Grafia brasileira:** "medula espinal" (não "espinhal"), "fíbula", "tireoide", "suprarrenal", "encéfalo" para *brain*, "cérebro" só para *cerebrum*.
5. **Sem anglicismos e sem latim cru**, a não ser quando a TA em português mantém o latim (ex.: "Ligamento venoso" para *Ligamentum venosum*; "Porta do fígado" para *Porta hepatis*).
6. **Lado:** não acrescente "esquerdo/direito" — o código põe o lado. Mas **mantenha** "esquerdo/direito" quando faz parte do nome anatômico (ex.: "Left anterolateral segment" do fígado → "Segmento anterolateral esquerdo").
7. **Parênteses:** se o original tem parênteses, a tradução também tem (no Z-Anatomy eles marcam grupos).
8. **Ruído da fonte:** ignore prefixos de base de dados ("Allen …"), sufixos numéricos ("segment1") e corrija erros de digitação evidentes ("Hepataduodenal" → hepatoduodenal, "superiomedial" → superomedial, "ingulo" → cíngulo). Abreviações: HTH = hipotálamo.
9. **Epônimos e números** ficam como estão ("Nervo de Arnold" só se a TA usar; "Vértebra C7").
10. **Concordância:** gênero e número corretos ("Veia cava superior", "Linfonodos ilíacos externos").
11. **Ordinais e numerais:** use a forma da TA com algarismo romano depois do nome — "Second metacarpal bone" → "Osso metacarpal II"; "Fifth metatarsal bone" → "Osso metatarsal V"; "Third cervical vertebra" → "Vértebra C3" (ou "Terceira vértebra cervical"); nervos cranianos com romano ("Nervo oculomotor (NC III)" só se o original trouxer o número). Nunca "Osso metacarpo segundo".
12. **Nome consagrado curto** quando a TA o usa: "Sinus of frontal bone" → "Seio frontal"; "Body of sternum" → "Corpo do esterno".
13. **Decisões fixas da revisão cruzada (v3):** valvas do coração = **valva** ("Valva da aorta", "Valva mitral", "Valva do tronco pulmonar", "Valva tricúspide"); a peça semilunar = **válvula semilunar**; olho = **bulbo do olho**; **orbital/orbitais** (nunca "orbitário"); **Polo**, **-oide** sem acento ("amigdaloide", "sigmoide"; "sigmóideo" mantém); língula do pulmão = **lingular**; "broncopulmonar", "tênia", "colo"; ligamentos e músculos **-espinal** (supraespinal, sacroespinal); remova o asterisco "*" do original.
14. **Dúvida real** (dois termos aceitos, termo que você não conhece, nome ambíguo): termine a linha com ` ??`. Melhor marcar do que inventar.

## Exemplos
```
Posterior tibiofibular ligament	Ligamento tibiofibular posterior
(Accessory parotid gland)	(Glândula parótida acessória)
Allen inferior frontal gyrus opercular part	Parte opercular do giro frontal inferior
Anterior tibial node	Linfonodo tibial anterior
Diaphragmatic surface of liver	Face diafragmática do fígado
Ligamentum venosum	Ligamento venoso
Kidney capsule	Cápsula renal
Second metacarpal bone	Osso metacarpal II
Sinus of frontal bone	Seio frontal
Lateral dorsal nucleus of thalamus	Núcleo dorsal lateral do tálamo
```

## Saída
Arquivo `docs/atlas-traducao/lote-NN.pt.tsv`: exatamente uma linha por linha do lote, na mesma ordem, `nome em inglês<TAB>nome em português`. A coluna 1 é cópia exata da linha do lote (é a chave da integração).

## Histórico
- **v1 (02/10/2026):** primeira versão (PR 3.1, Onda 3).
- **v2 (02/10/2026):** regras 11 (ordinais/numerais romanos) e 12 (nome consagrado curto), depois do lote 02 ("Osso metacarpo segundo").
- **v3 (02/10/2026):** regra 13 (decisões da revisão cruzada, `revisao-lotes.md`). Os lotes já traduzidos receberam essas decisões por `correcoes.tsv`.
