
# Distributed Wallet API

API REST para gerenciamento de carteiras digitais em uma plataforma de jogos, desenvolvida com NestJS, TypeScript, MikroORM e PostgreSQL.

O projeto utiliza princípios de Domain-Driven Design (DDD), separação de responsabilidades e arquitetura baseada em portas e adaptadores.

## Funcionalidades

- Criação e consulta de carteiras.
- Processamento de transações financeiras de jogos.
- Ledger financeiro com registros append-only.
- Controle de idempotência.
- Processamento de transações com referências pendentes.
- Reembolsos e reversões de transações.
- Controle de concorrência com bloqueio pessimista e versionamento.
- Persistência transacional no PostgreSQL.
- Validação de dados e respostas padronizadas de erro.

## Tecnologias

- Node.js / Bun
- TypeScript
- NestJS
- MikroORM
- PostgreSQL 17
- Docker e Docker Compose
- Vitest
- Oxlint

## Arquitetura

O projeto separa as responsabilidades em camadas:

- **Domain:** entidades, regras de negócio e objetos de valor.
- **Application:** casos de uso, serviços e portas de persistência.
- **Infrastructure:** banco de dados, migrations e implementações dos repositórios.
- **Presentation:** controladores e exposição dos endpoints HTTP.

## Requisitos

- Bun 1.4+
- Docker Desktop com Docker Compose
- Git

## Configuração

Clone o repositório:

```bash
git clone https://github.com/SEU-USUARIO/distributed-wallet-api.git
cd distributed-wallet-api
```

Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

O arquivo `.env.example` utiliza valores destinados exclusivamente ao desenvolvimento local.

## Execução local

Para executar a API diretamente na máquina e utilizar o PostgreSQL pelo Docker:

```bash
bun install
docker compose up -d postgres
bun run db:migration:up
bun run start:dev
```

Nesse cenário, a API acessa o PostgreSQL pelo endereço `localhost:5433`.

A API estará disponível em:

`http://localhost:3000/api/v1`

## Execução completa com Docker

Construa a imagem da API:

```bash
docker build -t distributed-wallet:latest .
```

Inicie os serviços:

```bash
docker compose up -d
```

Verifique os containers:

```bash
docker compose ps
```

Nesse cenário, a API acessa o PostgreSQL pelo hostname `postgres`, na porta interna `5432`.

A porta `5433` é utilizada para acesso ao banco a partir da máquina host, evitando conflito com instalações locais do PostgreSQL.

**Atenção:** as credenciais padrão do Docker Compose são apenas para desenvolvimento local. Não utilize essas configurações em ambientes públicos ou de produção.

## Endpoints

### Health check

`GET /api/v1`

Resposta:

```json
{
  "status": "ok",
  "service": "distributed-wallet-api"
}
```

### Criar carteira

`POST /api/v1/wallets`

```json
{
  "playerId": "player-123",
  "currency": "BRL"
}
```

A carteira começa com saldo `0.00`. É permitida uma carteira por jogador e moeda.

### Consultar carteira

`GET /api/v1/wallets/{walletUuid}`

### Processar transação

`POST /api/v1/transactions`

```json
{
  "providerId": "provider-demo",
  "externalTransactionId": "event-0001",
  "idempotencyKey": "provider-demo:event-0001",
  "playerId": "player-123",
  "currency": "BRL",
  "roundId": "round-42",
  "gameId": "game-7",
  "kind": "OPENING",
  "amount": "100.00"
}
```

Tipos de transação:

- `OPENING`: crédito inicial.
- `BET`: débito de aposta.
- `WIN`: crédito de prêmio.
- `LOSS`: registro de perda sem movimentação financeira.
- `REFUND`: reembolso de uma aposta referenciada.
- `ROLLBACK`: reversão do efeito financeiro de uma transação.

`REFUND` e `ROLLBACK` exigem `referenceExternalTransactionId`.

Os valores monetários são representados por strings decimais com até duas casas. O domínio utiliza unidades menores inteiras em string para evitar imprecisão de ponto flutuante.

### Consultar transação

`GET /api/v1/transactions/{transactionUuid}`

## Integridade financeira

- Saldo, transação e lançamento no ledger são persistidos na mesma transação SQL.
- Carteiras são bloqueadas com `SELECT ... FOR UPDATE` durante o processamento financeiro.
- A versão da carteira é verificada durante a atualização.
- Identificadores externos e chaves de idempotência possuem restrições de unicidade.
- O banco impede lançamentos duplicados no ledger.
- Reversões duplicadas são protegidas por índice único parcial.
- O ledger não permite atualização de entradas existentes pela aplicação.

A idempotência utiliza fingerprint SHA-256 do conteúdo da requisição. A reutilização de uma chave com conteúdo diferente resulta em conflito HTTP `409`.

Transações que chegam antes de suas referências podem permanecer em `PENDING_REFERENCE` e ser reprocessadas quando a referência estiver disponível.

## Testes e qualidade

Execute:

```bash
bun run build
bun run lint
bun run test
bun run test:e2e
```

Validações realizadas nesta versão:

- Build de produção concluído.
- Lint concluído sem warnings ou erros.
- 58 testes unitários aprovados.
- Teste E2E do endpoint de health check aprovado.
- Imagem Docker construída e container da API validado.
- Operações de carteira e transações verificadas com persistência no PostgreSQL.
- Migrations aplicadas e estruturas de integridade conferidas no banco.

## Migrations

Criar uma migration:

```bash
bun run db:migration:create
```

Aplicar migrations:

```bash
bun run db:migration:up
```

Reverter a última migration:

```bash
bun run db:migration:down
```

Não utilize comandos que removam volumes ou dados persistentes em ambientes que precisem ser preservados.

## Segurança e limitações

Este projeto é uma implementação de portfólio/desafio técnico, não uma solução financeira pronta para produção.

Antes de uma implantação pública, ainda são necessárias implementações e configurações como:

- Autenticação e autorização.
- Validação de assinatura dos provedores.
- Rate limiting.
- Gestão segura de credenciais.
- Integrações com AWS SQS, SNS, S3 e Secrets Manager.
- Inbox/Outbox e processamento assíncrono.
- Observabilidade, métricas e rastreamento distribuído.
- Testes adicionais de integração e concorrência em ambiente controlado.
- Revisão de segurança e configuração de produção.

Nunca publique arquivos `.env`, credenciais reais ou backups de banco de dados.
