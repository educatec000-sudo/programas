export function normalizeStageLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export const DEFAULT_ENROLLMENT_STAGES = [
  {
    code: 'BER2',
    label: 'Berçário II',
    segment: 'EDUCACAO_INFANTIL',
    orderIndex: 10,
    nextStageCode: 'MAT1',
    isEntryStage: true,
    defaultCapacity: 16,
    aliases: ['BERCARIO II'],
  },
  {
    code: 'MAT1',
    label: 'Maternal I',
    segment: 'EDUCACAO_INFANTIL',
    orderIndex: 20,
    nextStageCode: 'MAT2',
    isEntryStage: true,
    defaultCapacity: 18,
    aliases: ['MATERNAL I'],
  },
  {
    code: 'MAT1_INT',
    label: 'Maternal I Integral',
    segment: 'EDUCACAO_INFANTIL',
    orderIndex: 21,
    nextStageCode: 'MAT2_INT',
    isEntryStage: true,
    defaultCapacity: 18,
    aliases: ['MATERNAL I INT', 'MATERNAL I INTEGRAL'],
  },
  {
    code: 'MAT2',
    label: 'Maternal II',
    segment: 'EDUCACAO_INFANTIL',
    orderIndex: 30,
    nextStageCode: 'PER1',
    isEntryStage: true,
    defaultCapacity: 18,
    aliases: ['MATERNAL II'],
  },
  {
    code: 'MAT2_INT',
    label: 'Maternal II Integral',
    segment: 'EDUCACAO_INFANTIL',
    orderIndex: 31,
    nextStageCode: 'PER1',
    isEntryStage: true,
    defaultCapacity: 18,
    aliases: ['MATERNAL II INT', 'MATERNAL II INTEGRAL'],
  },
  {
    code: 'PER1',
    label: 'Período I',
    segment: 'EDUCACAO_INFANTIL',
    orderIndex: 40,
    nextStageCode: 'PER2',
    isEntryStage: true,
    defaultCapacity: 20,
    aliases: ['PERIODO I'],
  },
  {
    code: 'PER2',
    label: 'Período II',
    segment: 'EDUCACAO_INFANTIL',
    orderIndex: 50,
    nextStageCode: 'EF1',
    isEntryStage: true,
    defaultCapacity: 20,
    aliases: ['PERIODO II'],
  },
  {
    code: 'EF1',
    label: '1º Ano',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 60,
    nextStageCode: 'EF2',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['1 ANO 9 ANOS', '1º ANO 9 ANOS', '1 ANO'],
  },
  {
    code: 'EF1_INT',
    label: '1º Ano Integral',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 61,
    nextStageCode: 'EF2_INT',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['1 ANO INTEG', '1 ANO INTEGRAL', '1° ANO INTEG'],
  },
  {
    code: 'EF2',
    label: '2º Ano',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 70,
    nextStageCode: 'EF3',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['2 ANO 9 ANOS', '2º ANO 9 ANOS', '2 ANO'],
  },
  {
    code: 'EF2_INT',
    label: '2º Ano Integral',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 71,
    nextStageCode: 'EF3_INT',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['2 ANO INTEG', '2 ANO INTEGRAL', '2° ANO INTEG'],
  },
  {
    code: 'EF3',
    label: '3º Ano',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 80,
    nextStageCode: 'EF4',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['3 ANO 9 ANOS', '3º ANO 9 ANOS', '3 ANO'],
  },
  {
    code: 'EF3_INT',
    label: '3º Ano Integral',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 81,
    nextStageCode: 'EF4_INT',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['3 ANO INTEG', '3 ANO INTEGRAL', '3° ANO INTEG'],
  },
  {
    code: 'EF4',
    label: '4º Ano',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 90,
    nextStageCode: 'EF5',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['4 ANO 9 ANOS', '4º ANO 9 ANOS', '4 ANO'],
  },
  {
    code: 'EF4_INT',
    label: '4º Ano Integral',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 91,
    nextStageCode: 'EF5_INT',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['4 ANO INTEG', '4 ANO INTEGRAL', '4° ANO INTEG'],
  },
  {
    code: 'EF5',
    label: '5º Ano',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 100,
    nextStageCode: 'EF6',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['5 ANO 9 ANOS', '5º ANO 9 ANOS', '5 ANO'],
  },
  {
    code: 'EF5_INT',
    label: '5º Ano Integral',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 101,
    nextStageCode: 'EF6',
    isEntryStage: true,
    defaultCapacity: 25,
    aliases: ['5 ANO INTG', '5 ANO INTEG', '5 ANO INTEGRAL', '5° ANO INTG'],
  },
  {
    code: 'EF6',
    label: '6º Ano',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 110,
    nextStageCode: 'EF7',
    isEntryStage: true,
    defaultCapacity: 30,
    aliases: ['6 ANO 9 ANOS', '6º ANO 9 ANOS', '6 ANO'],
  },
  {
    code: 'EF7',
    label: '7º Ano',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 120,
    nextStageCode: 'EF8',
    isEntryStage: true,
    defaultCapacity: 30,
    aliases: ['7 ANO 9 ANOS', '7º ANO 9 ANOS', '7 ANO'],
  },
  {
    code: 'EF8',
    label: '8º Ano',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 130,
    nextStageCode: 'EF9',
    isEntryStage: true,
    defaultCapacity: 30,
    aliases: ['8 ANO 9 ANOS', '8º ANO 9 ANOS', '8 ANO'],
  },
  {
    code: 'EF9',
    label: '9º Ano',
    segment: 'ENSINO_FUNDAMENTAL',
    orderIndex: 140,
    nextStageCode: null,
    isEntryStage: true,
    defaultCapacity: 30,
    aliases: ['9 ANO 9 ANOS', '9º ANO 9 ANOS', '9 ANO'],
  },
];

