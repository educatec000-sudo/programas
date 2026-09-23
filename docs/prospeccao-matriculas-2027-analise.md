# Prospecção de Matrículas 2027 — análise de arquitetura e proposta de implementação

## 1) Objetivo desta análise

Avaliar como implementar o módulo **dentro do CPE atual**, reaproveitando a arquitetura já existente, sem criar aplicação paralela, sem mock fixo e sem sobrescrever os dados históricos oficiais de 2026.

---

## 2) O que existe hoje no projeto e pode ser reaproveitado

### Backend já disponível
- **Prisma + PostgreSQL** como camada de dados.
- **RBAC** com `User`, `Role`, `Permission` e `requirePermission(...)`.
- **Escolas** em `School`, com INEP como principal chave externa útil para a importação.
- **Importações** com pipeline real de:
  - upload
  - leitura
  - pré-validação
  - staging em `ImportJob`
  - rastreio de erros em `ImportError`
  - confirmação posterior
- **Auditoria** em `AuditLog`.
- **Notificações** já integradas ao fluxo de importação.
- **Padrão de módulos específicos** já adotado em CNCA, PARC, SisPAE e Pacto.
- **Testes backend** já existentes em `backend/test` com `node:test`.

### Frontend já disponível
- **Rotas protegidas** centralizadas em `frontend/src/routes/index.jsx`.
- **Cliente de API** centralizado em `frontend/src/services/resources.js`.
- **Layout principal** já pronto com sidebar, topbar, hero/header, tabs, tabelas e modais.
- Componentes reutilizáveis úteis para este módulo:
  - `PageHeader`
  - `DataTable`
  - `Tabs`
  - `Modal`
  - `Alert`
  - `LoadingBlock`
  - `Button`, `Field`, `Select`, `Input`
- **Tema claro/escuro** já resolvido globalmente.

### Infraestrutura de importação que ajuda diretamente
O parser atual (`backend/src/modules/imports/parser.js`) já trata:
- CSV e XLSX
- CSV em **Windows-1252 / Excel**, que é compatível com o arquivo enviado
- normalização de cabeçalhos
- preservação de texto bruto

Isso é especialmente útil porque o CSV enviado é exatamente desse tipo.

---

## 3) O que o projeto ainda NÃO possui para este módulo

Hoje o banco **não possui** uma estrutura genérica para:
- histórico oficial de matrícula por escola/turma/etapa/ano
- regras de progressão
- limites de capacidade por etapa
- versões de projeção
- cenários/simulações
- planejamento individual por escola

Também **não é seguro** reutilizar as tabelas de resultados genéricos (`Result`) para isso, porque:
- `Result` representa desempenho/indicador, não matrícula histórica
- não modela turma, turno, etapa de origem e etapa de matrícula
- misturaria domínio avaliativo com domínio de planejamento de rede

Também **não é adequado** reutilizar `PactoClass` como base do módulo, porque ela é uma entidade específica do Pacto:
- depende de `programId`
- usa `grade` inteiro limitado ao contexto do programa
- carrega regras próprias de avaliação/coleta

---

## 4) Leitura técnica do CSV enviado

Arquivo analisado: `MATRICULAS POR TURMAS.CSV`

### Características confirmadas
- delimitador: `;`
- colunas principais:
  - `INEP ESCOLA`
  - `ESCOLA`
  - `ETAPA TURMA`
  - `TURMA`
  - `TURNO`
  - `ETAPA MATRICULA`
  - `Contagem total de ALUNOS`

### Pontos importantes do layout
1. Existem **linhas de continuação** em que INEP, escola, turma ou etapa da turma vêm em branco.
   - essas linhas precisam **herdar o último contexto válido**
   - isso inviabiliza usar a estratégia genérica atual sem adaptação

2. Há distinção entre:
   - **ETAPA TURMA** = organização da turma
   - **ETAPA MATRICULA** = etapa real do aluno

3. Isso é crítico para **multisseriadas/unificadas**:
   - uma turma pode atender alunos de várias etapas
   - a projeção precisa considerar a etapa real do aluno, não apenas o rótulo da turma

4. O exemplo de validação informado pelo usuário foi confirmado no arquivo:
   - Escola **E M E F ACENDENDO AS LUZES - 15145425**
   - 1º ano: **64**
   - 2º ano: **65**
   - 3º ano: **76**
   - 4º ano: **72**
   - 5º ano: **48**

