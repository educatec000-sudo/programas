import { z } from 'zod';
import { passwordRegex } from '../lib/auth.js';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('e-mail inválido'),
  password: z.string().min(1, 'informe a senha'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('e-mail inválido'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'token inválido'),
  password: z
    .string()
    .regex(passwordRegex, 'A senha deve ter no mínimo 8 caracteres, com letras e números'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'informe a senha atual'),
    newPassword: z
      .string()
      .regex(passwordRegex, 'A nova senha deve ter no mínimo 8 caracteres, com letras e números'),
    confirmPassword: z.string().optional(),
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'A nova senha deve ser diferente da atual',
    path: ['newPassword'],
  });
