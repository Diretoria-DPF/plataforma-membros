-- 008_league_org_chart.sql
-- Estrutura organizacional da liga (fluxograma de membros): cargo de
-- liderança (independente do papel de permissão da plataforma) e
-- diretoria a que o perfil pertence. Não confundir com `profiles.role`
-- (visitor/member/admin), que continua controlando só permissão de
-- acesso — cargo é puramente organizacional/visual.
--
-- Hierarquia (definida com o dono do produto):
--   Coordenação Geral (orientação, nível mais alto)
--   Presidente, Vice-Presidente (executivo)
--   Coordenador (até 2 pessoas, operacional)
--   Diretor (1 por diretoria: marketing / científico / administrativo / financeiro)
--   Membros de diretoria (sem cargo de liderança, só vinculados a uma diretoria)
--   Membros sem diretoria ("ligantes")
--   Visitantes (fora do fluxograma até serem promovidos a membro)

DO $$ BEGIN
  CREATE TYPE league_position AS ENUM (
    'coordenacao_geral', 'presidente', 'vice_presidente', 'coordenador', 'diretor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE directorate AS ENUM ('marketing', 'cientifico', 'administrativo', 'financeiro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS league_position league_position;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS directorate directorate;

-- Só "diretor" exige uma diretoria vinculada; os demais cargos de
-- liderança (coordenação geral, presidente, vice, coordenador) não são
-- de uma diretoria específica, então devem ficar sem diretoria. Um
-- perfil sem cargo de liderança (league_position NULL) pode ter
-- directorate preenchido (membro comum daquela diretoria) ou não
-- (membro sem diretoria).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_league_position_directorate_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_league_position_directorate_check CHECK (
  (league_position = 'diretor'::league_position AND directorate IS NOT NULL)
  OR (league_position IN ('coordenacao_geral','presidente','vice_presidente','coordenador') AND directorate IS NULL)
  OR (league_position IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_profiles_league_position ON profiles (league_position) WHERE league_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_directorate ON profiles (directorate) WHERE directorate IS NOT NULL;
