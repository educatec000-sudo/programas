import { schoolsStrategy } from './schools.strategy.js';
import { programsStrategy } from './programs.strategy.js';
import { indicatorsStrategy } from './indicators.strategy.js';
import { resultsStrategy } from './results.strategy.js';

export const STRATEGIES = {
  ESCOLAS: schoolsStrategy,
  PROGRAMAS: programsStrategy,
  INDICADORES: indicatorsStrategy,
  RESULTADOS: resultsStrategy,
};

export function getStrategy(type) {
  return STRATEGIES[type] || null;
}
