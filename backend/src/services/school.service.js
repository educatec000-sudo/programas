import { prisma } from '../lib/prisma.js';
import { notFound, conflict } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination, normalizeSearch } from '../lib/pagination.js';

const SORTABLE = {
  name: 'name',
  inep: 'inep',
  municipality: 'municipality',
  createdAt: 'createdAt',
  situation: 'situation',
};

const technicianLinkInclude = {
  technician: { select: { id: true, name: true, email: true, role: { select: { name: true } } } },
};

export async function listSchools(query) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const { search, municipality, zone, situation, programId, technicianId, hasTechnician, district, schoolType, hasCoordinates } = query;

  // busca pelo termo original (acentos preservados — "GUAJARÁ", "João Silva")
  const ns = (search || '').trim();
  const where = {
    deletedAt: null,
    ...(ns && {
      OR: [
        { name: { contains: ns, mode: 'insensitive' } },
        { inep: { contains: ns } },
        { municipality: { contains: ns, mode: 'insensitive' } },
        { responsible: { contains: ns, mode: 'insensitive' } },
        { address: { contains: ns, mode: 'insensitive' } },
        { technicianLinks: { some: { technician: { name: { contains: ns, mode: 'insensitive' } } } } },
      ],
    }),
    ...(municipality && { municipality: { equals: municipality, mode: 'insensitive' } }),
    ...(zone && { zone }),
    ...(situation && { situation }),
    ...(district && { district: { equals: district, mode: 'insensitive' } }),
    ...(schoolType && { schoolType: { equals: schoolType, mode: 'insensitive' } }),
    ...(hasCoordinates === 'true' && { latitude: { not: null }, longitude: { not: null } }),
    ...(hasCoordinates === 'false' && { OR: [{ latitude: null }, { longitude: null }] }),
    ...(programId && { programs: { some: { programId, active: true } } }),
    ...(technicianId && { technicianLinks: { some: { technicianId } } }),
    ...(hasTechnician === 'true' && { technicianLinks: { some: {} } }),
    ...(hasTechnician === 'false' && { technicianLinks: { none: {} } }),
  };

  const orderBy = { [SORTABLE[query.sort] || 'name']: query.dir === 'desc' ? 'desc' : 'asc' };

  const [total, schools] = await Promise.all([
    prisma.school.count({ where }),
    prisma.school.findMany({
      where,
      include: {
        technicianLinks: { include: technicianLinkInclude, orderBy: { technician: { name: 'asc' } } },
        _count: { select: { programs: true, results: true } },
      },
      orderBy,
      skip,
      take,
    }),
  ]);

  return {
    data: schools.map((s) => ({
      id: s.id,
      inep: s.inep,
      name: s.name,
      schoolType: s.schoolType,
      municipality: s.municipality,
      address: s.address,
      addressNumber: s.addressNumber,
      addressComplement: s.addressComplement,
      district: s.district,
      cep: s.cep,
      uf: s.uf,
      zone: s.zone,
      adminDependency: s.adminDependency,
      situation: s.situation,
      phone: s.phone,
      email: s.email,
      responsible: s.responsible,
      latitude: s.latitude,
      longitude: s.longitude,
      programsCount: s._count.programs,
      resultsCount: s._count.results,
      technicians: s.technicianLinks.map((l) => ({
        linkId: l.id,
        userId: l.technician.id,
        name: l.technician.name,
        role: l.technician.role.name,
      })),
      techniciansCount: s.technicianLinks.length,
      createdAt: s.createdAt,
    })),
    pagination: buildPagination(total, page, pageSize),
  };
}

/** Indicadores do cadastro de escolas (todos do banco). */
export async function getSchoolsStats() {
  const [total, ativas, paralisadas, urbana, rural, schoolsWithTechnicianRaw] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.school.count({ where: { deletedAt: null, situation: 'ATIVA' } }),
    prisma.school.count({ where: { deletedAt: null, situation: 'PARALISADA' } }),
    prisma.school.count({ where: { deletedAt: null, zone: 'URBANA' } }),
    prisma.school.count({ where: { deletedAt: null, zone: 'RURAL' } }),
    prisma.schoolTechnician.findMany({
      where: { school: { deletedAt: null } },
      distinct: ['schoolId'],
      select: { schoolId: true },
    }),
  ]);

  const comTecnico = schoolsWithTechnicianRaw.length;
  return {
    total,
    ativas,
    inativas: total - ativas,
    paralisadas,
    urbana,
    rural,
    comTecnico,
    semTecnico: Math.max(0, total - comTecnico),
  };
}

