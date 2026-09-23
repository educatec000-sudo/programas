import { prisma } from './prisma.js';

function isAuditUserFkViolation(err) {
  if (!err) return false;
  if (err.code === 'P2003') return true;
  const message = String(err?.message || '');
  return message.includes('AuditLog_userId_fkey');
}

/**
 * Registra uma entrada de auditoria. Nunca lança erro — auditoria não deve
 * interromper a operação principal. Quando o usuário informado não existe
 * no banco atual (cenário comum em testes com mocks), faz fallback seguro
 * preservando userName e demais metadados, mas sem o vínculo FK.
 */
export async function audit({ userId = null, userName = null, action, entity, entityId = null, metadata = null, ip = null }) {
  const data = { userId, userName, action, entity, entityId, metadata, ip };
  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    if (userId && isAuditUserFkViolation(err)) {
      try {
        await prisma.auditLog.create({
          data: { ...data, userId: null },
        });
        return;
      } catch (fallbackErr) {
        console.error('[CPE][AUDIT_FAIL]', action, entity, fallbackErr?.message);
        return;
      }
    }
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
