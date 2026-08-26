# CPE — Controle de Programas Educacionais

Aplicação web completa e **independente** para controle de programas educacionais: escolas,
programas, indicadores, resultados, metas, rankings, análises, gráficos, relatórios e
importações — com autenticação própria, RBAC e auditoria.

| Camada | Tecnologias |
|---|---|
| Frontend | React 18 + Vite, React Router, Recharts, Context API, design system CSS próprio |
| Backend | Node.js 20, Express, Zod, Helmet, JWT + cookies httpOnly, rate limit |
| Banco | **PostgreSQL + Prisma ORM** (migrations, seed, índices, constraints, transações) |
| Exportação | PDF (PDFKit) · XLSX (SheetJS) · CSV |
| Importação | CSV/XLSX com validação, prévia e confirmação (staging) |

> O CPE é totalmente independente: banco, autenticação, usuários e sessões próprios.
> Nenhum vínculo em tempo real com outros sistemas. Dados de escolas entram por
> **importação de arquivo** (CSV/XLSX) usando o código INEP como identificador único.

---

## Estrutura

```
cpe/
├── frontend/                  # React + Vite
│   └── src/
│       ├── components/        # UI, DataTable, gráficos, ProtectedRoute
│       ├── layouts/           # AppLayout, Sidebar, Topbar
│       ├── pages/             # Dashboard, Escolas, Programas, ... (19 páginas)
│       ├── routes/            # árvore de rotas protegidas
│       ├── services/          # cliente HTTP + recursos REST
│       ├── hooks/             # useApi, useDebounce
│       ├── contexts/          # AuthContext, ToastContext
│       └── utils/             # formatadores e rótulos pt-BR
│
├── backend/                   # Express (ESM)
│   ├── prisma/
│   │   ├── schema.prisma      # 20 modelos, enums, índices, constraints
│   │   ├── migrations/        # migrations versionadas
│   │   └── seed/              # permissões, perfis, usuários + dados demo
│   └── src/
│       ├── config/            # env centralizado
│       ├── controllers/       # camada HTTP
│       ├── routes/            # rotas REST + guards de permissão
│       ├── services/          # regras de negócio (auth, scoring, import...)
│       ├── middlewares/       # authenticate, requirePermission, validate, upload
│       ├── validations/       # schemas Zod por domínio
│       ├── modules/imports/   # estratégias de importação por entidade
│       └── utils→lib/         # prisma, errors, audit, auth, exporters
│
├── docs/ARCHITECTURE.md       # decisões de arquitetura (referência TI.OS)
└── docker-compose.yml         # PostgreSQL 17 local
```

## Cadeia principal de dados

```
Escola → Programa → Indicador → Resultado → Meta → Pontuação → Ranking → Avaliação
```

- **Pontuação**: percentual de atingimento da meta por indicador
  (`MAIOR_MELHOR`: valor/meta; `MENOR_MELHOR`: meta/valor), teto de 200%,
  média ponderada pelo **peso** do indicador no programa.
- **Classificação**: A ≥ 100% · B ≥ 80% · C ≥ 60% · D ≥ 40% · E < 40%.
- **Resolução de meta**: a meta mais específica vence
  (indicador+escola+programa > indicador+programa > indicador > programa > geral).

## Como rodar

### 1. Banco (Docker)

```bash
docker compose up -d          # PostgreSQL 17 em localhost:5432 (usuário cpe/cpe, banco cpe)
```

Sem Docker: ajuste `DATABASE_URL` em `backend/.env` para o seu PostgreSQL.

### 2. Backend

```bash
cd backend
cp .env.example .env          # ajuste segredos em produção!
npm install
npx prisma migrate deploy     # aplica migrations
npm run prisma:seed           # permissões + perfis + usuários + dados de demonstração
npm run dev                   # http://localhost:4000/api
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxy /api -> :4000)
```

### Credenciais iniciais (seed)

