/**
 * Catálogo de permissões do CPE (chave -> descrição).
 * 32 permissões originais + 4 do módulo Técnicos por Escola = 36.
 */
export const PERMISSIONS = [
  ['dashboard:read', 'Acessar o dashboard'],

  ['schools:read', 'Consultar escolas'],
  ['schools:write', 'Cadastrar/editar escolas'],
  ['schools:delete', 'Excluir escolas'],
  ['schools:export', 'Exportar escolas'],

  ['programs:read', 'Consultar programas'],
  ['programs:write', 'Cadastrar/editar programas'],
  ['programs:delete', 'Excluir programas'],

  ['indicators:read', 'Consultar indicadores'],
  ['indicators:write', 'Cadastrar/editar indicadores'],
  ['indicators:delete', 'Excluir indicadores'],

  ['results:read', 'Consultar resultados'],
  ['results:write', 'Lançar/editar resultados'],
  ['results:delete', 'Excluir resultados'],
  ['results:import', 'Importar resultados (legado)'],
  ['imports:read', 'Acompanhar importações'],
  ['imports:write', 'Executar importações'],

  ['goals:read', 'Consultar metas'],
  ['goals:write', 'Cadastrar/editar metas'],
  ['goals:delete', 'Excluir metas'],

  ['rankings:read', 'Consultar rankings'],
  ['evaluations:write', 'Consolidar avaliações'],
  ['analytics:read', 'Acessar análises e gráficos'],
  ['reports:read', 'Gerar relatórios e exportações'],

  ['technicians:read', 'Consultar técnicos por escola'],
  ['technicians:write', 'Criar/alterar vínculos técnico-escola'],
  ['technicians:delete', 'Excluir vínculos técnico-escola'],
  ['technicians:export', 'Exportar relação técnico-escola'],

  ['users:read', 'Consultar usuários'],
  ['users:write', 'Cadastrar/editar usuários'],
  ['users:delete', 'Desativar usuários'],
  ['roles:read', 'Consultar perfis e permissões'],
  ['roles:write', 'Editar perfis e permissões'],

  ['audit:read', 'Consultar auditoria'],
  ['documents:read', 'Ver documentos'],
  ['documents:write', 'Enviar/remover documentos'],
];

export const ROLE_MATRIX = {
  Administrador: {
    description: 'Acesso total ao sistema',
    level: 100,
    canBeTechnician: false,
    permissions: 'ALL',
  },
  Coordenador: {
    description: 'Gerencia programas, indicadores, metas e resultados',
    level: 70,
    canBeTechnician: false,
    permissions: [
      'dashboard:read',
      'schools:read', 'schools:write', 'schools:export',
      'programs:read', 'programs:write', 'programs:delete',
      'indicators:read', 'indicators:write', 'indicators:delete',
      'results:read', 'results:write', 'results:delete', 'results:import',
      'imports:read', 'imports:write',
      'goals:read', 'goals:write', 'goals:delete',
      'rankings:read', 'evaluations:write', 'analytics:read', 'reports:read',
      'technicians:read', 'technicians:write', 'technicians:delete', 'technicians:export',
      'audit:read',
      'documents:read', 'documents:write',
    ],
  },
  'Técnico': {
    description: 'Lança e importa resultados e gera relatórios',
    level: 40,
    canBeTechnician: true, // usuários deste perfil podem ser vinculados a escolas
    permissions: [
      'dashboard:read',
      'schools:read', 'schools:export',
      'programs:read',
      'indicators:read',
      'results:read', 'results:write', 'results:import',
      'imports:read', 'imports:write',
      'goals:read',
      'rankings:read', 'analytics:read', 'reports:read',
      'technicians:read', 'technicians:export',
      'documents:read', 'documents:write',
    ],
  },
  Consulta: {
    description: 'Somente leitura',
    level: 20,
    canBeTechnician: false,
    permissions: [
      'dashboard:read',
      'schools:read', 'schools:export',
      'programs:read',
      'indicators:read',
      'results:read',
      'imports:read',
      'goals:read',
      'rankings:read', 'analytics:read', 'reports:read',
      'technicians:read', 'technicians:export',
      'documents:read',
    ],
  },
};

export const DEMO_USERS = [
  {
    name: 'Administrador CPE',
    email: 'admin@cpe.local',
    password: 'Admin@123',
    role: 'Administrador',
  },
  {
    name: 'Cláudia Coordenadora',
    email: 'coordenador@cpe.local',
    password: 'Coord@123',
    role: 'Coordenador',
  },
  {
    name: 'Tiago Técnico',
    email: 'tecnico@cpe.local',
    password: 'Tec@123',
    role: 'Técnico',
  },
  {
    name: 'Cida Consulta',
    email: 'consulta@cpe.local',
    password: 'Ver@123',
    role: 'Consulta',
  },
];

/** Usuários criados para demonstrar Técnicos por Escola (perfil Técnico). */
export const DEMO_TECHNICIANS = [
  { name: 'João Silva', email: 'joao.silva@tec.cpe.local' },
  { name: 'Maria Santos', email: 'maria.santos@tec.cpe.local' },
  { name: 'Pedro Souza', email: 'pedro.souza@tec.cpe.local' },
  { name: 'Ana Costa', email: 'ana.costa@tec.cpe.local' },
  { name: 'Carlos Lima', email: 'carlos.lima@tec.cpe.local' }, // fica SEM escola no seed
];
