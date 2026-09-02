import PactoAdmin from './pacto/PactoAdmin.jsx';

/**
 * Registro dos ambientes específicos de programas.
 *
 * Um programa só deve ser adicionado aqui depois da análise de sua documentação
 * oficial. O código estável e o ciclo identificam a implementação; o nome de
 * exibição nunca é usado em condicionais espalhadas pela aplicação.
 */
const implementations = [
  {
    code: 'PACTO-ALFABETIZACAO-2026',
    year: 2026,
    disabledSharedTabs: ['criterios', 'avaliacoes', 'resultados', 'ranking', 'graficos', 'relatorios'],
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
  return implementations.find((item) => (
    normalizeCode(item.code) === code && (item.year == null || Number(item.year) === Number(program.year))
  )) || null;
}

export function supportsSharedFeature(program, feature) {
  return !getProgramImplementation(program)?.disabledSharedTabs?.includes(feature);
}
