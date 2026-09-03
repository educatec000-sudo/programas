import PactoAdmin from './pacto/PactoAdmin.jsx';
import PactoDashboard from './pacto/PactoDashboard.jsx';

/**
 * Registro dos ambientes específicos de programas.
 *
 * Um programa só deve ser adicionado aqui depois da análise de sua documentação
 * oficial. O código estável e o ciclo identificam a implementação; o nome de
 * exibição nunca é usado em condicionais espalhadas pela aplicação.
 */
const PACTO_DISABLED_SHARED_TABS = ['criterios', 'avaliacoes', 'resultados', 'ranking', 'graficos', 'relatorios'];

const implementations = [
  {
    code: 'PACTO-ALFABETIZACAO-2026',
    year: 2026,
    disabledSharedTabs: PACTO_DISABLED_SHARED_TABS,
    OverviewComponent: PactoDashboard,
    adminTabs: [
      { key: 'coleta-pacto', label: 'Coleta do Pacto', Component: PactoAdmin },
    ],
  },
];

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function getProgramImplementation(program) {
  if (!program) return null;
  const code = normalizeCode(program.code);
  const exact = implementations.find((item) => (
    normalizeCode(item.code) === code && (item.year == null || Number(item.year) === Number(program.year))
  ));
  if (exact) return exact;

  // Ciclos futuros do Pacto permanecem no mesmo catálogo, mas não recebem
  // formulário, pontuação ou coleta genéricos sem documentação oficial própria.
  if (normalizeCode(program.catalog?.code) === 'PACTO-ALFABETIZACAO') {
    return {
      catalogCode: 'PACTO-ALFABETIZACAO',
      disabledSharedTabs: PACTO_DISABLED_SHARED_TABS,
      unavailableCycle: true,
      adminTabs: [],
    };
  }
  return null;
}

export function supportsSharedFeature(program, feature) {
  return !getProgramImplementation(program)?.disabledSharedTabs?.includes(feature);
}
