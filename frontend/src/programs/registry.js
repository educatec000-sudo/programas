/**
 * Registro dos ambientes específicos de programas.
 *
 * Um programa só deve ser adicionado aqui depois da análise de sua documentação
 * oficial. O código estável e o ciclo identificam a implementação; o nome de
 * exibição nunca deve ser usado em condicionais espalhadas pela aplicação.
 *
 * Contrato de uma implementação:
 * {
 *   code: 'CODIGO-ESTAVEL',
 *   year?: 2026,
 *   adminTabs: [
 *     { key: 'instrumento', label: 'Instrumento oficial', Component }
 *   ]
 * }
 */
const implementations = [];

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