export async function getSchool(id) {
  const school = await prisma.school.findFirst({
    where: { id, deletedAt: null },
    include: {
      programs: {
        where: { program: { deletedAt: null } },
        include: { program: { select: { id: true, name: true, code: true, year: true, status: true } } },
        orderBy: { program: { name: 'asc' } },
      },
      technicianLinks: {
        include: {
          technician: {
            select: {
              id: true, name: true, email: true, phone: true,
              role: { select: { name: true } },
            },
          },
        },
        orderBy: { technician: { name: 'asc' } },
      },
      _count: { select: { results: true, goals: true } },
    },
  });
  if (!school) throw notFound('Escola não encontrada');

  const goals = await prisma.goal.findMany({
    where: { schoolId: id },
    include: { indicator: { select: { name: true, unit: true } }, program: { select: { name: true } } },
    orderBy: { year: 'desc' },
    take: 20,
  });

  return {
    ...school,
    resultsCount: school._count.results,
    goalsCount: school._count.goals,
    schoolGoals: goals,
    technicians: school.technicianLinks.map((l) => ({
      linkId: l.id,
      userId: l.technician.id,
      name: l.technician.name,
      email: l.technician.email,
      phone: l.technician.phone,
      role: l.technician.role.name,
      notes: l.notes,
      linkedAt: l.createdAt,
    })),
  };
}

export async function createSchool(data, actor, ip) {
  if (data.inep) {
    const exists = await prisma.school.findUnique({ where: { inep: data.inep } });
    if (exists && !exists.deletedAt) throw conflict('Já existe uma escola com este código INEP');
    if (exists) {
      const school = await prisma.school.update({ where: { id: exists.id }, data: { ...data, deletedAt: null } });
      await audit({
        userId: actor.id,
        userName: actor.name,
        action: AuditAction.UPDATE,
        entity: 'School',
        entityId: school.id,
        metadata: { inep: school.inep, name: school.name, reactivated: true },
        ip,
      });
      return school;
    }
  }

  const school = await prisma.school.create({ data });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'School',
    entityId: school.id,
    metadata: { inep: school.inep, name: school.name },
    ip,
  });
  return school;
}

export async function updateSchool(id, data, actor, ip) {
  const school = await prisma.school.findFirst({ where: { id, deletedAt: null } });
  if (!school) throw notFound('Escola não encontrada');

  if (data.inep && data.inep !== school.inep) {
    const exists = await prisma.school.findUnique({ where: { inep: data.inep } });
    if (exists && exists.id !== id) throw conflict('Já existe uma escola com este código INEP');
  }

  const updated = await prisma.school.update({ where: { id }, data });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'School',
    entityId: id,
    metadata: { before: pickChanged(school, updated), after: data },
    ip,
  });
  return updated;
}

function pickChanged(before, after) {
  const keys = ['inep', 'name', 'municipality', 'situation', 'zone', 'adminDependency', 'responsible', 'address', 'latitude', 'longitude'];
  const out = {};
  for (const k of keys) if (before[k] !== after[k]) out[k] = before[k];
  return out;
}

/** Soft delete — preserva histórico de resultados, rankings, técnicos e auditoria. */
export async function deleteSchool(id, actor, ip) {
  const school = await prisma.school.findFirst({ where: { id, deletedAt: null } });
  if (!school) throw notFound('Escola não encontrada');
  await prisma.school.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'School',
    entityId: id,
    metadata: { inep: school.inep, name: school.name },
    ip,
  });
}

/** Soft delete em lote — preserva histórico de resultados, rankings e técnicos. */
export async function deleteSchools(ids, actor, ip) {
  const targets = await prisma.school.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, inep: true, name: true },
  });
  if (!targets.length) return { deleted: 0 };

  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.school.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { deletedAt: new Date() },
    });
    return result.count;
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'School',
    metadata: {
      batch: true,
      count: deleted,
      schools: targets.slice(0, 100).map((t) => ({ inep: t.inep, name: t.name })),
    },
    ip,
  });

  return { deleted };
}

export async function schoolHistory(id, query) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where = { entity: 'School', entityId: id };
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
  ]);
  return { data: logs, pagination: buildPagination(total, page, pageSize) };
}

export async function listMunicipalities() {
  const rows = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { municipality: true },
    distinct: ['municipality'],
    orderBy: { municipality: 'asc' },
  });
  return rows.map((r) => r.municipality);
}

/** Opções de filtro da tela de Escolas (municípios, bairros, tipos). */
export async function listFilterOptions() {
  const [municipalities, districts, schoolTypes] = await Promise.all([
    prisma.school.findMany({
      where: { deletedAt: null },
      select: { municipality: true },
      distinct: ['municipality'],
      orderBy: { municipality: 'asc' },
    }),
    prisma.school.findMany({
      where: { deletedAt: null, district: { not: null } },
      select: { district: true },
      distinct: ['district'],
      orderBy: { district: 'asc' },
      take: 500,
    }),
    prisma.school.findMany({
      where: { deletedAt: null, schoolType: { not: null } },
      select: { schoolType: true },
      distinct: ['schoolType'],
      orderBy: { schoolType: 'asc' },
      take: 200,
    }),
  ]);
  return {
    municipalities: municipalities.map((r) => r.municipality),
    districts: districts.map((r) => r.district),
    schoolTypes: schoolTypes.map((r) => r.schoolType),
  };
}
