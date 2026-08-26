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
 *  - deduplicação: INEP (principal) → nome normalizado + município (fallback);
 *  - coordenadas com decimais implícitas normalizadas (ver coordinates.js);
 *  - gravação em lotes pequenos SEM transação interativa gigante
 *    (causa do erro "Transaction API error: Transaction not found":
 *    transações interativas do Prisma expiram em 5s por padrão; com 170+
 *    upserts sequenciais o banco derruba a transação);
 *  - linha com erro não interrompe a importação.
 */

const DEFAULT_MUNICIPALITY = process.env.DEFAULT_MUNICIPALITY || 'Benevides';
const DEFAULT_UF = process.env.DEFAULT_UF || 'PA';

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
const ZONE_MAP = { '1': 'URBANA', urbana: 'URBANA', u: 'URBANA', '2': 'RURAL', rural: 'RURAL', r: 'RURAL' };

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

export function nameKey(name, municipality) {
  return `nm:${normName(name)}|${normName(municipality)}`;
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
  const num = toNumber(rawValue);
  if (num === null) {
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
  headers: ['INEP', 'ESCOLAS', 'ENDEREÇO', 'GESTOR(A)', 'ZONA', 'LATITUDE', 'LONGITUDE'],
  examples: [
    ['15012345', 'ESCOLA MUNICIPAL EXPERIMENTAL', 'AV. PRINCIPAL, 100', 'MARIA SOUZA', 'URBANA', -1.62195, -48.25461],
  ],

  async loadContext() {
    const schools = await prisma.school.findMany({
      where: { deletedAt: null },
      select: { id: true, inep: true, name: true, municipality: true },
    });
    const byInep = new Map();
    const byNameKey = new Map();
    for (const s of schools) {
      if (s.inep) byInep.set(s.inep, s);
      byNameKey.set(nameKey(s.name, s.municipality), s);
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

    // ---- Município / UF (opcionais; padrão apenas na criação) ----
    const municipality = str(get('municipality')) || null;
    let uf = str(get('uf')).toUpperCase().replace(/[^A-Z]/g, '');
    if (get('uf') !== undefined && str(get('uf')) && uf.length !== 2) {
      errors.push({ field: 'uf', message: `Coluna "${mapping?.uf || 'UF'}": valor "${str(get('uf'))}" inválido (use a sigla, ex.: PA)` });
      uf = null;
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
      municipality,
      address: str(get('address')) || null,
      addressNumber: str(get('addressNumber')) || null,
      addressComplement: str(get('addressComplement')) || null,
      district: str(get('district')) || null,
      cep: cepRaw ? cep : null,
      uf: uf || null,
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

    // chave de deduplicação: INEP quando disponível; senão nome + município
    const key = inep
      ? `inep:${inep}`
      : name.length >= 3
        ? nameKey(name, municipality ?? DEFAULT_MUNICIPALITY)
        : null;

    return { data, errors, key };
  },

  classify(rowData, ctx, seen) {
    if (rowData.key && seen.has(rowData.key)) return IMPORT_ROW_STATUS.DUPLICADO;
    if (rowData.key) seen.add(rowData.key);
    return findExisting(rowData.data, ctx) ? IMPORT_ROW_STATUS.ATUALIZAR : IMPORT_ROW_STATUS.NOVO;
  },

  /**
   * GRAVAÇÃO — correção definitiva do erro "Transaction not found":
   * em vez de UMA transação interativa com todas as linhas (que expira),
   * processa em LOTES de 25 linhas por transação curta, com timeout
   * ampliado e falha isolada por linha (uma linha problemática não derruba
   * o lote — é registrada e o restante continua).
   * Idempotente: upsert por INEP (ou nome+município), campos ausentes no
   * arquivo (null) NUNCA sobrescrevem valores já cadastrados.
   */
  async apply(validRows, ctx) {
    let created = 0;
    let updated = 0;
    const failures = [];
    const BATCH = 25;

    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH);
      await prisma.$transaction(
        async (tx) => {
          for (const row of batch) {
            try {
              const d = row.data;
              let existing = findExisting(d, ctx);

              if (existing) {
                const patch = Object.fromEntries(
                  Object.entries(d).filter(([, v]) => v !== null),
                );
                await tx.school.update({ where: { id: existing.id }, data: patch });
                updated++;
              } else {
                const school = await tx.school.create({
                  data: {
                    ...d,
                    municipality: d.municipality ?? DEFAULT_MUNICIPALITY,
                    uf: d.uf ?? DEFAULT_UF,
                  },
                });
                created++;
                existing = school;
              }

              // contexto atualizado p/ as próximas linhas do arquivo
              if (existing.inep) ctx.byInep.set(existing.inep, existing);
              ctx.byNameKey.set(nameKey(existing.name, existing.municipality), existing);
            } catch (err) {
              failures.push({ rowNumber: row.rowNumber, message: err.message });
            }
          }
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
    }

    return { created, updated, failures };
  },
};

/** Localiza escola existente: por INEP; senão por nome+município (com padrão). */
function findExisting(data, ctx) {
  if (data.inep) {
    const byInep = ctx.byInep.get(data.inep);
    if (byInep) return byInep;
  }
  if (!data.name || data.name.length < 3) return null;
  const municipalities = new Set([data.municipality, DEFAULT_MUNICIPALITY]);
  for (const m of municipalities) {
    const found = ctx.byNameKey.get(nameKey(data.name, m));
    if (found) return found;
  }
  return null;
}
