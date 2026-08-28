import { request, download, apiUrl } from './api.js';

/** Todas as listagens são carregadas por inteiro e navegadas com rolagem. */
const allRows = (params = {}) => ({ ...params, page: 1, pageSize: 1000 });

/** Fábrica de recursos REST padrão (lista, cria, edita, exclui). */
const crud = (base) => ({
  list: (params) => request(base, { params: allRows(params) }),
  get: (id) => request(`${base}/${id}`),
  create: (body, params) => request(base, { method: 'POST', body, params }),
  update: (id, body) => request(`${base}/${id}`, { method: 'PUT', body }),
  remove: (id) => request(`${base}/${id}`, { method: 'DELETE' }),
});

export const authApi = {
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body }),
  changePassword: (body) => request('/auth/change-password', { method: 'POST', body }),
  sessions: () => request('/auth/sessions'),
  revokeSession: (id) => request(`/auth/sessions/${id}`, { method: 'DELETE' }),
};

export const dashboardApi = {
  get: (params) => request('/dashboard', { params }),
};

export const schoolsApi = {
  ...crud('/schools'),
  stats: () => request('/schools/stats'),
  filters: () => request('/schools/filters'),
  history: (id, params) => request(`/schools/${id}/history`, { params: allRows(params) }),
  export: (params) => download('/schools/export', { params, fallbackName: 'escolas.csv' }),
  batchDelete: (ids) => request('/schools/batch-delete', { method: 'POST', body: { ids } }),
};

/** Técnicos por Escola — relação N:N Usuário(técnico) ↔ Escola. */
export const techniciansApi = {
  stats: () => request('/tecnicos-escola/stats'),
  geral: (params) => request('/tecnicos-escola', { params: allRows(params) }),
  technicians: (params) => request('/tecnicos-escola/technicians', { params: allRows(params) }),
  eligible: () => request('/tecnicos-escola/technicians', { params: { eligible: 'true' } }),
  bySchool: (id) => request(`/tecnicos-escola/escola/${id}`),
  byTechnician: (id) => request(`/tecnicos-escola/tecnico/${id}`),
  create: (body) => request('/tecnicos-escola', { method: 'POST', body }),
  update: (id, body) => request(`/tecnicos-escola/${id}`, { method: 'PUT', body }),
  remove: (id) => request(`/tecnicos-escola/${id}`, { method: 'DELETE' }),
  export: (params) => download('/tecnicos-escola/export', { params, fallbackName: 'tecnicos_escolas.csv' }),
};

export const programsApi = {
  ...crud('/programs'),
  getWithTab: (id) => request(`/programs/${id}`),
  history: (id, params) => request(`/programs/${id}/history`, { params }),
  schoolEvaluation: (id, schoolId, params) =>
    request(`/programs/${id}/schools/${schoolId}/evaluation`, { params }),
  createCriterion: (id, body) => request(`/programs/${id}/criteria`, { method: 'POST', body }),
  addSchools: (id, schoolIds) => request(`/programs/${id}/schools`, { method: 'POST', body: { schoolIds } }),
  updateSchoolLink: (id, schoolId, active) =>
    request(`/programs/${id}/schools/${schoolId}`, { method: 'PUT', body: { active } }),
  removeSchool: (id, schoolId) => request(`/programs/${id}/schools/${schoolId}`, { method: 'DELETE' }),
  addIndicators: (id, items) => request(`/programs/${id}/indicators`, { method: 'POST', body: { items } }),
  updateIndicator: (id, indicatorId, body) =>
    request(`/programs/${id}/indicators/${indicatorId}`, { method: 'PUT', body }),
  removeIndicator: (id, indicatorId) => request(`/programs/${id}/indicators/${indicatorId}`, { method: 'DELETE' }),
};

export const indicatorsApi = {
  ...crud('/indicators'),
  categories: () => request('/indicators/categories'),
  createCategory: (body) => request('/indicators/categories', { method: 'POST', body }),
  updateCategory: (id, body) => request(`/indicators/categories/${id}`, { method: 'PUT', body }),
  removeCategory: (id) => request(`/indicators/categories/${id}`, { method: 'DELETE' }),
};

export const resultsApi = {
  ...crud('/results'),
  createBatch: (items, params) => request('/results/batch', { method: 'POST', body: { items }, params }),
  export: (params) => download('/results/export', { params, fallbackName: 'resultados.csv' }),
};

export const goalsApi = {
  ...crud('/goals'),
  lookup: (params) => request('/goals/lookup', { params }),
};

export const rankingsApi = {
  get: (params) => request('/rankings', { params }),
  consolidate: (body) => request('/rankings/consolidate', { method: 'POST', body }),
  evaluations: (params) => request('/rankings/evaluations', { params: allRows(params) }),
};

export const analyticsApi = {
  overview: (params) => request('/analytics/overview', { params }),
  evolution: (params) => request('/analytics/evolution', { params }),
  distribution: (params) => request('/analytics/distribution', { params }),
  compareSchools: (params) => request('/analytics/compare-schools', { params }),
  comparePrograms: (params) => request('/analytics/compare-programs', { params }),
  goals: (params) => request('/analytics/goals', { params }),
};

export const reportsApi = {
  types: () => request('/reports/types'),
  generate: (type, params) => download(`/reports/${type}`, { params, fallbackName: `relatorio_${type}` }),
};

export const importsApi = {
  upload: (file, type) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    return request('/imports', { method: 'POST', body: form });
  },
  analyzeSchools: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/imports/schools/analyze', { method: 'POST', body: form });
  },
  executeSchools: (file, mapping) => {
    const form = new FormData();
    form.append('file', file);
    form.append('mapping', JSON.stringify(mapping || {}));
    return request('/imports/schools/execute', { method: 'POST', body: form });
  },
  list: (params) => request('/imports', { params: allRows(params) }),
  get: (id) => request(`/imports/${id}`),
  confirm: (id) => request(`/imports/${id}/confirm`, { method: 'POST' }),
  cancel: (id) => request(`/imports/${id}/cancel`, { method: 'POST' }),
  template: (type, format) => download('/imports/template', { params: { type, format }, fallbackName: `modelo_${type}` }),
};

export const usersApi = {
  ...crud('/users'),
  resetPassword: (id, body) => request(`/users/${id}/reset-password`, { method: 'POST', body }),
  unlock: (id) => request(`/users/${id}/unlock`, { method: 'POST' }),
};

export const rolesApi = {
  list: () => request('/roles'),
  permissions: () => request('/roles/permissions'),
  create: (body) => request('/roles', { method: 'POST', body }),
  update: (id, body) => request(`/roles/${id}`, { method: 'PUT', body }),
};

export const auditApi = {
  list: (params) => request('/audit', { params: allRows(params) }),
  stats: () => request('/audit/stats'),
};

export const notificationsApi = {
  list: (params) => request('/notifications', { params }),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request('/notifications/read-all', { method: 'POST' }),
};

export const documentsApi = {
  list: (params) => request('/documents', { params }),
  create: (form) => request('/documents', { method: 'POST', body: form }),
  remove: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  downloadUrl: (id) => apiUrl(`/documents/${id}/download`),
};
