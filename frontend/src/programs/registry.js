import PactoAdmin from './pacto/PactoAdmin.jsx';
import PactoDashboard from './pacto/PactoDashboard.jsx';
import CncaDashboard from './cnca/CncaDashboard.jsx';
import CncaSchools from './cnca/CncaSchools.jsx';
import CncaSchoolResults from './cnca/CncaSchoolResults.jsx';
import CncaRanking from './cnca/CncaRanking.jsx';
import CncaImport from './cnca/CncaImport.jsx';

/**
 * Registro dos ambientes específicos de programas.
 *
 * Um programa só deve ser adicionado aqui depois da análise de sua documentação
 * oficial. O código estável e o ciclo identificam a implementação; o nome de
 * exibição nunca é usado em condicionais espalhadas pela aplicação.
 */
const PACTO_DISABLED_SHARED_TABS = ['escolas', 'criterios', 'avaliacoes', 'resultados', 'ranking', 'graficos', 'relatorios'];
const CNCA_DISABLED_SHARED_TABS = ['escolas', 'criterios', 'avaliacoes', 'resultados', 'ranking', 'graficos', 'relatorios'];

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
  {
    code: 'CNCA-2026',
    year: 2026,
    disabledSharedTabs: CNCA_DISABLED_SHARED_TABS,
    OverviewComponent: CncaDashboard,
    adminTabs: [
      { key: 'cnca-escolas', label: 'Escolas Participantes', Component: CncaSchools },
      { key: 'cnca-resultados', label: 'Resultados por Escola', Component: CncaSchoolResults },
      { key: 'cnca-ranking', label: 'Ranking Oficial', Component: CncaRanking },
      { key: 'cnca-import', label: 'Importar Planilha Oficial', Component: CncaImport },
    ],
  },
  {
    code: 'CNCA',
    disabledSharedTabs: CNCA_DISABLED_SHARED_TABS,
    OverviewComponent: CncaDashboard,
    adminTabs: [
      { key: 'cnca-escolas', label: 'Escolas Participantes', Component: CncaSchools },
      { key: 'cnca-resultados', label: 'Resultados por Escola', Component: CncaSchoolResults },
      { key: 'cnca-ranking', label: 'Ranking Oficial', Component: CncaRanking },
      { key: 'cnca-import', label: 'Importar Planilha Oficial', Component: CncaImport },
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

  // Catálogo CNCA genérico
  if (normalizeCode(program.catalog?.code) === 'CNCA' || normalizeCode(program.code).startsWith('CNCA')) {
    return {
      catalogCode: 'CNCA',
      disabledSharedTabs: CNCA_DISABLED_SHARED_TABS,
      OverviewComponent: CncaDashboard,
      adminTabs: [
        { key: 'cnca-escolas', label: 'Escolas Participantes', Component: CncaSchools },
        { key: 'cnca-resultados', label: 'Resultados por Escola', Component: CncaSchoolResults },
        { key: 'cnca-ranking', label: 'Ranking Oficial', Component: CncaRanking },
        { key: 'cnca-import', label: 'Importar Planilha Oficial', Component: CncaImport },
      ],
    };
  }

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
