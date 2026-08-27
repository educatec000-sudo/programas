/* eslint-disable no-console */
/**
 * Seed de Técnicos por Escola — cria usuários técnicos e vínculos de
 * demonstração cobrindo todos os cenários:
 *   - escola com vários técnicos
 *   - técnico com várias escolas
 *   - escola sem técnico
 *   - técnico sem escola
 */
import bcrypt from 'bcryptjs';
import { DEMO_SCHOOL_INEPS } from './demo.js';

export async function seedTechnicians(prisma) {
  const technicianRole = await prisma.role.findUnique({ where: { name: 'Técnico' } });
  if (!technicianRole) {
    console.log('   (perfil Técnico não encontrado — seed de técnicos ignorado)');
    return;
  }

  const passwordHash = await bcrypt.hash('Tec@1234', 10);

  // 1) usuários técnicos (idempotente)
  const techs = {};
  for (const t of [
    { name: 'João Silva', email: 'joao.silva@tec.cpe.local' },
    { name: 'Maria Santos', email: 'maria.santos@tec.cpe.local' },
    { name: 'Pedro Souza', email: 'pedro.souza@tec.cpe.local' },
    { name: 'Ana Costa', email: 'ana.costa@tec.cpe.local' },
    { name: 'Carlos Lima', email: 'carlos.lima@tec.cpe.local' },
  ]) {
    techs[t.name] = await prisma.user.upsert({
      where: { email: t.email },
      update: { roleId: technicianRole.id, active: true },
      create: { name: t.name, email: t.email, passwordHash, roleId: technicianRole.id },
    });
  }
  console.log(`   ${Object.keys(techs).length} usuários técnicos garantidos (senha Tec@1234)`);

  // 2) vínculos de demonstração. Se uma execução anterior foi interrompida,
  // os upserts abaixo completam somente o que estiver faltando.
  const demoIneps = DEMO_SCHOOL_INEPS.slice(0, 8);
  const schoolRows = await prisma.school.findMany({
    where: { inep: { in: demoIneps }, deletedAt: null },
    select: { id: true, inep: true, name: true },
  });
  const schoolByInep = new Map(schoolRows.map((school) => [school.inep, school]));
  const schools = demoIneps.map((inep) => schoolByInep.get(inep)).filter(Boolean);
  if (schools.length < 8) {
    console.log('   escolas de demonstração insuficientes — vínculos técnicos ignorados');
    return;
  }

  const links = [
    // escola com vários técnicos
    { school: schools[0], tech: techs['João Silva'] },
    { school: schools[0], tech: techs['Maria Santos'] },
    // técnicos com várias escolas
    { school: schools[1], tech: techs['João Silva'] },
    { school: schools[2], tech: techs['Pedro Souza'] },
    { school: schools[5], tech: techs['Pedro Souza'] },
    { school: schools[3], tech: techs['Ana Costa'] },
    { school: schools[7], tech: techs['Ana Costa'] },
  ];

  for (const link of links) {
    await prisma.schoolTechnician.upsert({
      where: {
        schoolId_technicianId: { schoolId: link.school.id, technicianId: link.tech.id },
      },
      update: {},
      create: { schoolId: link.school.id, technicianId: link.tech.id },
    });
  }
  console.log(`   ${links.length} vínculos técnico-escola de demonstração`);
  console.log('   cenários: escola c/ vários técnicos ✓ técnico c/ várias escolas ✓ escola sem técnico ✓ técnico sem escola (Carlos Lima) ✓');
}
