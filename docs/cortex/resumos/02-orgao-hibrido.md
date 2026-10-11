# Resumo 02: Órgão Híbrido de Tradução e Educação Científica
Fonte: cortex\Plano de Ação Projeto Órgão Híbrido de Tradução e Educação Científica.md (239 linhas)

## Propósito
Órgão digital que une pesquisa, tradução, produção e disseminação de conhecimento científico em saúde, tendo o LAIFT como plataforma-mãe. Três serviços: tradução do conhecimento, educação continuada e consultoria em comunicação científica. Domínio inicial: Farmacologia e Toxicologia, em roadmap de 12 semanas.

## Arquitetura e componentes
- LangGraph: roteador, memória persistente e verificador ("sistema imunológico").
- CrewAI: crews de Pesquisa, Tradução, Produção e Publicação/Métricas.
- AutoGen: debate entre agente Crítico e agente de Consenso, acionado por confidence_score abaixo de limiar.
- Humano no loop: revisão e aprovação final.
- Integrações LAIFT: acervo da clínica, pool Groq, métricas, eventos da liga.

## Serviços externos, modelos e custos citados
- PubMed, SciELO, LILACS, ANVISA, CFM (Fase 0); Metabase (dashboard); APIs de TTS; LinkedIn e YouTube Shorts.
- Estudo de 2026 (96,1% de sucesso; -76,2% de tokens; 14,5x menos latência): não verificado.
- Medflix: R$ 99/mês e mais de 10 mil aulas; faturamento citado com texto quebrado. Não verificado.
- Afya: receita de R$ 284,5 mi em Educação Continuada (2025) e 300 mil usuários ativos/mês. Não verificado.
- THRESHOLD v2.0, WoundScribeAI, PUCPR Lifelong Learning: referências sem fonte. Não verificado.
- Nenhum custo de API em moeda é citado.

## Infraestrutura exigida
- Python e Docker (Fase 0); LangGraph, CrewAI, AutoGen; Groq e API LAIFT.
- Publicação em LAIFT, LinkedIn e YouTube Shorts; TTS para vídeo de 60 s.
- Servidor, GPU e banco de dados do Córtex: não especificados. Banco de métricas: "Metabase ou similar".

## Riscos e contradições
- Fase 3 prevê "publicação automática", mas 2.3 e a seção 8 exigem aprovação humana de 100%.
- Simulação de pacientes virtuais (4.2) pode conflitar com PL 5.433/2025 e PL 1254/2026, que o próprio texto cita como vedando simulação realista de atuação profissional.
- Enquadramento "não é SaMD" depende de RDC 751/2022 e Resolução CFM 2.454/2026. Não verificado; sem parecer jurídico citado.
- Patrocínio de indústria farmacêutica (6.1) conflita com a promessa de curadoria independente; critérios do "selo" não definidos.
- Público-alvo inconsistente: pacientes, profissionais, gestores, imprensa, alunos de graduação e CME.
- Limiar de confidence_score não definido; a verificação é feita pela mesma família de LLM que gera o conteúdo.
- Redução de 76,2% de tokens vem de comparação com CrewAI puro, não é custo do Córtex.

## Decisões abertas
- Quais são os 3 casos prioritários (a, b, c da seção 8)?
- A publicação será automática ou sempre aprovada por humano?
- Aceitar patrocínio farmacêutico? Com quais regras?
- Manter a simulação de pacientes virtuais? Precisa de parecer jurídico.
- Qual serviço vem primeiro: tradução, educação continuada ou consultoria?
- Quem é o responsável clínico e curador?
