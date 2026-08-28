# CPE — Controle de Programas Educacionais

Aplicação web para gerir escolas, programas educacionais, indicadores, metas, resultados, avaliações, técnicos, documentos, importações, rankings e relatórios.

- **API:** Node.js, Express, Prisma e PostgreSQL
- **Interface:** React, React Router, Vite e Recharts
- **Autenticação:** cookies `httpOnly`, access/refresh token, permissões por perfil e troca obrigatória de senha temporária
- **Importações:** CSV, XLS e XLSX, com pré-visualização, mapeamento de colunas e processamento por linha

## Arquitetura de produção

```text
Usuário
  ↓ HTTPS
Vercel — frontend React + Vite (frontend/)
  ↓ HTTPS + credentials: include
Render — backend Express + Prisma (backend/)
  ↓ DATABASE_URL
Supabase PostgreSQL existente
```

A Vercel hospeda somente a interface. O Render hospeda somente a API. O banco permanece no Supabase; nenhum banco adicional é criado.

## Módulo Estatística

O menu **Estatística** organiza Dashboard, Programas, Escolas, Avaliações, Resultados, Rankings, Relatórios e Importação de dados. Programas específicos, inclusive Alfabetiza Pará ou SisPAE quando cadastrados pelo usuário, são registros comuns de `Program`; não existem telas ou regras condicionais pelo nome do programa.

A estrutura existente foi reaproveitada:

- `Program` identifica o programa, órgão, ano/período e status;
- `ProgramSchool` vincula uma mesma escola a diferentes programas;
- `Indicator` mantém o catálogo tecnológico de critérios;
- `ProgramIndicator` configura critério, meta e peso dentro de cada programa, sem propagação automática;
- `Result` separa cada resultado por programa, escola, critério, ano e período;
- `Evaluation` armazena consolidações por programa e escola;
- rankings, gráficos e relatórios avaliativos exigem um programa e não produzem nota geral misturando programas.

Nesta etapa, conforme a definição funcional escolhida, os resultados permanecem agregados por escola, sem dimensão de turma. A pontuação genérica usa somente meta, peso e polaridade configurados no programa; não presume metodologia oficial pelo nome do programa.

## Requisitos

Para trabalhar diretamente no VS Code:

- Git
- Node.js **20.19 ou superior** (ou 22.12+)
- npm 10+
- PostgreSQL 17 (ou Docker com Compose)

Confira o ambiente:

```bash
node --version
npm --version
```

## Estrutura

```text
programas/
├── backend/
│   ├── prisma/
│   │   ├── migrations/       # histórico versionado do PostgreSQL
│   │   ├── schema.prisma     # modelo de dados
│   │   └── seed/             # permissões, perfis e dados opcionais
│   ├── src/                  # API Express
│   ├── test/                 # testes automatizados do núcleo
│   ├── .env.example
│   └── prisma.config.js
├── frontend/
│   ├── src/                  # aplicação React
│   ├── .env.example
│   └── vercel.json           # SPA frontend-only na Vercel
├── render.yaml               # Web Service do backend no Render
├── vercel.json               # fallback frontend-only (não executa o backend)
└── docker-compose.yml        # PostgreSQL local opcional
```

## Instalação local

### 1. Clonar e instalar

```bash
git clone https://github.com/educatec000-sudo/programas.git
cd programas

cd backend
npm ci

cd ../frontend
npm ci
```

Se estiver alterando dependências em vez de apenas instalá-las, use `npm install` no diretório correspondente e versione também o `package-lock.json` atualizado.

### 2. Iniciar o PostgreSQL

#### Opção A — Docker

Na raiz do projeto:

```bash
docker compose up -d postgres
docker compose ps
```

Os padrões são banco `cpe`, usuário `cpe`, senha `cpe` e porta `5432`. É possível sobrescrevê-los antes de iniciar:

```bash
POSTGRES_USER=cpe POSTGRES_PASSWORD='senha-local' POSTGRES_DB=cpe POSTGRES_PORT=5432 docker compose up -d postgres
```

#### Opção B — PostgreSQL instalado localmente

Crie o usuário e o banco com suas próprias credenciais. Exemplo executado no `psql` por um administrador:

```sql
CREATE ROLE cpe WITH LOGIN PASSWORD 'senha-local';
CREATE DATABASE cpe OWNER cpe;
```

### 3. Configurar o backend

```bash
cd backend
cp .env.example .env
```

Edite `backend/.env`, principalmente:

