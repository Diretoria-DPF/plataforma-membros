# Revisão técnica prévia — 15 processos e 19 vias (PR 3.2, Bloco D)

- **Arquivos:** `processes.json` e `routes.json` desta pasta.
- **Revisor:** agente de revisão de fisiologia e farmacologia, em 02/10/2026. É uma revisão prévia, não aprovação; a aprovação é do conselho.
- **Veredito do agente:**
  - processes: precisa de correções (1 erro factual de CID e lacunas de fonte);
  - routes: precisa de correções (critério de `firstPass`, afirmações de diretriz sem fonte, tom, anglicismos).
- **Fica com o conselho:** confirmar no CID-10 Volume 1 os códigos D68.5, G70.8 e D68.4/D68.3, que o revisor checou de memória.

## Itens incertos aceitos pelo revisor
- Peristalse de 2–4 cm/s.
- Espermatogênese de 64–74 dias.
- LH → ovulação em 24–36 h (a partir do início do pico).
- Limiar renal de 180–200 mg/dL.
- PaO₂ ≈ 95 mmHg.
- Vincristina intratecal fatal (Goodman).

## Decisões editoriais para a aplicação
1. **`firstPass`:** `true` só quando a primeira passagem pré-sistêmica (hepática e/ou intestinal) é a principal ou parcial relevante. Fica `true` em oral, intragástrica e retal (parcial, dito no texto) e `false` em pulmonar-inalatória e intra-arterial. A "primeira passagem regional" da intra-arterial fica só no texto.
2. **`phaseTiming`:** é a duração didática da animação, decisão editorial e não dado de livro. As `sources` com `field: "phaseTiming"` saem, e o schema passa a dizer que o campo é editorial.
3. **CID-10 e diretrizes de ressuscitação (AHA/ERC):** não são obras de `fontes.json`. Vão como `sources` com `exception: true` e `justificativa`, por exemplo "CID-10, Volume 1 (OMS/DATASUS), referência normativa de classificação" ou "Diretrizes de ressuscitação (AHA/ERC), não cobertas pelas obras listadas". O `obraId` é o da obra mais próxima (robbins; goodman).

## Correções — processes.json
| id | Campo | Correção | Grav. |
|---|---|---|---|
| resposta-inflamatoria | desviosClinicos[1].cid | D72.0 → **D71** (deficiência de adesão leucocitária) | alta |
| filtracao-glomerular | desviosClinicos[3].cid | R81 → remover o `cid` ou usar E14 | média |
| hematose-alveolar | desviosClinicos[0] | condição "Enfisema pulmonar (doença pulmonar obstrutiva crônica)", cid J43 | média |
| coagulacao-sanguinea | desviosClinicos[2] | "Deficiência adquirida de fatores dependentes de vitamina K", D68.4 (com varfarina no título seria D68.3) | média |
| resposta-inflamatoria | desviosClinicos[0] | condição "Sepse" (A41) ou cid "A41; R57.2" | baixa |
| espermatogenese | desviosClinicos[2].cid | Q98 → Q98.0 | baixa |
| contracao-muscular | desviosClinicos[1].mecanismo | "febre alta" → "hipermetabolismo e hipertermia intensa" | média |
| contracao-muscular | steps[0] / steps[3] | "suprarlimiar" → "supralimiar"; "(power stroke)" → "golpe de força" | baixa |
| coagulacao-sanguinea | steps[3].clinica_pt | a varfarina inibe a epóxido-redutase da vitamina K e, assim, a carboxilação dos fatores dependentes; na hemofilia A (VIII) e B (IX), a tenase fica comprometida | baixa |
| espermatogenese | description_pt | "cerca de 64 a 74 dias, conforme a fonte e o método de medida" | baixa |
| ciclo-menstrual | steps[5] | "…24 a 36 horas após o início do pico de LH (algumas fontes citam intervalos um pouco maiores)" | baixa |
| degluticao-humana | steps[5] | remover "(relaxamento receptivo)" do EEI | média |
| degluticao-humana | steps[4] / clinica_pt | incluir "o terço médio é misto"; "elimina" → "compromete" | baixa |
| resposta-imune-adaptativa | steps[4] | a troca de classe começa logo após a ativação pelo Tfh e continua no centro germinativo; ocorre no linfócito B (AID), não no plasmócito | média |
| resposta-inflamatoria | steps[2] | histamina e trombina → P-selectina; TNF e IL-1 → E-selectina | baixa |
| peristaltismo-intestinal | steps[4].clinica_pt | Hirschsprung: plexos mioentérico **e** submucoso | baixa |
| espermatogenese | desviosClinicos[1] | "plexo pampiniforme (veias do cordão espermático)" | baixa |
| peristaltismo-intestinal | name_pt | padronizar "peristalse" × "peristaltismo" nos dois processos | baixa |
| conducao-impulso-cardiaco | steps[0].clinica_pt | "…o tratamento definitivo é o marca-passo artificial" | baixa |
| 9 processos | sources | `field: "desviosClinicos"` (robbins; machado no reflexo; katzung/rang na sinapse) | média |
| 9 processos | sources | `field: "feedback"` (guyton/berne/silverthorn; abbas/robbins nos imunológicos) | média |
| todos | sources | `field: "description_pt"` com as obras dos passos; CID por `exception` (decisão 3) | média |
| espermatogenese | steps[2].refs | robbins → guyton | baixa |

