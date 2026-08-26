import { prisma } from './prisma.js';

/**
 * Registra uma entrada de auditoria. Nunca lança erro — auditoria não deve
 * interromper a operação principal. Falhas são apenas logadas.
 */
export async function audit({ userId = null, userName = null, action, entity, entityId = null, metadata = null, ip = null }) {
  try {
    await prisma.auditLog.create({
      data: { userId, userName, action, entity, entityId, metadata, ip },
    });
  } catch (err) {
    console.error('[CPE][AUDIT_FAIL]', action, entity, err?.message);
  }
}

export const AuditAction = Object.freeze({
  LOGIN: 'LOGIN',
  LOGIN_FALHA: 'LOGIN_FALHA',
  LOGIN_BLOQUEIO: 'LOGIN_BLOQUEIO',
  LOGOUT: 'LOGOUT',
  LOGOUT_SESSAO: 'LOGOUT_SESSAO',
  REFRESH_SESSAO: 'REFRESH_SESSAO',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  IMPORT_PREVIEW: 'IMPORT_PREVIEW',
  IMPORT_CONFIRM: 'IMPORT_CONFIRM',
  IMPORT_CANCEL: 'IMPORT_CANCEL',
  EXPORT: 'EXPORT',
  REPORT: 'REPORT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  EVALUATION_CONSOLIDATE: 'EVALUATION_CONSOLIDATE',
  UNLOCK_USER: 'UNLOCK_USER',
});
