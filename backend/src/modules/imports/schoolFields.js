/**
 * Catálogo de campos de escola para o Mapeamento de Colunas da importação.
 * A ordem define a exibição na UI; `aliases` alimenta a detecção automática
 * (chaves normalizadas: minúsculas, sem acentos/espaços/pontuação).
 */
export const SCHOOL_FIELD_GROUPS = [
  {
    group: 'Identificação',
    fields: [
      {
        key: 'name', label: 'Nome da escola', required: true,
        aliases: ['nome', 'nomedaescola', 'nomeescola', 'escola', 'escolas', 'noentidade', 'nomeunidade', 'unidadeescolar', 'descricaodaescola', 'escolanome'],
      },
      {
        key: 'inep', label: 'Código INEP', required: false,
        aliases: ['inep', 'codigoinep', 'codinep', 'codigodoinep', 'codigoin ep', 'coentidade', 'codigodaescola', 'codigoescola', 'cdescola', 'idescola', 'identificacao', 'codigo'],
      },
      {
        key: 'schoolType', label: 'Tipo de escola', required: false,
        aliases: ['tipo', 'tipodeescola', 'tipoescola', 'tipounidade', 'tipodeunidade', 'modalidade', 'etapa', 'categoriadaescola'],
      },
      {
        key: 'adminDependency', label: 'Dependência administrativa', required: false,
        aliases: ['dependencia', 'dependenciaadministrativa', 'admindependencia', 'tpdependencia', 'esfera', 'rede', 'esferadeadministracao'],
      },
      {
        key: 'situation', label: 'Situação / Status', required: false,
        aliases: ['situacao', 'status', 'situacaodaescola', 'situacaofuncionamento', 'tpsituacaofuncionamento', 'ativoinativo', 'estado'],
      },
    ],
  },
  {
    group: 'Endereço e localização',
    fields: [
      {
        key: 'address', label: 'Endereço (rua/avenida)', required: false,
        aliases: ['endereco', 'rua', 'logradouro', 'dsendereco', 'avenida', 'avenidarua', 'enderecodaescola'],
      },
      {
        key: 'addressNumber', label: 'Número', required: false,
        aliases: ['numero', 'num', 'n', 'numerodoendereco', 'endereconumero', 'nro'],
      },
      {
        key: 'addressComplement', label: 'Complemento', required: false,
        aliases: ['complemento', 'complementodoendereco', 'enderecocomplemento', 'comp'],
      },
      {
        key: 'district', label: 'Bairro', required: false,
        aliases: ['bairro', 'distrito', 'bairrodistrito'],
      },
      {
        key: 'cep', label: 'CEP', required: false,
        aliases: ['cep', 'codigopostal', 'nudecep'],
      },
      {
        key: 'municipality', label: 'Município', required: false,
        aliases: ['municipio', 'cidade', 'nomedomunicipio', 'nomemunicipio', 'municipiodeendereco'],
      },
      {
        key: 'uf', label: 'UF', required: false,
        aliases: ['uf', 'estado', 'sigla', 'sguf', 'unidadeFederativa'],
      },
      {
        key: 'zone', label: 'Zona (urbana/rural)', required: false,
        aliases: ['zona', 'localizacao', 'tplocalizacao', 'localizacaodaescola'],
      },
      {
        key: 'latitude', label: 'Latitude', required: false,
        aliases: ['latitude', 'lat', 'latitule', 'latitud', 'latitu'],
      },
      {
        key: 'longitude', label: 'Longitude', required: false,
        aliases: ['longitude', 'longtude', 'longitud', 'lng', 'long', 'longtitude', 'longtute', 'longitute'],
      },
    ],
  },
  {
    group: 'Contato e responsáveis',
    fields: [
      { key: 'phone', label: 'Telefone', required: false, aliases: ['telefone', 'nutelefone', 'dddtelefone', 'fone', 'contato', 'telefonedaescola'] },
      { key: 'email', label: 'E-mail', required: false, aliases: ['email', 'emaildaescola', 'emailescola', 'correo'] },
      { key: 'responsible', label: 'Responsável / Gestor', required: false, aliases: ['responsavel', 'diretor', 'diretorresponsavel', 'direcao', 'diretora', 'gestor', 'gestora', 'gestorageral', 'gertor', 'gertora', 'gerente', 'gestorescola'] },
    ],
  },
  {
    group: 'Outros',
    fields: [
      { key: 'notes', label: 'Observações', required: false, aliases: ['observacao', 'observacoes', 'obs', 'notas', 'informacoes', 'info'] },
    ],
  },
];

export const SCHOOL_FIELDS = SCHOOL_FIELD_GROUPS.flatMap((g) => g.fields);

export const SCHOOL_FIELD_KEYS = SCHOOL_FIELDS.map((f) => f.key);

/**
 * Detecção automática: normaliza o cabeçalho e casa com os aliases.
 * Retorna { mapping: {fieldKey: header}, unmapped: [headers], ambiguous }.
 */
export function autoMapColumns(headers) {
  const usedHeaders = new Set();
  const mapping = {};

  // 1ª passada: correspondência exata
  for (const field of SCHOOL_FIELDS) {
    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      if (field.aliases.includes(normalize(header))) {
        mapping[field.key] = header;
        usedHeaders.add(header);
        break;
      }
    }
  }
  // 2ª passada: cabeçalho contém um alias forte (ex.: "nome da escola municipal")
  for (const field of SCHOOL_FIELDS) {
    if (mapping[field.key]) continue;
    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      const n = normalize(header);
      if (field.aliases.some((a) => a.length >= 5 && n.includes(a))) {
        mapping[field.key] = header;
        usedHeaders.add(header);
        break;
      }
    }
  }

  const unmapped = headers.filter((h) => !usedHeaders.has(h));
  return { mapping, unmapped };
}

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
