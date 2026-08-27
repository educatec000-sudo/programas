import { prisma } from '../../lib/prisma.js';
import { pickField, toNumber, normalizeKey } from './parser.js';
import { str } from './base.js';
import { IMPORT_ROW_STATUS } from '../../lib/constants.js';
import { SCHOOL_FIELDS } from './schoolFields.js';
import { normalizeCoordinate } from './coordinates.js';

/**
 * Estratégia de importação de ESCOLAS — robusta a planilhas diversas:
 *  - ordem de colunas livre, colunas extras, nomes diferentes (aliases);
 *  - fluxo com Mapeamento de Colunas (usuário ajusta planilha → campo);
 *  - deduplicação: INEP (principal) → nome normalizado (fallback);
 *  - coordenadas com decimais implícitas normalizadas (ver coordinates.js);
 *  - gravação sem transação interativa gigante (cada query possui sua
 *    transação curta implícita, evitando timeout em arquivos grandes);
 *  - linha com erro é registrada sem interromper as demais.
 */

const DEPENDENCY_MAP = {
  '1': 'FEDERAL', federal: 'FEDERAL',
  '2': 'ESTADUAL', estadual: 'ESTADUAL',
  '3': 'MUNICIPAL', municipal: 'MUNICIPAL',
  '4': 'PRIVADA', privada: 'PRIVADA',
};
const SITUATION_MAP = {
  '1': 'ATIVA', ativa: 'ATIVA', atividade: 'ATIVA', 'em atividade': 'ATIVA', funcionando: 'ATIVA', aberta: 'ATIVA', ativo: 'ATIVA',
  '2': 'PARALISADA', paralisada: 'PARALISADA',
  '3': 'INATIVA', inativa: 'INATIVA', encerrada: 'INATIVA', extinta: 'INATIVA', fechada: 'INATIVA', inativo: 'INATIVA',
};
const ZONE_MAP = {
  '1': 'URBANA', urbana: 'URBANA', u: 'URBANA',
  '2': 'RURAL', rural: 'RURAL', r: 'RURAL',
  sede: 'SEDE', estradas: 'ESTRADAS', estrada: 'ESTRADAS', ilhas: 'ILHAS', ilha: 'ILHAS',
};

// aliases legados (usados quando não há mapeamento explícito — endpoint genérico)
const FIELD_ALIASES = Object.fromEntries(SCHOOL_FIELDS.map((f) => [f.key, f.aliases]));