Conclusão: o arquivo é viável para importação real, mas exige **normalização stateful** antes da gravação.

---

## 5) Componentes, rotas, tabelas e serviços que devem ser reutilizados

## Reuso de tabelas existentes
- `School`
  - chave principal de vínculo por INEP/escola
- `User`, `Role`, `Permission`
  - controle de acesso
- `ImportJob`, `ImportError`
  - staging, prévia, histórico de importação e erros por linha
- `AuditLog`
  - trilha de importação, configuração, simulação e aprovação
- `Notification`
  - avisos de importação concluída/falha/aprovação

## Reuso de rotas/padrões existentes
- Registro central em `backend/src/routes/index.js`
- Proteção com `authenticate` + `requirePermission(...)`
- Convenção de controllers/services/validations já usada no restante do projeto

## Reuso de serviços/backend
- `backend/src/modules/imports/parser.js`
  - leitura de CSV/XLSX e compatibilidade com Excel Windows-1252
- `backend/src/services/import.service.js`
  - base conceitual para preview + confirmação + auditoria
- `backend/src/lib/audit.js`
  - rastreabilidade
- exportadores já usados em relatórios

## Reuso de componentes/frontend
- `PageHeader`
- `DataTable`
- `Tabs`
- `Modal`
- `Alert`
- `LoadingBlock`
- `ProtectedRoute`
- padrão de consumo de API em `resources.js`

---

## 6) Melhor encaixe arquitetural no CPE

## Recomendação principal
Implementar como **módulo próprio de primeiro nível**, e não como subárea de um programa existente.

### Por quê
A prospecção de matrículas:
- atravessa a **rede inteira**, não apenas um programa
- depende de **ano-base e ano projetado**, não de `Program`
- precisa manter **histórico oficial imutável**
- exige **simulações independentes**, regras e configurações próprias

### Forma sugerida
- **Backend:** novo recurso top-level, por exemplo:
  - `/enrollment`
  - ou `/matriculas-projecao`
- **Frontend:** nova rota protegida, por exemplo:
  - `/prospeccao-matriculas`
- **Sidebar:** novo item de menu próprio

### O que eu não recomendo
- Colocar isso dentro de `/programas/:id/...`
- Reutilizar `Program` para representar cenário de matrícula
- Misturar projeção com `Result`, `Goal` ou tabelas avaliativas já existentes

---

## 7) Modelagem de dados proposta (segura e compatível)

A forma mais segura é separar em três blocos: **histórico oficial**, **configuração/regras** e **execução de projeções**.

## 7.1 Histórico oficial de matrícula

### `EnrollmentDataset`
Cabeçalho lógico de cada carga oficial.

Campos sugeridos:
- `id`
- `referenceYear` (ex.: 2026)
- `targetYear` opcional
- `status` (`RASCUNHO`, `OFICIAL`, `ARQUIVADO`)
- `sourceFileName`
- `sourceHash`
- `importJobId` opcional
- `notes`
- `importedById`
- `approvedById`
- `approvedAt`
- `createdAt`, `updatedAt`

Função:
- permitir múltiplas versões do histórico sem apagar a anterior
- travar qual conjunto é o **oficial** para o ano-base

### `EnrollmentRecord`
Grão principal da importação histórica.

Campos sugeridos:
- `id`
- `datasetId`
- `schoolId`
- `referenceYear`
- `inepSnapshot`
- `schoolNameSnapshot`
- `classStageRaw` (valor bruto de `ETAPA TURMA`)
- `classLabel` (valor de `TURMA`)
- `shift` (valor de `TURNO`)
- `enrollmentStageRaw` (valor bruto de `ETAPA MATRICULA`)
- `stageCode` normalizado
- `stageLabel` normalizado
- `studentsCount`
- `isMultiStage`
- `contextKey` (para amarrar linhas herdadas/continuação)
- `rawLine` (json com a origem)
- `createdAt`

Função:
- preservar o dado oficial exatamente como importado
- permitir reprocessamento futuro sem perder rastreabilidade

## 7.2 Catálogo de etapas e regras

### `EnrollmentStage`
Catálogo canônico de etapas.

Campos sugeridos:
- `id`
- `code` (ex.: `EI_MAT_I`, `EI_MAT_II`, `PRE_I`, `PRE_II`, `EF_1`, `EF_2`...)
- `label`
- `segment` (`INFANTIL`, `FUNDAMENTAL_ANOS_INICIAIS`, etc.)
- `orderIndex`
- `nextStageCode`
- `isEntryStage`
- `active`