```dotenv
DATABASE_URL="postgresql://cpe:senha-local@localhost:5432/cpe?schema=public"
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173
JWT_ACCESS_SECRET=um-valor-aleatorio-com-pelo-menos-32-caracteres
JWT_REFRESH_SECRET=outro-valor-aleatorio-e-diferente-com-32-caracteres
SEED_DEMO=true
```

Gere um segredo local:

```bash
openssl rand -hex 32
```

`CORS_ORIGIN` é usado no desenvolvimento local. Em produção, o backend aceita somente a origem HTTPS exata definida em `FRONTEND_URL`.

### 4. Preparar um banco local novo e descartável

Se `DATABASE_URL` aponta para um banco local vazio, ainda em `backend/`:

```bash
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run check
```

Se o seu `.env` aponta para o Supabase existente, execute somente `prisma:generate` e `check`; não aplique migrations nem seed como parte da configuração local.

- `prisma:deploy` aplica as migrations versionadas e só deve ser usado depois de revisar individualmente todas as migrations pendentes.
- `prisma:migrate` (`prisma migrate dev`) deve ser usado apenas ao **criar** uma nova migration durante o desenvolvimento.
- Não use `prisma db push` como substituto do histórico de migrations.
- `db:reset` apaga todos os dados; use somente em um banco descartável de desenvolvimento.

### 5. Configurar o frontend

```bash
cd ../frontend
cp .env.example .env
```

O padrão encaminha `/api` ao backend local:

```dotenv
VITE_API_URL=
VITE_API_PROXY=http://localhost:4000
VITE_DEV_HOST=localhost
VITE_DEV_PORT=5173
```

`VITE_API_URL` fica vazio localmente. Na Vercel, ele recebe a origem do Render, por exemplo `https://cpe-backend.onrender.com`.

Mantenha `VITE_DEV_HOST=localhost` no trabalho local. Use `0.0.0.0` apenas quando precisar expor o servidor à rede e souber controlar o acesso.

### 6. Executar no VS Code

Abra dois terminais integrados.

**Terminal 1 — API:**

```bash
cd backend
npm run dev
```

**Terminal 2 — interface:**

```bash
cd frontend
npm run dev
```

Acesse `http://localhost:5173`. A interface usa `/api` e o Vite encaminha as chamadas para `http://localhost:4000`; não é necessário colocar uma URL absoluta da API no código do navegador.

## Seed e primeiro acesso

### Ambiente local de demonstração

Com `NODE_ENV` diferente de `production` e `SEED_DEMO=true`, `npm run prisma:seed` cria dados demonstrativos e os seguintes acessos:

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@cpe.local` | `Admin@123` |
| Coordenador | `coordenador@cpe.local` | `Coord@123` |
| Técnico | `tecnico@cpe.local` | `Tec@123` |
| Consulta | `consulta@cpe.local` | `Ver@123` |

Essas credenciais são exclusivamente locais e públicas. **Nunca as use em produção.**

### Ambiente sem demonstração ou produção

O modo produção sempre bloqueia usuários e dados demo. O seed também recusa um banco que ainda contenha as contas públicas de demonstração, evitando promover acidentalmente uma base local. Defina as credenciais do primeiro administrador antes do seed:

```dotenv
NODE_ENV=production
SEED_DEMO=false
INITIAL_ADMIN_NAME=Administrador CPE
INITIAL_ADMIN_EMAIL=admin@seu-dominio.com.br
INITIAL_ADMIN_PASSWORD=uma-senha-forte-123
```

A senha inicial precisa ter ao menos 12 caracteres, com letras e números. O usuário será obrigado a trocá-la no primeiro acesso. Depois da criação, remova `INITIAL_ADMIN_PASSWORD` do ambiente e reinicie a aplicação.

O seed é idempotente para permissões, perfis e usuários conhecidos, mas cada execução deixa um registro de auditoria.

## Prisma e banco de dados

O Prisma usa `backend/prisma.config.js`; a configuração antiga em `package.json` não é necessária. Execute comandos Prisma a partir de `backend/`, onde está o `.env`.

Comandos úteis:

```bash
# Formatar e validar o schema
npx prisma format
npx prisma validate

# Gerar o cliente após mudanças no schema
npm run prisma:generate

# Ver o estado das migrations
npx prisma migrate status

# Criar migration durante desenvolvimento
npm run prisma:migrate -- --name descricao_da_mudanca

# Aplicar migrations existentes em instalação/produção
npm run prisma:deploy

