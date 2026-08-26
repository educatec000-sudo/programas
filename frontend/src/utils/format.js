/** Formatadores e rótulos compartilhados. */

export const fmt = (v, digits = 1) =>
  v === null || v === undefined || Number.isNaN(Number(v))
    ? '—'
    : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(v);

export const fmtInt = (v) =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(Math.round(v));

export const fmtPct = (v, digits = 1) => (v === null || v === undefined ? '—' : `${fmt(v, digits)}%`);

export const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export const fmtBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const CLASSIFICATION_INFO = {
  A: { label: 'Excelente', cls: 'badge-class-A', color: '#16a34a' },
  B: { label: 'Bom', cls: 'badge-class-B', color: '#65a30d' },
  C: { label: 'Regular', cls: 'badge-class-C', color: '#d97706' },
  D: { label: 'Baixo', cls: 'badge-class-D', color: '#ea580c' },
  E: { label: 'Crítico', cls: 'badge-class-E', color: '#dc2626' },
};

export const PROGRAM_STATUS = {
  PLANEJAMENTO: { label: 'Planejamento', cls: 'badge-gray' },
  EM_EXECUCAO: { label: 'Em execução', cls: 'badge-blue' },
  CONCLUIDO: { label: 'Concluído', cls: 'badge-green' },
  SUSPENSO: { label: 'Suspenso', cls: 'badge-yellow' },
  CANCELADO: { label: 'Cancelado', cls: 'badge-red' },
};

export const SCHOOL_SITUATION = {
  ATIVA: { label: 'Ativa', cls: 'badge-green' },
  PARALISADA: { label: 'Paralisada', cls: 'badge-yellow' },
  INATIVA: { label: 'Inativa', cls: 'badge-red' },
};

export const DEPENDENCY = {
  FEDERAL: 'Federal', ESTADUAL: 'Estadual', MUNICIPAL: 'Municipal', PRIVADA: 'Privada',
};

export const IMPORT_STATUS = {
  PENDENTE: { label: 'Pendente', cls: 'badge-yellow' },
  IMPORTADO: { label: 'Importado', cls: 'badge-green' },
  FALHOU: { label: 'Falhou', cls: 'badge-red' },
  CANCELADO: { label: 'Cancelado', cls: 'badge-gray' },
};

export const ROW_STATUS = {
  NOVO: { label: 'Novo', cls: 'badge-green' },
  ATUALIZAR: { label: 'Atualizar', cls: 'badge-blue' },
  DUPLICADO: { label: 'Duplicado', cls: 'badge-yellow' },
  ERRO: { label: 'Erro', cls: 'badge-red' },
};

export const AUDIT_ACTION_LABELS = {
  LOGIN: 'Login', LOGIN_FALHA: 'Login inválido', LOGIN_BLOQUEIO: 'Bloqueio p/ tentativas',
  LOGOUT: 'Logout', LOGOUT_SESSAO: 'Sessão encerrada', REFRESH_SESSAO: 'Sessão renovada',
  CREATE: 'Criação', UPDATE: 'Edição', DELETE: 'Exclusão',
  IMPORT_PREVIEW: 'Importação (prévia)', IMPORT_CONFIRM: 'Importação confirmada', IMPORT_CANCEL: 'Importação cancelada',
  EXPORT: 'Exportação', REPORT: 'Relatório gerado',
  PASSWORD_CHANGE: 'Senha alterada', PASSWORD_RESET: 'Senha redefinida', PASSWORD_RESET_REQUEST: 'Recuperação solicitada',
  EVALUATION_CONSOLIDATE: 'Avaliação consolidada', UNLOCK_USER: 'Usuário desbloqueado', SEED: 'Seed',
};

export const ENTITY_LABELS = {
  User: 'Usuário', Role: 'Perfil', School: 'Escola', Program: 'Programa',
  Indicator: 'Indicador', IndicatorCategory: 'Categoria', Result: 'Resultado',
  Goal: 'Meta', Evaluation: 'Avaliação', ImportJob: 'Importação', Document: 'Documento',
  Report: 'Relatório', Session: 'Sessão', System: 'Sistema',
  SchoolTechnician: 'Vínculo Técnico-Escola',
};

export const PERIODS = ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre', '1º Semestre', '2º Semestre', 'Anual'];

export const yearsRange = (start = 2023) => {
  const current = new Date().getFullYear() + 1;
  return Array.from({ length: current - start + 1 }, (_, i) => current - i);
};
