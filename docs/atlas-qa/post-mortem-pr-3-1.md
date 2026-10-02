# Post-mortem — PR 3.1 "Nomes + Lista + UX base" (Onda 3)

- **PR:** #12, mesclado em 02/10/2026 (`main` @ `96e7cbe`).
- **Gate 0.1 do PR 3.2.** Parte técnica preenchida pelo Claude; campos com ___ são da reunião.

## 1. O que foi entregue
| Item | Resultado |
|---|---|
| Nomes PT | 1.382 nomes de exibição únicos (a v1.0 estimava ~1.000), 20 lotes, prompt versionado (v3) |
| Revisão cruzada | 4 lotes sorteados: 42 erros em 276 (15,2%); padrões viraram regras aplicadas aos 20 lotes (94 correções em `correcoes.tsv`) |
| Pendências de tradução | 11 nomes com dúvida real em `names-pt.json → revisar` |
| Lista das 300 | `prioridades.json` com as cotas exatas da v1.0 |
| UX | Voltar / Anterior / Próxima na ficha; "Ouvir" (speechSynthesis pt-BR, flag `tts`) |
| Boot | `.glb.gz` + `DecompressionStream`: 1,81 → 1,28 MB; Fast 3G 9,2–9,4 s em HTTP/2 |

## 2. Métricas
| Métrica | Meta | Medido | Como |
|---|---|---|---|
| Boot Fast 3G (produção, HTTP/2) | < 10 s | 9,2–9,4 s (local HTTP/2); produção: ___ | h2 local / `atlas-prod-check` |
| Boot Fast 3G (teste local, HTTP/1.1) | < 15 s | 11,8 s | `atlas-perf` |
| Transferido na abertura | < 2 MB | 1,28 MB | `atlas-perf` |
| Nomes com `namePt` | 100% | 100% (2.427 sids) | `names-pt.test.mjs` |
| Erro de tradução na amostra | — | 15,2% antes das regras | `revisao-lotes.md` |
| "Ouvir" em Chrome/Android | funciona | ___ | aparelho real |

## 3. O que funcionou / o que não funcionou
- **Funcionou:** lotes pequenos por sistema (vocabulário consistente); revisão cruzada barata que gerou regras para todos os lotes; arquivo de correções auditável (os `.pt.tsv` ficam como o tradutor entregou); medir a cascata de requisições antes de otimizar (o gargalo era HTTP/1.1, não bytes).
- **Não funcionou:** a v1 do prompt sem regra de ordinais ("Osso metacarpo segundo"); o modelo pequeno inseriu caracteres invisíveis e iniciais minúsculas (agora limpos na integração); testes com espera fixa (`setTimeout`) quebraram quando a ficha ficou um pouco mais lenta.

## 4. Lições para o PR 3.2
1. **Toda regra descoberta numa amostra vale para o lote inteiro** — aplicar por script, com motivo registrado.
2. **Fonte obrigatória e verificável** (o PR 3.2 adiciona `fontes.json` e o validador anti-referência inventada).
3. **Nada de espera fixa em e2e** — sempre esperar a condição.
4. **Local ≠ produção na rede:** a meta de boot é conferida em produção (`atlas-prod-check`).

## 5. Itens humanos e decisão
| Verificação | Resultado |
|---|---|
| `atlas-prod-check` em produção (< 10 s, C8/C10) | ___ |
| "Ouvir" em Android real | ___ |
| Conselho: 11 nomes em `revisar` | ___ |
| Conselho: validação de `prioridades.json` | ___ |

- [x] PR 3.2 segue (usuário pediu o próximo PR em 02/10/2026) · [ ] volta para corrigir (itens: ___)