## Correções — routes.json
| id | Campo | Correção | Grav. |
|---|---|---|---|
| intraarterial, pulmonar-inalatoria, retal | firstPass | decisão 1 | média |
| intracardiaca | description_pt, clinicalNotes | texto do revisor (historicamente usada na PCR; as diretrizes atuais não a recomendam e preconizam IV/IO; fica restrita a contextos procedimentais especializados, sob imagem); complicações como "são descritas"; fonte por `exception` (diretriz) | média |
| intraossea | clinicalNotes | tirar "com as mesmas doses"; alternativa funcional à IV segundo as diretrizes; complicações (extravasamento, síndrome compartimental, osteomielite rara, lesão da lâmina epifisial rara); contraindicações; fonte por `exception` | média |
| intratecal | clinicalNotes | vincristina: mieloencefalopatia ascendente, uso exclusivamente intravenoso, rótulo de alerta e preparo em minibolsa; tom descritivo | média |
| todas | sources (phaseTiming) | decisão 2 | média |
| intragastrica | description_pt | SNG/PEG → SNG/GEP | baixa |
| intramuscular | texto | "depot(s)" → "depósito(s) de liberação prolongada" | baixa |
| intraossea | texto | "flush" → "lavagem do acesso" | baixa |
| nasal | name_pt | "Spray" → "Via Nasal (Inalação / Pulverização)" | baixa |
| epidural | clinicalNotes | "plexo venoso vertebral interno (epidural)" | baixa |
| intradermica | description_pt | "absorção mais lenta que a intramuscular; o objetivo costuma ser a ação local ou a apresentação de antígeno" | baixa |
| oral | clinicalNotes | "cerca de 0,5 a 3 horas" | baixa |
| intragastrica, sublingual, otologica, ocular, intramuscular, pulmonar-inalatoria | texto | instruções → frases descritivas (exemplos na revisão) | baixa |
| otologica | sources / clinicalNotes | ref do Goodman por tema honesto; "as fluoroquinolonas são as opções descritas" | baixa |
| intraarterial | anchors[1..2].label_pt | rótulos que não casam com o sid: alinhar o rótulo ao sid, sem trocar o sid | baixa |

## Aplicação
- Aplicadas todas as linhas das duas tabelas e as 3 decisões em `processes.json` e `routes.json`, com `review.status: "editorial"` mantido; no schema só a `description` de `phaseTiming` mudou. Na filtração glomerular o `cid` R81 foi removido (opção da revisão).
- Validação: ajv 2020 item a item contra `$defs.process` e `$defs.route`, sem erros; script de fontes (`obraId`, ausência de URL, DOI e PMID, todo campo com `sources[].field`; `phaseTiming` sem fonte) sem falhas; `lint-pt.mjs` nos dois arquivos com 0 achados.
- Linhas não aplicadas: nenhuma. Pendente: o conselho confirma D68.5, G70.8 e D68.4/D68.3 no CID-10 Volume 1.
