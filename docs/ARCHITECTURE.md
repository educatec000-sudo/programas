# CPE — Documento de Arquitetura

## 1. Análise do TI.OS (referência) → decisões para o CPE

O repositório `github.com/rafa-ss/TI.OS` foi analisado **como referência de padrões**
(orgulhosamente sem copiar código). Estrutura observada:

```
backend/src/{config, controllers, middlewares, models, routes, services, validations, utils}
frontend/src/{components, context, layouts, pages, routes, services}
```

| Padrão observado no TI.OS | Decisão no CPE |
|---|---|
| MVC Express com controllers/routes/services separados | **Mantido** — mesmas camadas, adicionando `modules/` para o motor de importação |
| `AppError` + error handler central + `asyncHandler` | **Mantido** (equivalente `HttpError` + `wrap`), com mapeamento de erros Prisma (P2002/P2025/P2003) e Zod |
| Autenticação JWT **Bearer em header**, token único, RBAC por **nomes fixos de role** (`authorize('admin')`) | **Substituído**: JWT curto + refresh token rotativo em **cookies httpOnly**, sessões persistidas (revogáveis) e RBAC por **permissões granulares em banco** (32 chaves, editáveis na UI) |
| Controle de tentativas de login **em memória** | **Melhorado**: contador e bloqueio no próprio usuário + tabela `LoginAttempt` (auditorável, sobrevive a restart) |
| Validação Zod por domínio | **Mantido** (`validations/*.validation.js`) |
| Middlewares: validate, upload (Multer), errorHandler | **Mantidos**, mais `authenticate`, `requirePermission`, `originCheck`, rate limit |
| Frontend: AuthContext + ProtectedRoute + layouts Sidebar/Navbar + serviços axios | **Mantido o desenho** com `fetch` nativo, renovação transparente de sessão e `PermissionGate` por permissão |
| Importação XLSX/CSV com upsert por INEP | **Ampliado**: pipeline com staging (ImportJob), prévia por linha, classificação NOVO/ATUALIZAR/DUPLICADO/ERRO, erros tabelados, confirmação explícita e histórico |
| Relatórios ExcelJS/PDFKit | **Mantido** o conceito com PDFKit + SheetJS + CSV pt-BR |
| MongoDB/Mongoose | **Substituído por PostgreSQL + Prisma** (exigência central do CPE) |

Regras respeitadas: banco próprio (regra 2), nenhuma conexão com o MongoDB do TI.OS
(regra 5), dados de escolas apenas por arquivo (regra 6), autenticação própria com
implementação e banco próprios (regra 7).

## 2. Modelo de dados (PostgreSQL)

```
User ─┬─< Session                (refresh token com hash, revogável)
      ├─< PasswordResetToken     (uso único, 24h)
      ├─< LoginAttempt           (sucesso/falha por e-mail+IP)
      └─< AuditLog               (ação, entidade, registro, IP, metadata JSON)

Role >─< Permission              (RBAC configurável; nível 100 = passe livre)

School ──< ProgramSchool >── Program
                              ├─< ProgramIndicator >── Indicator >── IndicatorCategory
                              ├─< Goal (escopo GERAL/PROGRAMA/ESCOLA/INDICADOR)
                              └─< Result ──(único por programa+escola+indicador+ano+período)

Program + School ──< Evaluation  (snapshot consolidado do ranking)

ImportJob ──< ImportError        (staging da importação)
Notification, Document           (apoio)
```

Destaques de banco:
- **Unique constraints**: `School.inep`, `Program.code`, `Indicator.code`,
  `Result(programId, schoolId, indicatorId, year, period)`,
  `Evaluation(programId, schoolId, year, period)`.
- **Índices** para buscas por nome/município/ano/período e auditoria.
- **Soft delete** (`deletedAt`) em School, Program, Indicator, Document.
- **Transações** em: login-flow updates, lote de resultados, confirmação de importação,
  troca/reset de senha, consolidação de avaliações e edição de perfis.

## 3. Autenticação e sessão

```
Login  → valida (bloqueio após N falhas) → cria Session (hash do refresh + 7 dias)
       → cookies httpOnly: cpe_at (JWT 15min) + cpe_rt (refresh opaco)
Request→ authenticate: verifica JWT + sessão não revogada no banco + usuário ativo
401 TOKEN_EXPIRED → frontend chama /auth/refresh (rotação do refresh, fila única)
                   → nova dupla de cookies e retry transparente
Logout → revoga a sessão (invalida imediatamente o access token também)
```

## 4. Motor de pontuação e ranking

1. Para cada resultado busca-se a **meta aplicável** por especificidade
   (indicador 8 pts > programa 4 > escola 2 > período 1).
2. Atingimento (%) com **polaridade** (`MENOR_MELHOR` invertido) e teto de 200%.
3. Pontuação da escola = média **ponderada pelos pesos** dos indicadores no programa.
4. Classificação A–E; evolução por comparação com o período anterior (pontos e posição).
5. `Evaluation` fotografa o ranking consolidado por programa/ano/período.

## 5. Pipeline de importação

```
upload → parser (SheetJS, chaves normalizadas sem acentos) → aliases de coluna
       → validateRow (por estratégia de entidade) → classify (NOVO/ATUALIZAR/DUPLICADO/ERRO)
       → ImportJob PENDENTE (staging JSON + ImportError) → PRÉVIA na UI
       → confirm → strategy.apply() em transação → IMPORTADO + notificação + auditoria
```

Limites: 5.000 linhas/arquivo, 10 MB; erros nunca gravados silenciosamente.

## 6. Frontend

- Rotas protegidas por sessão + permissão (`ProtectedRoute permission="..."`).
- Sidebar filtrada por permissão; ações (botões) condicionais via `can()`.
- `services/api.js`: fetch com credentials, **renovação automática** de sessão,
  erros normalizados e download de arquivos (relatórios/exportações).
- Charts (Recharts) 100% alimentados pelos endpoints `/analytics`, `/rankings`, `/dashboard`.

## 7. Escalabilidade

- Índices compostos nas chaves de consulta; paginação em todas as listas.
- Cálculo de ranking carrega apenas o escopo solicitado (programa/ano/indicador).
- Consolidação (`Evaluation`) permite histórico oficial sem recalcular o passado.
- Camadas isoladas (controller → service → prisma) prontas para filas/cache quando necessário.
