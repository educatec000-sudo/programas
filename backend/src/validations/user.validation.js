import { z } from 'zod';
import { uuid, emptyToNull } from './common.validation.js';
import { passwordRegex } from '../lib/auth.js';

export const createUserSchema = z.object({
  name: z.string().trim().min(3, 'nome muito curto').max(120),
  email: z.string().trim().toLowerCase().email('e-mail inválido'),
  password: z
    .string()
    .regex(passwordRegex, 'Senha: mínimo 8 caracteres, com letras e números'),
  roleId: uuid,
  phone: emptyToNull(z.string().max(30)),
  active: z.boolean().optional().default(true),
  mustChangePassword: z.boolean().optional().default(false),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  roleId: uuid.optional(),
  phone: emptyToNull(z.string().max(30)),
  active: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().regex(passwordRegex, 'Senha: mínimo 8 caracteres, com letras e números'),
  mustChangePassword: z.boolean().optional().default(true),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(3).max(60),
  description: emptyToNull(z.string().max(200)),
  level: z.coerce.number().int().min(1).max(100).default(10),
  canBeTechnician: z.boolean().optional().default(false),
  permissionKeys: z.array(z.string()).default([]),
});

export const updateRoleSchema = createRoleSchema.partial();
