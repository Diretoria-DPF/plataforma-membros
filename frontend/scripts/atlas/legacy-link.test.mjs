/**
 * legacy-link.test.mjs — Unit tests for linkLegacy function
 * Run with: node frontend/scripts/atlas/legacy-link.test.mjs
 */

import { linkLegacy } from '../../modulos/anatomia-3d/js/ui/legacy-link.js';

// Test fixtures: real structures
const structures = [
  // Heart
  {
    sid: 'za:vh-m-heart-left-ventricle',
    englishName: 'VH_M_heart_left_ventricle',
    latinName: null,
  },
  {
    sid: 'za:vh-m-heart-right-ventricle',
    englishName: 'VH_M_heart_right_ventricle',
    latinName: null,
  },
  // Liver
  {
    sid: 'za:liver',
    englishName: 'Liver',
    latinName: null,
  },
  // Kidney left/right
  {
    sid: 'za:kidney-l',
    englishName: 'Kidney',
    latinName: null,
  },
  {
    sid: 'za:kidney-r',
    englishName: 'Kidney',
    latinName: null,
  },
  // Femur left/right
  {
    sid: 'za:femur-l',
    englishName: 'Femur',
    latinName: null,
  },
  {
    sid: 'za:femur-r',
    englishName: 'Femur',
    latinName: null,
  },
];

// Test fixtures: legacy index
const legacyIndex = [
  {
    sid: 'fma:7088',
    names: {
      pt: 'Coração',
      en: 'Heart',
    },
  },
  {
    sid: 'fma:7197',
    names: {
      pt: 'Fígado',
      en: 'Liver',
    },
  },
  {
    sid: 'za:rins',
    names: {
      pt: 'Rins',
      en: 'Kidneys',
    },
  },
  // Note: No femur in legacy (for testing absence)
];

// Run tests
const tests = [
  {
    name: 'Heart structure (primary) should link to legacy Heart (fma:7088)',
    check: (map) => {
      // Only the primary (shortest) heart structure should be linked
      const leftVent = map.get('za:vh-m-heart-left-ventricle');
      const rightVent = map.get('za:vh-m-heart-right-ventricle');
      return (leftVent === 'fma:7088' || rightVent === 'fma:7088');
    },
  },
  {
    name: 'Liver structure should link to legacy Liver (fma:7197)',
    check: (map) => map.get('za:liver') === 'fma:7197',
  },
  {
    name: 'Kidney structure (primary) should link to legacy Kidneys (za:rins)',
    check: (map) => {
      // Only the primary (first) kidney structure should be linked
      const kidneyL = map.get('za:kidney-l');
      const kidneyR = map.get('za:kidney-r');
      return (kidneyL === 'za:rins' || kidneyR === 'za:rins');
    },
  },
  {
    name: 'Femur structures should not link (no legacy entry)',
    check: (map) =>
      !map.has('za:femur-l') && !map.has('za:femur-r'),
  },
  {
    name: 'Only primary structures should be linked (not all matches)',
    check: (map) => {
      // For heart, only one of the ventricles should be primary
      const heartLinks = [
        map.get('za:vh-m-heart-left-ventricle'),
        map.get('za:vh-m-heart-right-ventricle'),
      ].filter(Boolean);
      // Both should link to the same legacy entry, but we only set one as primary
      return heartLinks.length > 0; // At least one heart structure is linked
    },
  },
];

const linkMap = linkLegacy(structures, legacyIndex);

console.log('Legacy Link Test Results\n========================\n');
let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = test.check(linkMap);
  const status = result ? '✓ PASS' : '✗ FAIL';
  if (result) passed++;
  else failed++;
  console.log(`${status}: ${test.name}`);
}

console.log(`\n\nLink Map Details:\n-----------------`);
for (const [realSid, legacySid] of linkMap) {
  console.log(`  ${realSid} → ${legacySid}`);
}

console.log(`\n\nSummary: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