Função:
- normalizar os vários nomes do CSV
- permitir progressão determinística e auditável

### `ProjectionRuleSet`
Conjunto versionado de regras da projeção.

Campos sugeridos:
- `id`
- `name`
- `baseYear`
- `projectedYear`
- `status` (`RASCUNHO`, `ATIVO`, `ARQUIVADO`)
- `defaultCapacityPerClass`
- `notes`
- `createdById`
- `approvedById`
- `approvedAt`
- `createdAt`, `updatedAt`

### `ProjectionRuleItem`
Regras por etapa.

Campos sugeridos:
- `id`
- `ruleSetId`
- `stageCode`
- `nextStageCode`
- `promotionRate`
- `repetitionRate`
- `dropoutRate`
- `entryRate`
- `capacityLimit`
- `roundingMode`
- `active`

### `SchoolProjectionSetting`
Exceções por escola.

Campos sugeridos:
- `id`
- `schoolId`
- `projectedYear`
- `firstOfferedStageCode`
- `maxClassesOverride` opcional
- `capacityOverrideJson` opcional
- `notes`
- `updatedById`
- `updatedAt`

Função:
- registrar escolas que **não começam na etapa inicial padrão**
- ajustar limites específicos

## 7.3 Execução e resultados da projeção

### `ProjectionRun`
Cabeçalho de cada cálculo executado.

Campos sugeridos:
- `id`
- `datasetId`
- `ruleSetId`
- `baseYear`
- `projectedYear`
- `mode` (`OFICIAL`, `SIMULACAO`)
- `status` (`PROCESSANDO`, `CONCLUIDO`, `APROVADO`, `CANCELADO`)
- `summaryJson`
- `createdById`
- `approvedById`
- `approvedAt`
- `createdAt`, `updatedAt`

### `ProjectionResult`
Resultado por escola + etapa.

Campos sugeridos:
- `id`
- `runId`
- `schoolId`
- `stageCode`
- `currentStudents`
- `projectedStudents`
- `currentClasses`
- `projectedClasses`
- `capacityLimit`
- `occupancyRate`
- `manualAdjustment`
- `reasonJson`
- `createdAt`

Função:
- persistir o resultado calculado
- sustentar dashboard, lista, planejamento individual e relatórios

---

## 8) Permissões e segurança

## Situação atual
O projeto já tem RBAC consolidado, mas ainda não há permissões específicas para este domínio.

## Recomendação
Adicionar permissões próprias, por exemplo:
- `enrollment:read`
- `enrollment:write`
- `enrollment:import`
- `enrollment:approve`
- `enrollment:simulate`
- `enrollment:report`

### Motivo
Reaproveitar apenas `schools:read`, `imports:write` e `reports:read` funciona parcialmente, mas mistura contextos demais. Para auditoria e governança, o módulo merece controle próprio.

---

## 9) Fluxo de importação recomendado

## Etapa 1 — preview
- upload do CSV/XLSX
- leitura pelo parser existente
- normalização de cabeçalhos
- herança de contexto nas linhas vazias
- normalização de etapa/turma/turno
- cruzamento por INEP com `School`
- agrupamentos e validações
- gravação do preview em `ImportJob`

## Etapa 2 — confirmação
- criação de `EnrollmentDataset`
- persistência dos `EnrollmentRecord`
- auditoria
- notificação

## Regras importantes
- **nunca sobrescrever 2026 diretamente**
- cada importação confirmada vira um dataset/versionamento próprio
- uma nova carga oficial substitui o “dataset oficial ativo” por referência lógica, não por destruição física dos registros anteriores

---

## 10) Serviço de projeção recomendado

Criar um serviço dedicado, separado da importação.

### Exemplo de responsabilidades do serviço
- consolidar matrícula histórica por escola/etapa
- aplicar regras de progressão entre etapas
- aplicar taxa de entrada nas etapas iniciais
- respeitar escolas que não ofertam a etapa inicial padrão
- calcular necessidade de turmas por capacidade definida
- gerar resultado oficial ou cenário simulado
- manter memória auditável do cálculo (`reasonJson`)

### Regra de segurança
O serviço de projeção **não altera o histórico oficial importado**; ele apenas lê datasets oficiais e produz `ProjectionRun` + `ProjectionResult`.

---

## 11) Estrutura de rotas sugerida