/** normaliza nome para chave de deduplicação (sem acentos, minúsculo) */
function normName(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameKey(name) {
  return `nm:${normName(name)}`;
}

/** Lê o valor de um campo: primeiro pelo mapeamento explícito, depois por aliases. */
function getFieldValue(raw, fieldKey, mapping) {
  const header = mapping?.[fieldKey];
  if (header) {
    const v = raw[normalizeKey(header)];
    if (v !== undefined && v !== null && v !== '') return v;
    return undefined; // coluna mapeada existe mas célula vazia
  }
  return pickField(raw, FIELD_ALIASES[fieldKey] || [fieldKey]);
}

/**
 * Interpreta uma coordenada da planilha citando a coluna original no erro.
 * Aceita decimais normais e o formato da planilha oficial (decimais
 * implícitas: -165917 → -1.65917). Nunca inventa valor.
 */
function parseCoordinate(rawValue, fieldKey, mapping, kind, label) {
  const visible = str(rawValue);
  if (!visible) return { value: null, error: null }; // campo vazio = opcional

  const column = mapping?.[fieldKey] || label; // exato nome da coluna da planilha
  let num = toNumber(rawValue);

  // No CSV oficial, o Excel gravou coordenadas como grupos separados por
  // pontos: -165.917 significa -165917 (=> -1.65917) e -48.832.820 significa
  // -48832820 (=> -48.832820). Se a leitura decimal comum ficar fora da faixa
  // ou falhar por múltiplos pontos, recupere primeiro o inteiro original.
  const maxAbs = kind === 'latitude' ? 90 : 180;
  if ((num === null || Math.abs(num) > maxAbs) && !visible.includes(',')) {
    const compact = visible.replace(/\s/g, '').replace(/\./g, '');
    if (/^-?\d+$/.test(compact)) num = Number(compact);
  }

  if (num === null || !Number.isFinite(num)) {
    return { value: null, error: `Coluna "${column}": valor "${visible}" não é numérico` };
  }
  const normalized = normalizeCoordinate(num, kind);
  if (normalized === null) {
    return {
      value: null,
      error: `Coluna "${column}": não foi possível interpretar "${visible}" com segurança (fora da faixa ${kind === 'latitude' ? '-90 a 90' : '-180 a 180'} após normalização)`,
    };
  }
  return { value: normalized, error: null };
}

export const schoolsStrategy = {
  type: 'ESCOLAS',
  label: 'Escolas',
  // Modelo no formato da planilha oficial LOCALIZAÇÃO ESCOLAS.xlsx
  headers: ['INEP', 'ESCOLAS', 'ENDEREÇO', 'GESTOR(A)', 'ZONA', 'LATITUDE', 'LONGTUDE'],
  examples: [
    ['15012345', 'ESCOLA MUNICIPAL EXPERIMENTAL', 'AV. PRINCIPAL, 100', 'MARIA SOUZA', 'SEDE', -1.72195, -48.87461],
  ],

  async loadContext() {
    const schools = await prisma.school.findMany({
      select: { id: true, inep: true, name: true, deletedAt: true },
    });
    const byInep = new Map();
    const byNameKey = new Map();
    for (const s of schools) {
      if (s.inep) byInep.set(s.inep, s);
      byNameKey.set(nameKey(s.name), s);
    }
    return { byInep, byNameKey };
  },

  buildRow(row, ctx, mapping) {
    const errors = [];
    const get = (field) => getFieldValue(row.raw, field, mapping);

    // ---- Nome (obrigatório) ----
    const name = str(get('name'));
    if (!name || name.length < 3) errors.push({ field: 'nome', message: 'Nome da escola é obrigatório (mín. 3 caracteres)' });

    // ---- INEP (opcional; validado quando presente) ----
    const inepVisible = str(get('inep'));
    const inep = inepVisible.replace(/\D/g, '');
    if (inepVisible && !/^\d{6,10}$/.test(inep)) {
      errors.push({ field: 'inep', message: `Coluna "${mapping?.inep || 'INEP'}": valor "${inepVisible}" inválido (6 a 10 dígitos)` });
    }

    // ---- CEP ----
    const cepRaw = str(get('cep'));
    const cep = cepRaw.replace(/\D/g, '');
    if (cepRaw && cep.length !== 8) errors.push({ field: 'cep', message: `Coluna "${mapping?.cep || 'CEP'}": valor "${cepRaw}" inválido (8 dígitos)` });

    // ---- E-mail ----
    const email = str(get('email'));
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push({ field: 'email', message: `E-mail inválido: "${email}"` });
    }

    // ---- Zona / Dependência / Situação (tolerantes) ----
    const zone = ZONE_MAP[str(get('zone')).toLowerCase()] || null;
    const adminDependency = DEPENDENCY_MAP[str(get('adminDependency')).toLowerCase()] || null;
    const situation = SITUATION_MAP[str(get('situation')).toLowerCase()] || 'ATIVA';

    // ---- Coordenadas (decimais normais OU decimais implícitas da planilha) ----
    const lat = parseCoordinate(get('latitude'), 'latitude', mapping, 'latitude', 'LATITUDE');
    if (lat.error) errors.push({ field: 'latitude', message: lat.error });
    const lng = parseCoordinate(get('longitude'), 'longitude', mapping, 'longitude', 'LONGTUDE');
    if (lng.error) errors.push({ field: 'longitude', message: lng.error });

    const data = {
      name,
      inep: inepVisible ? inep : null,
      schoolType: str(get('schoolType')) || null,
      address: str(get('address')) || null,
      addressNumber: str(get('addressNumber')) || null,
      addressComplement: str(get('addressComplement')) || null,
      district: str(get('district')) || null,
      cep: cepRaw ? cep : null,
      zone,
      adminDependency,
      situation,
      phone: str(get('phone')) || null,
      responsible: str(get('responsible')) || null,
      email: email || null,
      notes: str(get('notes')) || null,
      // só inclui quando presente: arquivo sem coordenadas não zera o cadastro
      ...(lat.value !== null && { latitude: lat.value }),
      ...(lng.value !== null && { longitude: lng.value }),
    };

    // chave de deduplicação: INEP quando disponível; senão nome normalizado
    const key = inep
      ? `inep:${inep}`
      : name.length >= 3
        ? nameKey(name)
        : null;

    return { data, errors, key };
  },

  classify(rowData, ctx, seen) {
    if (rowData.key && seen.has(rowData.key)) return IMPORT_ROW_STATUS.DUPLICADO;
    if (rowData.key) seen.add(rowData.key);
    return findExisting(rowData.data, ctx) ? IMPORT_ROW_STATUS.ATUALIZAR : IMPORT_ROW_STATUS.NOVO;
  },

  /**
   * GRAVAÇÃO — cada linha é independente, sem uma transação interativa longa.
   * Assim uma linha problemática é registrada e as demais continuam.
   * Idempotente: upsert por INEP (ou nome normalizado), campos ausentes no
   * arquivo (null) NUNCA sobrescrevem valores já cadastrados.
   */
  async apply(validRows, ctx) {
    let created = 0;
    let updated = 0;
    const failures = [];
    // Cada linha usa a transação curta implícita da própria query. Capturar um
    // erro dentro de uma transação PostgreSQL em lote deixa a transação inteira
    // abortada; portanto, a versão anterior não isolava falhas de verdade.
    for (const row of validRows) {
      try {
        const data = row.data;
        let existing = findExisting(data, ctx);

        if (existing) {
          const patch = {
            ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null)),
            deletedAt: null,
          };
          existing = await prisma.school.update({ where: { id: existing.id }, data: patch });
          updated++;
        } else {
          existing = await prisma.school.create({ data });
          created++;
        }

        if (existing.inep) ctx.byInep.set(existing.inep, existing);
        ctx.byNameKey.set(nameKey(existing.name), existing);
      } catch (error) {
        failures.push({ rowNumber: row.rowNumber, message: error.message });
      }
    }

    return { created, updated, failures };
  },
};

/** Localiza escola existente: por INEP; senão pelo nome normalizado. */
function findExisting(data, ctx) {
  if (data.inep) {
    const byInep = ctx.byInep.get(data.inep);
    if (byInep) return byInep;
  }
  if (!data.name || data.name.length < 3) return null;
  return ctx.byNameKey.get(nameKey(data.name)) || null;
}