# Abrir o editor visual local
npm run prisma:studio
```

### Regras de migrations

1. Altere `prisma/schema.prisma`.
2. Crie uma migration nomeada com `prisma migrate dev` em um banco de desenvolvimento.
3. Revise o SQL gerado, especialmente constraints, índices e alterações destrutivas.
4. Execute os testes.
5. Versione juntos o schema e a pasta nova em `prisma/migrations/`.
6. Em outros ambientes, aplique com `prisma migrate deploy`.

O banco possui constraints adicionais para anos, coordenadas, UF, níveis de perfil, pesos, metas, domínios de avaliação e coerência do escopo das metas. Não remova essas validações ao gerar novas migrations.

### Diagnóstico rápido do Prisma

- **`P1001` / não conecta:** confirme host, porta, serviço PostgreSQL e `DATABASE_URL`.
- **Credencial inválida:** revise usuário, senha, banco e caracteres especiais codificados na URL.
- **`Environment variable not found: DATABASE_URL`:** confirme que `backend/.env` existe e execute o comando dentro de `backend/`.
- **Client desatualizado:** execute `npm run prisma:generate` e reinicie a API.
- **Migration pendente:** execute `npx prisma migrate status` e depois `npm run prisma:deploy`.
- **Drift em banco de desenvolvimento:** investigue antes de aceitar reset. Não rode `migrate reset` em produção.

## Importações

O sistema aceita CSV, XLS e XLSX e oferece modelos pela própria interface. O fluxo é:

1. enviar o arquivo;
2. analisar e mapear as colunas;
3. revisar a prévia e os erros;
4. confirmar o processamento.

Estados possíveis: `PENDENTE`, `IMPORTADO`, `PARCIAL`, `FALHOU` e `CANCELADO`. Em importações de escolas, cada linha é isolada: uma linha inválida não desfaz as linhas válidas, e o trabalho termina como `PARCIAL` quando houver falhas de aplicação.

Arquivos ficam em `backend/uploads/`, diretório ignorado pelo Git. Em produção, inclua esse diretório no armazenamento persistente e na política de backup.

## Testes e verificações

### Backend

```bash
cd backend
npm test
npm run check
npm audit
```

`npm run check` valida o schema Prisma e executa a suíte `node:test`. A validação do Prisma precisa de uma `DATABASE_URL` configurada, mas não altera os dados.

### Frontend

```bash
cd frontend
npm run build
npm audit
```

O build usa divisão de código por rota. O diretório `dist/` é gerado e não deve ser versionado.

### Checklist antes de commit/push

```bash
# backend
cd backend
npm run check

# frontend
cd ../frontend
npm run build

# alterações do repositório
cd ..
git status --short
git diff --check
```

Revise migrations, `.env.example`, lockfiles e o diff. Nunca adicione `.env`, segredos, uploads ou dumps com dados reais.

## Produção — frontend na Vercel e backend no Render

### Frontend — Vercel

Crie um projeto Vercel conectado a este repositório com:

```text
Root Directory: frontend
Install Command: npm ci
Build Command: npm run build
Output Directory: dist
```

Variável obrigatória na Vercel:

```dotenv
VITE_API_URL=https://SEU-BACKEND.onrender.com
```

Informe somente a origem, sem `/api` e sem barra final. O cliente HTTP centralizado em `frontend/src/services/api.js` acrescenta `/api` às rotas. Em desenvolvimento, quando `VITE_API_URL` está vazio, o navegador usa `/api` e o proxy do Vite aponta para `http://localhost:4000`.

O `frontend/vercel.json` mantém o fallback da SPA para `index.html`. O `vercel.json` da raiz também é frontend-only e não contém entrypoint ou função do backend.

### Backend — Render

Crie um **Web Service** conectado ao mesmo repositório:

```text
Root Directory: backend
Build Command: npm ci && npm run prisma:generate
Start Command: npm start
Health Check Path: /api/health
```

O script `npm start` executa o servidor Express existente (`node src/server.js`), que escuta `process.env.PORT` com fallback local para `4000`.

O arquivo `render.yaml` contém a mesma configuração. O build não executa seed, reset, `db push` nem migrations, portanto não altera o banco automaticamente.

Variáveis obrigatórias no Render:

```dotenv
NODE_ENV=production
DATABASE_URL=URL_DO_POSTGRESQL_SUPABASE_EXISTENTE
FRONTEND_URL=https://SEU-FRONTEND.vercel.app
JWT_ACCESS_SECRET=SEGREDO_FORTE_COM_32_OU_MAIS_CARACTERES
JWT_REFRESH_SECRET=OUTRO_SEGREDO_FORTE_E_DIFERENTE
EXPOSE_RESET_URL=false
SEED_DEMO=false
```

