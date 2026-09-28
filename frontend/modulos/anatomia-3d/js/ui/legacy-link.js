/**
 * legacy-link.js — Link real structures to legacy content by name matching
 * Pure function: linkLegacy(structures, legacyIndex) → Map realSid → legacySid
 */

/**
 * Normalize a string for comparison: lowercase, remove accents, strip prefixes,
 * side suffixes, underscores, dashes. Used to match structure names with legacy names.
 * @param {string} s
 * @returns {string}
 */
function normalizeForLinking(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove combining marks/accents
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    // Remove prefixes like "vh m ", "vh f "
    .replace(/^vh\s+[mf]\s+/g, '')
    // Remove side suffixes: " left", " right", ".l", ".r", "(l)", "(r)", " (l)", " (r)"
    .replace(/\s+(left|right)\s*$/g, '')
    .replace(/\s*\.([lr])\s*$/g, '')
    .replace(/\s*\(([lr])\)\s*$/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Check if a word/phrase appears as a complete word in a string
 * Handles singular/plural variants (e.g., "kidney" matches "kidneys")
 * @param {string} word
 * @param {string} text
 * @returns {boolean}
 */
function containsAsWholeWord(word, text) {
  if (!word || !text) return false;
  const words = text.split(/\s+/);
  // Check if word matches any complete word or is a prefix of a word
  for (const w of words) {
    if (w === word || w.startsWith(word)) return true;
    // Also check singular/plural variants: kidney <-> kidneys
    if (w === word + 's' || word === w + 's') return true;
    // Try stripping trailing 's' for comparison
    const wSingular = w.endsWith('s') ? w.slice(0, -1) : w;
    const wordSingular = word.endsWith('s') ? word.slice(0, -1) : word;
    if (wSingular === wordSingular) return true;
  }
  return false;
}

/**
 * Link real structures to legacy content by matching normalized names.
 * Returns a Map from realSid → legacySid, using the shortest matching structure
 * as the primary organ representation.
 * @param {Array<Object>} structures - Real structures with sid, englishName, latinName
 * @param {Array<Object>} legacyIndex - Legacy entries with sid, names {pt, en, la}
 * @returns {Map<string, string>} Map from realSid → legacySid
 */
export function linkLegacy(structures, legacyIndex) {
  const linkMap = new Map();

  // Build a map: normalized legacy name → legacySid, for faster lookups
  const legacyByNormalizedName = new Map();
  for (const entry of legacyIndex) {
    const en = normalizeForLinking(entry.names?.en || '');
    const la = normalizeForLinking(entry.names?.la || '');
    if (en) legacyByNormalizedName.set(en, entry.sid);
    if (la) legacyByNormalizedName.set(la, entry.sid);
  }

  // Group structures by their matching legacy entry (to pick the primary)
  const groupedByLegacy = new Map(); // legacySid → [{ sid, normalizedName, name }]

  for (const struct of structures) {
    const en = normalizeForLinking(struct.englishName || '');
    const la = normalizeForLinking(struct.latinName || '');

    let matchedLegacySid = null;

    // Try exact match first against English name
    if (en && legacyByNormalizedName.has(en)) {
      matchedLegacySid = legacyByNormalizedName.get(en);
    }
    // Try exact match against Latin name
    else if (la && legacyByNormalizedName.has(la)) {
      matchedLegacySid = legacyByNormalizedName.get(la);
    }
    // Try partial/contains match
    else {
      for (const entry of legacyIndex) {
        const legacyEn = normalizeForLinking(entry.names?.en || '');
        const legacyLa = normalizeForLinking(entry.names?.la || '');

        // Check if legacy name is a whole-word prefix/contained in structure name
        if ((en && legacyEn && containsAsWholeWord(legacyEn, en)) ||
            (la && legacyLa && containsAsWholeWord(legacyLa, la))) {
          matchedLegacySid = entry.sid;
          break;
        }
      }
    }

    // If we found a match, record it grouped by legacy sid
    if (matchedLegacySid) {
      if (!groupedByLegacy.has(matchedLegacySid)) {
        groupedByLegacy.set(matchedLegacySid, []);
      }
      groupedByLegacy.get(matchedLegacySid).push({
        sid: struct.sid,
        normalizedName: en || la,
        originalName: struct.englishName || struct.latinName,
      });
    }
  }

  // For each legacy entry, pick the structure with the shortest normalized name as primary
  for (const [legacySid, matches] of groupedByLegacy) {
    if (matches.length === 0) continue;
    // Sort by normalized name length, then alphabetically
    matches.sort((a, b) =>
      a.normalizedName.length - b.normalizedName.length ||
      a.normalizedName.localeCompare(b.normalizedName)
    );
    const primaryMatch = matches[0];
    linkMap.set(primaryMatch.sid, legacySid);
  }

  return linkMap;
}
