/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, ROLE_MATRIX, DEMO_USERS } from './permissions.js';
import { seedDemoData } from './demo.js';
import { seedTechnicians } from './technicians.js';

const prisma = new PrismaClient();

async function main() {
  console.log('>> CPE seed iniciado');

  // 1) Permissões
  const permissionMap = new Map();
  for (const [key, description] of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
    permissionMap.set(key, p.id);
  }
  console.log(`   ${permissionMap.size} permissões garantidas`);

  // 2) Perfis + vínculo com permissões (canBeTechnician define quem pode ser técnico)
  const roleMap = new Map();
  for (const [name, def] of Object.entries(ROLE_MATRIX)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: def.description, level: def.level, canBeTechnician: def.canBeTechnician ?? false },
      create: {
        name,
        description: def.description,
        level: def.level,
        canBeTechnician: def.canBeTechnician ?? false,
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const keys = def.permissions === 'ALL' ? [...permissionMap.keys()] : def.permissions;
    await prisma.rolePermission.createMany({
      data: keys.map((key) => ({ roleId: role.id, permissionId: permissionMap.get(key) })),
    });
    roleMap.set(name, role);
  }
  console.log(`   ${roleMap.size} perfis configurados (Administrador, Coordenador, Técnico, Consulta)`);

  // 3) Usuários
  for (const demo of DEMO_USERS) {
    const role = roleMap.get(demo.role);
    await prisma.user.upsert({
      where: { email: demo.email },
      update: { roleId: role.id, active: true },
      create: {
        name: demo.name,
        email: demo.email,
        passwordHash: await bcrypt.hash(demo.password, 10),
        roleId: role.id,
        active: true,
      },
    });
  }
  console.log(`   ${DEMO_USERS.length} usuários criados (admin@ / coordenador@ / tecnico@ / consulta@ cpe.local)`);

  // 4) Dados de demonstração
  const alreadySeeded = await prisma.school.count({ where: { deletedAt: null } });
  if (alreadySeeded === 0 && process.env.SEED_DEMO !== 'false') {
    await seedDemoData(prisma);
  } else {
    console.log('   dados de demonstração ignorados (banco já possui escolas)');
  }

  // 5) Técnicos por Escola (idempotente)
  await seedTechnicians(prisma);

  await prisma.auditLog.create({
    data: {
      userName: 'sistema',
      action: 'SEED',
      entity: 'System',
      metadata: { message: 'Seed do CPE executado' },
    },
  });

  console.log('>> CPE seed concluído');
}

main()
  .catch((err) => {
    console.error('Seed falhou:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
