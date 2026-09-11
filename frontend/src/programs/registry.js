import PactoAdmin from './pacto/PactoAdmin.jsx';
import PactoDashboard from './pacto/PactoDashboard.jsx';
import PactoSchoolResults from './pacto/PactoSchoolResults.jsx';
import PactoRanking from './pacto/PactoRanking.jsx';
import PactoAnalises from './pacto/PactoAnalises.jsx';
import PactoImport from './pacto/PactoImport.jsx';
import PactoRelatorios from './pacto/PactoRelatorios.jsx';
import CncaDashboard from './cnca/CncaDashboard.jsx';
import CncaSchools from './cnca/CncaSchools.jsx';
import CncaSchoolResults from './cnca/CncaSchoolResults.jsx';
import CncaRanking from './cnca/CncaRanking.jsx';
import CncaImport from './cnca/CncaImport.jsx';
import CncaAnalises from './cnca/CncaAnalises.jsx';
import CncaRelatorios from './cnca/CncaRelatorios.jsx';
import {
  ParcDashboard,
  ParcSchools,
  ParcSchoolResults,
  ParcRanking,
  ParcEvolution,
  ParcImport,
} from './parc/index.js';

/**
 * Registro dos ambientes específicos de programas.
 *
 * Um programa só deve ser adicionado aqui depois da análise de sua documentação
 * oficial. O código estável e o ciclo identificam a implementação; o nome de
 * exibição nunca é usado em condicionais espalhadas pela aplicação.
 */
const PACTO_DISABLED_SHARED_TABS = ['escolas', 'criterios', 'avaliacoes', 'resultados', 'ranking', 'graficos', 'relatorios', 'historico'];
const CNCA_DISABLED_SHARED_TABS = ['escolas', 'criterios', 'avaliacoes', 'resultados', 'ranking', 'graficos', 'relatorios', 'historico'];
const PARC_DISABLED_SHARED_TABS = ['escolas', 'criterios', 'avaliacoes', 'resultados', 'ranking', 'graficos', 'relatorios', 'historico'];

const PACTO_ADMIN_TABS = [
  { key: 'pacto-resultados', label: 'Resultados por Escola', Component: PactoSchoolResults },
  { key: 'pacto-ranking', label: 'Ranking', Component: PactoRanking },
  { key: 'pacto-analises', label: 'Análises', Component: PactoAnalises },
  { key: 'pacto-import', label: 'Importação', Component: PactoImport },
  { key: 'pacto-relatorios', label: 'Relatórios', Component: PactoRelatorios },
];