| Perfil | E-mail | Senha | Acesso |
|---|---|---|---|
| Administrador | `admin@cpe.local` | `Admin@123` | Total |
| Coordenador | `coordenador@cpe.local` | `Coord@123` | Gerencia programas, indicadores, metas, resultados, técnicos |
| Técnico | `tecnico@cpe.local` | `Tec@123` | Lança/importa resultados, relatórios, consulta técnicos |
| Consulta | `consulta@cpe.local` | `Ver@123` | Somente leitura |
| Técnicos (demo) | `joao.silva@tec.cpe.local` (+maria/pedro/ana/carlos) | `Tec@1234` | Perfil Técnico — vinculáveis a escolas |

> Troque todas as senhas antes de uso real (Perfil → Alterar senha, ou redefinição pelo admin).

## Técnicos por Escola

- Relação **N:N** `School ↔ SchoolTechnician ↔ User` com `UNIQUE(schoolId, technicianId)`.
- Técnico = usuário existente cujo perfil está marcado como **"pode ser técnico"**
  (Perfis → editar perfil → flag `canBeTechnician`). Sem segunda tabela de usuários.
- Página com visões **Geral / Escola / Técnico**, filtros (busca, município, situação,
  somente escolas sem técnico, técnicos sem escola), indicadores reais, exportação
  CSV/XLSX/PDF e vínculos auditados.
- API: `/api/tecnicos-escola` (+ `/escola/:id`, `/tecnico/:id`, `/stats`, `/export`).

## Localização das escolas (planilha LOCALIZAÇÃO ESCOLAS.xlsx)

A importação de Escolas reconhece as colunas `INEP, ESCOLA, ENDEREÇO, ZONA, LATITUDE,
LONGTUDE` — o typo **LONGTUDE** é reconhecido automaticamente — e grava latitude e
longitude com precisão decimal no PostgreSQL. A coluna Município é opcional: planilhas
sem ela aplicam `DEFAULT_MUNICIPALITY` (env do backend, padrão `Benevides`) apenas na
criação; atualizações nunca sobrescrevem campos ausentes no arquivo.

## Importação de escolas (fluxo TI.OS → CPE)

```
TI.OS (MongoDB) → exportação CSV/XLSX → CPE → Importações → Escolas → PostgreSQL
```

1. **Importações → Escolas → Modelo** para baixar o gabarito.
2. A importação aceita tanto o gabarito CPE quanto colunas do **Censo Escolar INEP**
   (`CO_ENTIDADE`, `NO_ENTIDADE`, `NO_MUNICIPIO`, `TP_DEPENDENCIA`, `TP_LOCALIZACAO`...).
3. Pipeline: **Arquivo → Leitura → Validação → Prévia → Confirmação**.
   Cada linha é classificada como `Novo`, `Atualizar`, `Duplicado` ou `Erro` (com o motivo).
   O INEP é a chave: existente atualiza, inexistente cria. Nada é gravado sem confirmação.
4. O mesmo fluxo vale para Programas, Indicadores e Resultados.

## Segurança

- Login com **bloqueio automático** (5 tentativas → 15 min) e registro de tentativas.
- **JWT curto (15 min)** em cookie httpOnly + **refresh token opaco** com rotação e
  hash SHA-256 no banco (tabela `Session`) — revogação imediata de sessões.
- RBAC com **32 permissões granulares** configuráveis por perfil (tela Perfis).
- Recuperação de senha por token de uso único (24 h, hash no banco);
  em `NODE_ENV=development` o link é retornado na resposta (`EXPOSE_RESET_URL`).
- Auditoria de login/logout, CRUD, importações, exportações, relatórios, senhas e avaliações.
- Rate limit nas rotas de autenticação; Helmet; validação Zod em todas as entradas.
- Soft delete em Escolas, Programas, Indicadores e Documentos (histórico preservado).

## Scripts úteis

| Comando (backend) | Ação |
|---|---|
| `npm run dev` | API com auto-reload |
| `npm run prisma:migrate` | cria/aplica migration |
| `npm run prisma:seed` | re-executa o seed |
| `npm run db:reset` | zera o banco e re-semeia |
| `npm run prisma:studio` | Prisma Studio (inspecionar dados) |

## Variáveis de ambiente (backend/.env)

Veja `.env.example`. Em produção: gere `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` fortes,
defina `NODE_ENV=production`, `EXPOSE_RESET_URL=false` e configure o envio de e-mail
para a recuperação de senha.
