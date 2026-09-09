function cleanLeafLabel(label) {
  const parts = String(label || '').split(' · ');
  return parts[parts.length - 1].trim();
}

function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function isColumnCompatibleWithField(fieldKey, column) {
  const full = String(column.label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const leaf = cleanLeafLabel(column.label).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const samples = column.samples || [];

  switch (fieldKey) {
    case 'grade':
      if (leaf === 'ano' || leaf.includes('ano escolar') || leaf.includes('serie') || leaf.includes('etapa') || leaf.includes('grau')) {
        if ((leaf.includes('matriculad') || leaf.includes('avaliad') || leaf.includes('quantidade') || leaf.includes('%')) && !leaf.includes('ano')) {
          return false;
        }
        return true;
      }
      return samples.some((s) => /^(0|1|2|pii|pre\s*ii|pré\s*ii|1º|2º|1º\s*ano|2º\s*ano|1\s*ano|2\s*ano)$/i.test(String(s).trim()));

    case 'className':
      if (leaf === 'turma' || leaf.includes('turma') || leaf.includes('classe') || leaf.includes('sala') || leaf.includes('agrupamento')) {
        if (leaf.includes('matriculad') || leaf.includes('avaliad') || leaf.includes('%') || leaf.includes('habilidade')) {
          return false;
        }
        return true;
      }
      return false;

    case 'assessment':
      if (
        leaf.includes('avaliacao') || leaf.includes('etapa') || leaf.includes('teste')
        || leaf.includes('aplicac') || leaf.includes('instrumento') || leaf.includes('nº avaliacao')
      ) {
        if (leaf.includes('matriculad') || leaf.includes('avaliad') || leaf.includes('turma') || leaf.includes('turno') || leaf.includes('desenvolv')) {
          return false;
        }
        return true;
      }
      return samples.some((s) => /^(a0|a1|a2|a3|diagnostica|inicial|final)$/i.test(String(s).trim()));

    case 'shift':
      if (leaf === 'turno' || leaf.includes('turno') || leaf.includes('horario') || leaf.includes('periodo')) {
        return true;
      }
      return samples.some((s) => /^(m|t|n|i|manha|tarde|noite|integral|matutino|vespertino)$/i.test(String(s).trim()));

    case 'enrolled':
      if (
        leaf.includes('matriculad') || leaf.includes('matricula') || leaf.includes('inscrito')
        || (leaf.includes('nº de alunos') && !leaf.includes('avaliad') && !leaf.includes('desenvolv') && !leaf.includes('%'))
      ) {
        if (leaf.includes('avaliad') || leaf.includes('%') || leaf.includes('por desenvolver') || leaf.includes('desenvolvido')) {
          return false;
        }
        return true;
      }
      return false;

    case 'evaluated':
      if (leaf.includes('avaliad') || leaf.includes('presente') || leaf.includes('participante') || leaf.includes('efetivado')) {
        if (leaf.includes('matriculad') || leaf.includes('%') || leaf.includes('por desenvolver') || leaf.includes('desenvolvido')) {
          return false;
        }
        return true;
      }
      return false;

    case 'component':
      if (leaf.includes('componente') || leaf.includes('disciplina') || leaf.includes('area') || leaf.includes('materia')) {
        return true;
      }
      return samples.some((s) => /^(lingua portuguesa|portugues|lp|matematica|mat|educacao infantil|inicial|habilidades iniciais)$/i.test(String(s).trim()));

    case 'skill':
      if (leaf.includes('habilidade') || leaf.includes('indicador') || leaf.includes('eixo') || leaf.includes('descritor') || leaf.includes('conteudo')) {
        if (leaf.includes('matriculad') || leaf.includes('avaliad') || leaf.includes('%') || leaf.includes('turma') || leaf.includes('turno') || leaf === 'ano') {
          return false;
        }
        return true;
      }
      return false;

    case 'level':
      if (leaf.includes('nivel') || leaf.includes('proficiencia') || leaf.includes('classificac') || leaf.includes('perfil') || leaf.includes('desempenho') || leaf.includes('conceito')) {
        if (leaf.includes('matriculad') || leaf.includes('avaliad') || leaf.includes('turma') || leaf.includes('turno') || leaf === 'ano') {
          return false;
        }
        return true;
      }
      return false;

    case 'count':
      if (
        leaf.includes('quantidad') || leaf.includes('qtd') || leaf.includes('qtde') || leaf.includes('contagem')
        || (leaf.includes('numero') && !leaf.includes('matriculad') && !leaf.includes('avaliad') && !leaf.includes('%'))
      ) {
        if (leaf.includes('%') || leaf.includes('percentual')) return false;
        return true;
      }
      return false;

    case 'percentage':
      if (leaf.includes('percent') || leaf.includes('porcent') || leaf.includes('%') || leaf.includes('taxa') || leaf.includes('proporcao')) {
        return true;
      }
      return samples.some((s) => String(s).includes('%'));

    default:
      return true;
  }
}

export function getCompatibleColumnsForField(fieldKey, availableColumns, currentValue = '') {
  const compatible = availableColumns.filter((c) => isColumnCompatibleWithField(fieldKey, c));
  // Se o valor atualmente selecionado não estiver na lista de compatíveis, inclui para não quebrar seleção manual
  if (currentValue && !compatible.some((c) => c.key === currentValue)) {
    const currentObj = availableColumns.find((c) => c.key === currentValue);
    if (currentObj) compatible.push(currentObj);
  }
  return compatible.length > 0 ? compatible : availableColumns;
}

export function getCompatibleResultColumns(resultField, availableColumns, isPercentage = false, currentValue = '') {
  const skillKey = normalizeKey(resultField.skillLabel);
  const levelKey = normalizeKey(resultField.levelLabel);

  const compatible = availableColumns.filter((column) => {
    const label = String(column.label || '');
    const leaf = cleanLeafLabel(label).toLowerCase();
    const fullKey = normalizeKey(label);

    const isPerc = leaf.includes('%') || leaf.includes('percentual') || leaf.includes('porcentagem') || leaf.includes('taxa');
    if (isPercentage !== isPerc) return false;

    const skillStem = skillKey.slice(0, 6);
    const levelStem = levelKey.slice(0, 5);

    const matchSkill = fullKey.includes(skillKey) || (skillStem && fullKey.includes(skillStem));
    const matchLevel = fullKey.includes(levelKey) || (levelStem && fullKey.includes(levelStem));

    if (isPercentage) {
      return matchSkill || matchLevel;
    }
    return matchSkill && matchLevel;
  });

  if (currentValue && !compatible.some((c) => c.key === currentValue)) {
    const currentObj = availableColumns.find((c) => c.key === currentValue);
    if (currentObj) compatible.push(currentObj);
  }

  return compatible.length > 0 ? compatible : availableColumns;
}

export function filterMappingFieldsByMode(fields, mode) {
  if (mode === 'wide') {
    return fields.filter((f) => !f.modes || f.modes.includes('wide'));
  }
  return fields.filter((f) => !f.modes || f.modes.includes('long'));
}
