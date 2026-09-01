# Pacto pela Alfabetização 2026 — análise do instrumento

## Identificação confirmada

O programa informado pelo responsável é **Pacto pela Alfabetização 2026**.

O primeiro arquivo recebido foi:

`E M E I E F SANTA ANASTACIA 15066665_ABAETETUBA_PACTO PELA ALFABETIZAÇÃO-2026.htm`

A identificação da escola contida no nome do arquivo é E.M.E.I.E.F. Santa Anastácia, INEP 15066665, Abaetetuba.

## Conteúdo disponível no arquivo

O arquivo é somente o índice/frameset gerado pelo recurso “Salvar como página da Web” do Microsoft Excel. Ele não contém as tabelas das planilhas. O índice informa a existência de seis folhas:

1. `A0 PT 1ANO`
2. `A1-A3 PT 1ANO`
3. `A1-A3 MAT 1ANO`
4. `A0 PT 2ANO`
5. `A1-A3 PT 2ANO`
6. `A1-A3 MAT 2ANO`

As folhas são referenciadas como arquivos externos `sheet001.htm` até `sheet006.htm`, acompanhados de `stylesheet.css`, `filelist.xml` e outros recursos. Esses arquivos não vieram no anexo.

Os caminhos internos ainda usam um nome legado contendo `PARC-2026`. Isso é apenas metadado do arquivo exportado e não altera a identificação confirmada do programa como Pacto pela Alfabetização 2026.

## Evidência complementar — imagem da folha A0 do 1º ano

A imagem recebida posteriormente mostra o cabeçalho **“Resultado das avaliações por turma de 1º ano (A0)”**. Portanto, esta parte do instrumento é agregada por turma, e não apenas por escola.

### Identificação da linha

Foram identificadas as seguintes colunas iniciais:

1. Ano;
2. Turno;
3. Turma;
4. Nº da avaliação;
5. Nº de alunos matriculados;
6. Nº de alunos avaliados.

A imagem apresenta como exemplo duas linhas do 1º ano, com turnos `M` e `T`, turmas `A` e `B` e avaliação `A0`. O significado formal das siglas de turno ainda deve ser confirmado na documentação.

### Habilidades apresentadas

Foram identificados sete blocos de habilidade:

1. Coordenação motora;
2. Consciência fonológica — Aliteração;
3. Consciência fonológica — Sílabas;
4. Consciência fonológica — Rimas;
5. Princípio alfabético;
6. Compreensão oral;
7. Oralidade.

Cada bloco possui três quantidades de alunos, usando os níveis exibidos na planilha:

- por desenvolver;
- em desenvolvimento;
- desenvolvidos.

Assim, a folha mostrada contém seis campos de identificação/participação e 21 campos quantitativos de proficiência, totalizando 27 colunas visíveis.

### Consequência arquitetural confirmada

O modelo atual `Result`, agregado somente por programa e escola, não representa integralmente esta folha porque não possui a dimensão **turma**. A estrutura definitiva só deve ser escolhida após receber as demais folhas, para verificar se turma, ano, componente e código da avaliação se repetem em todo o instrumento.

Ainda não foi confirmada nenhuma regra de soma. É necessário verificar na documentação, por exemplo, se a soma dos três níveis de cada habilidade deve ser igual ao número de alunos avaliados e como são tratadas ausências ou respostas incompletas.

## Limitação da análise atual

Mesmo com o cabeçalho da folha A0, ainda não é possível identificar com segurança:

- estrutura das outras cinco folhas;
- obrigatoriedades e listas de opções;
- fórmulas;
- regras de pontuação ou classificação;
- validações e exceções entre os campos;
- evidências ou anexos;
- fluxo de conferência e envio.

Nenhuma dessas regras deve ser inferida apenas pelos nomes das folhas ou por uma imagem isolada.

## Arquivo necessário para continuar

Preferencialmente, enviar o arquivo original em `.xlsx` ou `.xls`.

Como alternativa, compactar em `.zip` o arquivo `.htm` junto com a pasta criada pelo Excel, normalmente com nome terminado em `_arquivos`, contendo ao menos `sheet001.htm` a `sheet006.htm`.

Após o recebimento completo serão produzidos:

1. inventário de folhas, campos e tipos;
2. mapa das fórmulas e dependências;
3. proposta das etapas do formulário;
4. definição de status de coleta e reabertura;
5. desenho do link seguro por programa e escola;
6. avaliação das estruturas centrais que podem ser reaproveitadas;
7. proposta de schema/migration, sem aplicação em produção antes da aprovação;
8. plano de implementação e testes do módulo específico.
