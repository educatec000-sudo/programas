/**
 * ============================================================
 * NORMALIZAÇÃO DE COORDENADAS — planilha LOCALIZAÇÃO ESCOLAS
 * ============================================================
 *
 * Padrão observado NA PRÓPRIA PLANILHA oficial (Abaetetuba/PA):
 * as colunas LATITUDE e LONGTUDE vêm como INTEIROS com decimais
 * implícitas — o separador decimal se perdeu na exportação:
 *
 *   LATITUDE  -165917    =>  -1.65917     (÷ 10⁵)
 *   LONGTUDE  -48832820  =>  -48.832820   (÷ 10⁶)
 *
 * Regra implementada (documentada e determinística):
 *
 *   1. Valor já na faixa geográfica válida e plausível => mantém como está
 *      (planilhas com decimais corretos, ex.: -1.65917 ou "-1,65917").
 *   2. Valor fora da faixa válida (|lat| > 90 ou |lng| > 180) =>
 *      inteiro com decimais implícitas: divide-se por potências de 10
 *      decrescentes (10⁷ → 10³) até o resultado cair na FAIXA PLAUSÍVEL
 *      da região Norte do Brasil / Pará:
 *          latitude : 0.2 ≤ |v| ≤ 10   (Abaetetuba ≈ -1.7)
 *          longitude: 10 ≤ |v| ≤ 90    (Abaetetuba ≈ -48.9)
 *   3. Nenhuma divisão produz valor plausível => retorna null
 *      (a linha é marcada como ERRO citando a coluna — nunca inventa
 *      coordenada e nunca interrompe a importação).
 *
 * Nunca descartamos uma coordenada por "não estar no formato tradicional":
 * ela é convertida; só é rejeitada se não houver interpretação segura.
 */

const LAT_MIN_ABS = 0.2; // abaixo disso (ex.: 0.0166) seria divisão exagerada
const LAT_MAX_ABS = 10; // Pará/Norte: latitudes entre ~0 e ~-8
const LNG_MIN_ABS = 10; // longitudes brasileiras: 34..74 (magnitude)
const LNG_MAX_ABS = 90;

const VALID = { latitude: 90, longitude: 180 };
const PLAUSIBLE = {
  latitude: (v) => Math.abs(v) >= LAT_MIN_ABS && Math.abs(v) <= LAT_MAX_ABS,
  longitude: (v) => Math.abs(v) >= LNG_MIN_ABS && Math.abs(v) <= LNG_MAX_ABS,
};

/**
 * Normaliza uma coordenada bruta (já numérica) para o eixo informado.
 * Retorna o número normalizado ou null quando não há interpretação segura.
 */
export function normalizeCoordinate(value, kind) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  const maxAbs = VALID[kind];
  if (!maxAbs) return null;

  // 1) já é um decimal válido e plausível => mantém
  if (Math.abs(v) <= maxAbs) return v;

  // 2) inteiro com decimais implícitas => divide até cair na faixa plausível
  for (let exp = 7; exp >= 3; exp--) {
    const candidate = v / 10 ** exp;
    if (Math.abs(candidate) <= maxAbs && PLAUSIBLE[kind](candidate)) {
      // preserva a precisão original (arredonda no nº de casas recuperadas)
      return Math.round(candidate * 10 ** exp) / 10 ** exp;
    }
  }

  // 3) sem interpretação segura
  return null;
}

/** Formata a coordenada para exibição/auditoria (padrão pt-BR). */
export function describeCoordinate(value, kind) {
  const norm = normalizeCoordinate(value, kind);
  if (norm === null) return `não interpretável (${value})`;
  return `${norm} (origem: ${value})`;
}
