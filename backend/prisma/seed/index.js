/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, ROLE_MATRIX, DEMO_USERS } from './permissions.js';
import { DEMO_SCHOOL_INEPS, seedDemoData } from './demo.js';
import { seedTechnicians } from './technicians.js';

const prisma = new PrismaClient();

async function seedUsers(roleMap, demoEnabled) {
  if (demoEnabled) {
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
    console.log(`   ${DEMO_USERS.length} usuários de demonstração garantidos`);
    return;
  }

  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (Boolean(email) !== Boolean(password)) {
    throw new Error('Defina INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD juntos');
  }
  if (!email) {
    console.log('   nenhum usuário criado (defina INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD)');
    return;
  }
  if (DEMO_USERS.some((user) => user.email === email)) {
    throw new Error('INITIAL_ADMIN_EMAIL não pode usar um endereço público de demonstração');
  }
  if (!/^(?=.*[A-Za-z])(?=.*\d).{12,}$/.test(password)) {
    throw new Error('INITIAL_ADMIN_PASSWORD deve ter ao menos 12 caracteres, com letras e números');
  }

  const administrator = roleMap.get('Administrador');
  await prisma.user.upsert({
    where: { email },
    update: { roleId: administrator.id, active: true },
    create: {
      name: process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrador CPE',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      roleId: administrator.id,
      active: true,
      mustChangePassword: true,
    },
  });
  console.log(`   administrador inicial garantido: ${email}`);
}

async function main() {
  console.log('>> CPE seed iniciado');

  // Produção nunca recebe nem aceita as credenciais públicas de demonstração.
  const isProduction = process.env.NODE_ENV === 'production';
  const demoEnabled = !isProduction && process.env.SEED_DEMO !== 'false';
  if (isProduction) {
    const demoAccounts = await prisma.user.count({
      where: { email: { in: DEMO_USERS.map((user) => user.email) } },
    });
    if (demoAccounts) {
      throw new Error(
        'Banco de produção contém usuários de demonstração. Remova-os ou use um banco limpo antes de executar o seed.',
      );
    }
  }

  // 1) Permissões
  const permissionMap = new Map();
  for (const [key, description] of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
    permissionMap.set(key, permission.id);
  }
  console.log(`   ${permissionMap.size} permissões garantidas`);

  // 2) Perfis e permissões
  const roleMap = new Map();
  for (const [name, definition] of Object.entries(ROLE_MATRIX)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {
        description: definition.description,
        level: definition.level,
        canBeTechnician: definition.canBeTechnician ?? false,
        active: true,
      },
      create: {
        name,
        description: definition.description,
        level: definition.level,
        canBeTechnician: definition.canBeTechnician ?? false,
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const keys = definition.permissions === 'ALL'
      ? [...permissionMap.keys()]
      : definition.permissions;
    await prisma.rolePermission.createMany({
      data: keys.map((key) => ({ roleId: role.id, permissionId: permissionMap.get(key) })),
    });
    roleMap.set(name, role);
  }
  console.log(`   ${roleMap.size} perfis configurados`);

  // 3) Usuários seguros por ambiente
  await seedUsers(roleMap, demoEnabled);

  // 4) Dados e técnicos exclusivamente de demonstração. Em banco vazio ou
  // com marcas de uma execução demo interrompida, o seed idempotente completa
  // o conjunto. Um banco já preenchido apenas com dados reais é preservado.
  if (demoEnabled) {
    const [activeSchools, demoSchools] = await Promise.all([
      prisma.school.count({ where: { deletedAt: null } }),
      prisma.school.count({ where: { inep: { in: DEMO_SCHOOL_INEPS } } }),
    ]);
    if (activeSchools === 0 || demoSchools > 0) {
      await seedDemoData(prisma);
      await seedTechnicians(prisma);
    } else {
      console.log('   dados de demonstração ignorados (banco já possui escolas reais)');
    }
  } else {
    console.log('   dados de demonstração desabilitados');
  }

  await prisma.auditLog.create({
    data: {
      userName: 'sistema',
      action: 'SEED',
      entity: 'System',
      metadata: { message: 'Seed do CPE executado', demoEnabled },
    },
  });

  console.log('>> CPE seed concluído');
}

main()
  .catch((error) => {
    console.error('Seed falhou:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