const STAGE_ALIAS_MAP = (() => {
  const map = new Map();
  for (const stage of DEFAULT_ENROLLMENT_STAGES) {
    const aliases = [stage.label, ...(stage.aliases || [])];
    for (const alias of aliases) {
      map.set(normalizeStageLabel(alias), stage);
    }
  }
  return map;
})();

const STAGE_BY_CODE = new Map(DEFAULT_ENROLLMENT_STAGES.map((stage) => [stage.code, stage]));

export function getStageByCode(code) {
  return STAGE_BY_CODE.get(String(code || '').trim().toUpperCase()) || null;
}

export function resolveStageFromRaw(raw) {
  const normalized = normalizeStageLabel(raw);
  if (!normalized) return null;
  if (STAGE_ALIAS_MAP.has(normalized)) return STAGE_ALIAS_MAP.get(normalized);

  if (normalized.includes('INTEG') && normalized.includes('MATERNAL I')) return getStageByCode('MAT1_INT');
  if (normalized.includes('INTEG') && normalized.includes('MATERNAL II')) return getStageByCode('MAT2_INT');
  if (normalized.includes('PERIODO I')) return getStageByCode('PER1');
  if (normalized.includes('PERIODO II')) return getStageByCode('PER2');
  if (normalized.includes('BERCARIO II')) return getStageByCode('BER2');

  const yearMatch = normalized.match(/(^|\s)([1-9])\s*ANO/);
  if (yearMatch) {
    const year = Number(yearMatch[2]);
    const suffix = normalized.includes('INTEG') ? '_INT' : '';
    return getStageByCode(`EF${year}${suffix}`) || getStageByCode(`EF${year}`);
  }

  return null;
}

export function createDefaultRuleItems() {
  return DEFAULT_ENROLLMENT_STAGES.map((stage) => ({
    stageCode: stage.code,
    nextStageCode: stage.nextStageCode,
    promotionRate: stage.nextStageCode ? 90 : 0,
    repetitionRate: stage.nextStageCode ? 10 : 0,
    dropoutRate: 0,
    entryRate: 100,
    capacityLimit: stage.defaultCapacity,
    roundingMode: 'ARREDONDAR',
    active: true,
  }));
}
