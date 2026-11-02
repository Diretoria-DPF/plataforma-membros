-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 050_ui_v2_telas_flags.sql — uma flag por tela da nova interface (mesmo visual do Início v3).
--
-- Todas são públicas (vão ao navegador) e nascem DESLIGADAS; cada tela só muda quando a flag dela é ligada.
-- Só INSERT ... ON CONFLICT DO NOTHING: reaplicar nunca religa nem desliga uma flag que o admin já mexeu.
-- Não cria tabela. Requer a 016 (feature_flags). Idempotente. Reversão: sql/down/050_ui_v2_telas_flags.sql.

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('learn_v2_enabled', FALSE, 'Aprender v2: hub de módulos no visual novo (continuar, meta, quiz do dia, módulos e conquistas)'),
  ('events_v2_enabled', FALSE, 'Eventos v2: lista de eventos, inscrição e histórico no visual novo'),
  ('profile_v2_enabled', FALSE, 'Perfil v2: dados, crachá, preferências, segurança e privacidade no visual novo'),
  ('proposals_v2_enabled', FALSE, 'Propostas v2: votações e envio de propostas no visual novo'),
  ('tasks_v2_enabled', FALSE, 'Tarefas v2: tarefas disponíveis e minhas no visual novo'),
  ('messages_v2_enabled', FALSE, 'Mensagens v2: conversas no visual novo'),
  ('team_v2_enabled', FALSE, 'Equipe v2: organograma, conexões e pedidos no visual novo'),
  ('library_v2_enabled', FALSE, 'Biblioteca v2: catálogo, favoritos e coleções no visual novo'),
  ('mentoring_v2_enabled', FALSE, 'Mentoria v2: pedidos e progresso compartilhado no visual novo'),
  ('selection_v2_enabled', FALSE, 'Processo seletivo v2: jornada do candidato no visual novo'),
  ('admin_v2_enabled', FALSE, 'Administração v2: seções da gestão no visual novo')
ON CONFLICT (key) DO NOTHING;
