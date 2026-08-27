# CPE — Controle de Programas Educacionais

Aplicação web para gerir escolas, programas educacionais, indicadores, metas, resultados, avaliações, técnicos, documentos, importações, rankings e relatórios.

- **API:** Node.js, Express, Prisma e PostgreSQL
- **Interface:** React, React Router, Vite e Recharts
- **Autenticação:** cookies `httpOnly`, access/refresh token, permissões por perfil e troca obrigatória de senha temporária
- **Importações:** CSV, XLS e XLSX, com pré-visualização, mapeamento de colunas e processamento por linha

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
│   └── .env.example
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
SEED_DEMO=true
```

Gere um segredo local:

```bash
openssl rand -hex 32
```

`CORS_ORIGIN` aceita uma lista separada por vírgulas quando houver mais de uma origem autorizada.

### 4. Aplicar as migrations e gerar o Prisma Client

Ainda em `backend/`:

```bash
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run check
```

- `prisma:deploy` aplica somente as migrations versionadas e é o comando correto para instalação e produção.
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
VITE_API_PROXY=http://localhost:4000
VITE_DEV_HOST=localhost
VITE_DEV_PORT=5173
```

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

## Produção

Recomendações mínimas:

1. Use PostgreSQL gerenciado ou com backup e recuperação testados.
2. Configure `NODE_ENV=production`, HTTPS e um `JWT_ACCESS_SECRET` aleatório de 32+ caracteres.
3. Mantenha `EXPOSE_RESET_URL=false`; integre o envio real de e-mail antes de oferecer recuperação pública de senha.
4. Defina somente origens confiáveis em `CORS_ORIGIN`.
5. Execute `npm ci`, `npm run prisma:generate` e `npm run prisma:deploy` no deploy.
6. Execute o seed seguro uma vez para perfis/permissões e, se necessário, para o administrador inicial.
7. Gere o frontend com `npm run build` e sirva `frontend/dist` por HTTPS.
8. Encaminhe `/api` para a API na mesma origem. Isso preserva o modelo de cookies `httpOnly` usado pela aplicação.
9. Persista e proteja `backend/uploads`; não o exponha como diretório público.
10. Faça backup do banco e dos uploads de forma coordenada.

Exemplo de comandos da API no deploy:

```bash
cd backend
npm ci
npm run prisma:generate
npm run prisma:deploy
NODE_ENV=production npm run prisma:seed
npm start
```

O backend recusa inicialização de produção sem `DATABASE_URL`, sem segredo forte ou com `EXPOSE_RESET_URL=true`.

## Segurança implementada

- Cookies de autenticação `httpOnly`, `sameSite=lax` e `secure` em produção
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
