/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents/eligibility.js
 * ÚNICO ponto que decide se a pessoa pode usar agentes: só maiores de 18 anos (decisão do dono, 2026-10-12;
 * vale também para a memória e a simulação). Função PURA.
 *
 * PREMISSA (documentada, a validar com o dono): a plataforma NÃO guarda data de nascimento nem faixa etária
 * (nenhuma coluna em sql/ nem campo na sessão) e não admite menores hoje: a flag `minors_enabled` não existe no
 * código, o cadastro nativo exige maioridade e "nenhum dado de menor entra no sistema antes do parecer jurídico"
 * (docs/riscos-residuais.md J7, docs/TIME_CONTRATO.md, docs/liga/EDITAL_2026_v2.md). Logo, conta existente = maior de
 * 18 anos. A função fecha a porta, sem mudar o chamador, para qualquer marcador de menor que venha a existir:
 *   - isMinor / is_minor verdadeiro, accountType 'minor', ageBand diferente de 'adult';
 *   - responsável vinculado (guardianProfileId);
 *   - birthDate inválida ou que dá menos de 18 anos em `now`; age menor que 18 ou inválida.
 * E, com `minorsEnabled` (flag minors_enabled ligada, ou seja, contas de menor passaram a existir), exige a
 * confirmação explícita `adultConfirmed === true`: sem ela a pessoa NÃO é tratada como adulta.
 */
export const ADULT_AGE = 18;

function ageOn(birthDate, now) {
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < born.getUTCMonth()
    || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const hasValue = (v) => v !== undefined && v !== null && v !== '';

function declaresMinor(p) {
  return p.isMinor === true || p.is_minor === true
    || p.accountType === 'minor' || p.account_type === 'minor'
    || (hasValue(p.ageBand) && p.ageBand !== 'adult') || (hasValue(p.age_band) && p.age_band !== 'adult')
    || hasValue(p.guardianProfileId) || hasValue(p.guardian_profile_id);
}

function underAge(p, now) {
  const birth = hasValue(p.birthDate) ? p.birthDate : p.birth_date;
  if (hasValue(birth)) {
    const age = ageOn(birth, now);
    if (age === null || age < ADULT_AGE) return true;
  }
  if (hasValue(p.age) && !(Number.isFinite(Number(p.age)) && Number(p.age) >= ADULT_AGE)) return true;
  return false;
}

/**
 * Lê a flag `minors_enabled` FALHANDO FECHADO: se a leitura der erro (banco instável), trata como "menores
 * habilitados", o que exige `adultConfirmed` e bloqueia. Nunca devolve false por engano.
 * @param {() => Promise<boolean>} read  ex.: () => isEnabled(sql, 'minors_enabled', identity)
 */
export async function readMinorsEnabled(read) {
  try {
    return (await read()) === true;
  } catch (err) {
    return true;
  }
}

/**
 * @param {object} profile  sessão/perfil da pessoa (hoje: { profileId, role, ... } sem dado de idade)
 * @param {{ now?: Date, minorsEnabled?: boolean }} [opts]
 * @returns {boolean}
 */
export function isEligibleAdult(profile, opts = {}) {
  if (!profile || typeof profile !== 'object') return false;
  if (declaresMinor(profile) || underAge(profile, opts.now || new Date())) return false;
  return opts.minorsEnabled === true ? profile.adultConfirmed === true : true;
}