const implementations = [
  {
    code: 'PACTO-ALFABETIZACAO-2026',
    year: 2026,
    disabledSharedTabs: PACTO_DISABLED_SHARED_TABS,
    OverviewComponent: PactoDashboard,
    adminTabs: PACTO_ADMIN_TABS,
  },
  {
    code: 'PACTO-ALFABETIZACAO',
    disabledSharedTabs: PACTO_DISABLED_SHARED_TABS,
    OverviewComponent: PactoDashboard,
    adminTabs: PACTO_ADMIN_TABS,
  },
  {
    code: 'CNCA-2026',
    year: 2026,
    disabledSharedTabs: CNCA_DISABLED_SHARED_TABS,
    OverviewComponent: CncaDashboard,
    adminTabs: [
      { key: 'cnca-resultados', label: 'Resultados por Escola', Component: CncaSchoolResults },
      { key: 'cnca-ranking', label: 'Ranking', Component: CncaRanking },
      { key: 'cnca-analises', label: 'Análises', Component: CncaAnalises },
      { key: 'cnca-import', label: 'Importação', Component: CncaImport },
      { key: 'cnca-relatorios', label: 'Relatórios', Component: CncaRelatorios },
    ],
  },
  {
    code: 'CNCA',
    disabledSharedTabs: CNCA_DISABLED_SHARED_TABS,
    OverviewComponent: CncaDashboard,
    adminTabs: [
      { key: 'cnca-resultados', label: 'Resultados por Escola', Component: CncaSchoolResults },
      { key: 'cnca-ranking', label: 'Ranking', Component: CncaRanking },
      { key: 'cnca-analises', label: 'Análises', Component: CncaAnalises },
      { key: 'cnca-import', label: 'Importação', Component: CncaImport },
      { key: 'cnca-relatorios', label: 'Relatórios', Component: CncaRelatorios },
    ],
  },
  {
    code: 'PARC-2026',
    year: 2026,
    disabledSharedTabs: PARC_DISABLED_SHARED_TABS,
    OverviewComponent: ParcDashboard,
    adminTabs: [
      { key: 'parc-escolas', label: 'Escolas Participantes', Component: ParcSchools },
      { key: 'parc-resultados', label: 'Resultados por Escola', Component: ParcSchoolResults },
      { key: 'parc-ranking', label: 'Ranking Oficial', Component: ParcRanking },
      { key: 'parc-evolucao', label: 'Evolução (Entrada × Saída)', Component: ParcEvolution },
      { key: 'parc-import', label: 'Importar Planilha Oficial', Component: ParcImport },
    ],
  },
  {
    code: 'PARC',
    disabledSharedTabs: PARC_DISABLED_SHARED_TABS,
    OverviewComponent: ParcDashboard,
    adminTabs: [
      { key: 'parc-escolas', label: 'Escolas Participantes', Component: ParcSchools },
      { key: 'parc-resultados', label: 'Resultados por Escola', Component: ParcSchoolResults },
      { key: 'parc-ranking', label: 'Ranking Oficial', Component: ParcRanking },
      { key: 'parc-evolucao', label: 'Evolução (Entrada × Saída)', Component: ParcEvolution },
      { key: 'parc-import', label: 'Importar Planilha Oficial', Component: ParcImport },
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

  // Catálogo Pacto genérico
  if (normalizeCode(program.catalog?.code) === 'PACTO-ALFABETIZACAO' || normalizeCode(program.code).startsWith('PACTO')) {
    return {
      catalogCode: 'PACTO-ALFABETIZACAO',
      disabledSharedTabs: PACTO_DISABLED_SHARED_TABS,
      OverviewComponent: PactoDashboard,
      adminTabs: PACTO_ADMIN_TABS,
    };
  }

  // Catálogo CNCA genérico
  if (normalizeCode(program.catalog?.code) === 'CNCA' || normalizeCode(program.code).startsWith('CNCA')) {
    return {
      catalogCode: 'CNCA',
      disabledSharedTabs: CNCA_DISABLED_SHARED_TABS,
      OverviewComponent: CncaDashboard,
      adminTabs: [
        { key: 'cnca-resultados', label: 'Resultados por Escola', Component: CncaSchoolResults },
        { key: 'cnca-ranking', label: 'Ranking', Component: CncaRanking },
        { key: 'cnca-analises', label: 'Análises', Component: CncaAnalises },
        { key: 'cnca-import', label: 'Importação', Component: CncaImport },
        { key: 'cnca-relatorios', label: 'Relatórios', Component: CncaRelatorios },
      ],
    };
  }

  // Catálogo PARC genérico
  if (normalizeCode(program.catalog?.code) === 'PARC' || normalizeCode(program.code).startsWith('PARC')) {
    return {
      catalogCode: 'PARC',
      disabledSharedTabs: PARC_DISABLED_SHARED_TABS,
      OverviewComponent: ParcDashboard,
      adminTabs: [
        { key: 'parc-escolas', label: 'Escolas Participantes', Component: ParcSchools },
        { key: 'parc-resultados', label: 'Resultados por Escola', Component: ParcSchoolResults },
        { key: 'parc-ranking', label: 'Ranking Oficial', Component: ParcRanking },
        { key: 'parc-evolucao', label: 'Evolução (Entrada × Saída)', Component: ParcEvolution },
        { key: 'parc-import', label: 'Importar Planilha Oficial', Component: ParcImport },
      ],
    };
  }

  return null;
}

export function supportsSharedFeature(program, feature) {
  return !getProgramImplementation(program)?.disabledSharedTabs?.includes(feature);
}