## Backend
Sugestão de endpoints:
- `GET /enrollment/overview`
- `GET /enrollment/datasets`
- `POST /enrollment/import/preview`
- `POST /enrollment/import/confirm`
- `GET /enrollment/settings`
- `PUT /enrollment/settings`
- `POST /enrollment/projections/run`
- `GET /enrollment/projections/:id`
- `GET /enrollment/schools`
- `GET /enrollment/schools/:schoolId`
- `POST /enrollment/simulations`
- `GET /enrollment/reports/...`

## Frontend
Sugestão de rota principal:
- `/prospeccao-matriculas`

Com abas internas:
- Dashboard
- Escolas
- Planejamento Individual
- Simulador
- Configurações
- Relatórios
- Importação/Histórico

---

## 12) Estrutura de arquivos sugerida

## Backend
- `backend/src/routes/enrollment.routes.js`
- `backend/src/controllers/enrollment.controller.js`
- `backend/src/services/enrollment-import.service.js`
- `backend/src/services/enrollment-projection.service.js`
- `backend/src/services/enrollment-dashboard.service.js`
- `backend/src/services/enrollment-report.service.js`
- `backend/src/validations/enrollment.validation.js`
- `backend/src/modules/enrollment/normalize.js`
- `backend/src/modules/enrollment/stages.js`

## Frontend
- `frontend/src/pages/EnrollmentProspection.jsx`
- `frontend/src/services/resources.js` (novo `enrollmentApi`)
- componentes locais do módulo em:
  - `frontend/src/modules/enrollment/...`
  - ou `frontend/src/pages/enrollment/...`

---

## 13) Implementação faseada mais segura

## Fase 1 — base de dados + configurações
Entregáveis:
- migration Prisma
- novas permissões
- catálogos de etapa
- CRUD/configuração inicial de regras

## Fase 2 — importação oficial de matrículas
Entregáveis:
- preview real
- parser com herança de contexto
- persistência em dataset + records
- histórico de importação

## Fase 3 — motor de projeção
Entregáveis:
- cálculo 2026 → 2027
- regras por etapa
- limites por turma
- geração de `ProjectionRun` e `ProjectionResult`

## Fase 4 — dashboard e lista de escolas
Entregáveis:
- KPIs gerais
- totais por etapa
- escolas com maior crescimento/redução
- lista pesquisável/filtrável

## Fase 5 — planejamento individual + simulador
Entregáveis:
- tela da escola
- projeção por etapa
- turmas atuais vs projetadas
- ajustes manuais simulados
- comparação cenário oficial x simulado

## Fase 6 — relatórios
Entregáveis:
- exportações CSV/XLSX/PDF
- resumo por rede
- planejamento por escola
- consolidados por etapa

## Fase 7 — testes e ajustes finais
Entregáveis:
- testes unitários do parser
- testes do motor de projeção
- testes de regressão do CSV real
- validação de não sobrescrita do histórico

---

## 14) Decisões de implementação que considero mais corretas

1. **Criar módulo top-level próprio** em vez de encaixar em `Program`.
2. **Versionar o histórico oficial** por dataset, sem apagar registros anteriores.
3. **Persistir projeções separadamente** do histórico de matrícula.
4. **Ter regras versionadas**, não soltas em JSON sem controle.
5. **Usar o pipeline de importação existente como base**, mas com parser/normalizador específico.
6. **Usar INEP + `School` como vínculo principal**.
7. **Não reutilizar `Result` nem `PactoClass` como base de dados do módulo**.
8. **Adicionar permissões específicas** para o novo domínio.

---

## 15) Conclusão objetiva

A arquitetura atual do CPE **suporta bem** a implementação do módulo, desde que ele seja construído como um **novo domínio integrado**, reaproveitando autenticação, escolas, importações, auditoria, componentes de UI e padrão de rotas já existentes.

A abordagem mais segura e compatível é:
- manter o módulo **dentro do projeto atual**
- criar **novas tabelas próprias para matrícula/projeção**
- reaproveitar o pipeline existente de importação/auditoria
- expor uma **nova rota/módulo top-level** no frontend e backend
- implementar em fases, começando por **dados/configuração**, depois **importação**, depois **motor de projeção**

---

## 16) Próximo passo recomendado

Se aprovado, o próximo passo mais seguro é iniciar a **Fase 1**:
1. desenhar a migration Prisma do módulo
2. adicionar permissões
3. criar o esqueleto backend/frontend da nova rota
4. preparar o catálogo normalizado de etapas e regras base da projeção 2026 → 2027