Variáveis opcionais com os padrões atuais:

```dotenv
API_PREFIX=/api
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=7
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
PASSWORD_RESET_TTL_HOURS=24
UPLOAD_DIR=uploads
MAX_UPLOAD_MB=10
```

O refresh token atual é opaco, aleatório, rotativo e armazenado somente como hash no PostgreSQL; ele não é um JWT. `JWT_REFRESH_SECRET` é mantido separado e obrigatório em produção para nunca reutilizar o segredo do access token em uma evolução futura, sem substituir a arquitetura atual.

### CORS e cookies

- Produção aceita somente a origem exata de `FRONTEND_URL`.
- `credentials: true` permanece habilitado no backend.
- O cliente usa `credentials: 'include'` em todas as chamadas.
- Cookies continuam `httpOnly`, têm `secure=true` e `sameSite=none` em produção, `path=/` e não definem `domain` (host-only no Render).
- Tokens não são gravados em `localStorage`, `sessionStorage` ou `document.cookie`.

Como Vercel e Render são sites diferentes, o navegador precisa permitir cookies cross-site. Para maior compatibilidade futura, um domínio próprio com subdomínios para frontend e API é recomendável, mas não é necessário para o primeiro deploy.

### Prisma e Supabase

O backend usa o mesmo `DATABASE_URL` e o mesmo schema Prisma. O Render executa apenas `prisma generate` no build. **Não execute migrations como parte desta separação de infraestrutura.**

A migration já versionada `20260827000000_remove_school_municipality_uf_and_clear_schools` contém exclusões permanentes de escolas e registros relacionados. Ela não foi criada nem alterada nesta separação, porém deve ser tratada como bloqueio operacional: não execute `npm run prisma:deploy` contra o Supabase existente sem uma decisão explícita, backup e revisão de dados.

Em uma manutenção futura aprovada, o comando de produção é `npm run prisma:deploy`, mas somente após conferir quais migrations estão pendentes. Nunca execute `prisma migrate reset` ou `prisma db push` no banco de produção. Não configure outro banco no Render.

### Uploads no Render

Importações são temporárias: o arquivo é analisado e removido, enquanto a prévia fica no PostgreSQL. Já os documentos anexados são armazenados atualmente em `UPLOAD_DIR`. Como o filesystem padrão do Render é efêmero, documentos podem desaparecer após restart ou deploy. Esta separação não implementa um storage novo; use disco persistente do Render ou object storage em uma etapa posterior.

### Ordem recomendada de publicação

1. Faça backup e confira o estado das migrations sem executar alterações destrutivas.
2. Publique o backend no Render e teste `/api/health`.
3. Cadastre `VITE_API_URL` na Vercel e publique o frontend.
4. Atualize `FRONTEND_URL` no Render com a URL final da Vercel e redeploy o backend.
5. Teste login, refresh, logout e as rotas protegidas no navegador.

O backend recusa inicialização de produção sem `DATABASE_URL`, `FRONTEND_URL`, segredos distintos e fortes, ou com `EXPOSE_RESET_URL=true`.

## Segurança implementada

- Cookies de autenticação `httpOnly`: `sameSite=lax` localmente; `sameSite=none` e `secure` em produção
- Access token curto, refresh token rotativo e revogação de sessão
- Bloqueio temporário após tentativas de login inválidas
- Rate limiting nas rotas de autenticação
- Autorização por permissões e hierarquia de perfis
- Bloqueio de usuários/perfis inativos
- Troca obrigatória de senha temporária
- Validação Zod na entrada e constraints no PostgreSQL
- Helmet, CORS explícito, compressão e limite de upload
- Auditoria de operações relevantes
- Soft delete e filtros para registros inativos/removidos

Segurança também depende da infraestrutura, do gerenciamento de segredos, de atualizações, de logs, de backups e de revisão periódica das permissões.

## Módulos principais

- Dashboard
- Escolas e geolocalização
- Programas e vínculos com escolas/indicadores
- Indicadores e categorias
- Resultados e avaliações
- Metas por escopo, ano e período
- Rankings, análises e relatórios CSV/XLSX/PDF
- Técnicos por escola
- Importações em lote
- Documentos
- Usuários, perfis e permissões
- Notificações e auditoria

## Licença

Uso interno/institucional. Defina uma licença formal antes de distribuir o projeto externamente.
