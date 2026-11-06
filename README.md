# Distributed Wallet API

API REST para gerenciamento de carteiras digitais em uma plataforma de jogos, desenvolvida com NestJS, TypeScript, MikroORM e PostgreSQL.

O projeto utiliza Domain-Driven Design (DDD), arquitetura baseada em portas e adaptadores e processamento assíncrono de eventos.

## Funcionalidades

- Criação e consulta de carteiras.
- Processamento de transações financeiras de jogos.
- Ledger financeiro com registros append-only.
- Controle de idempotência.
- Tratamento de transações com referências pendentes.
- Reembolsos e reversões.
- Controle de concorrência com bloqueio pessimista e versionamento.
- Persistência transacional no PostgreSQL.
- Inbox para deduplicação e rastreamento de mensagens.
- Outbox transacional para publicação confiável de eventos.
- Consumer SQS com retentativas, controle de visibilidade e Dead Letter Queue (DLQ).
- Worker independente para publicação de eventos da Outbox.

## Tecnologias

- TypeScript
- NestJS
- Bun
- MikroORM
- PostgreSQL 17
- Docker e Docker Compose
- AWS SDK SQS
- LocalStack
- Bun Test
- Oxlint

## Arquitetura

O projeto está organizado em camadas:

- **Domain:** entidades, regras de negócio e objetos de valor.
- **Application:** casos de uso, serviços e portas.
- **Infrastructure:** persistência, migrations, repositórios e mensageria.
- **Presentation:** controladores e endpoints HTTP.

O processamento assíncrono utiliza os padrões **Transactional Inbox** e **Transactional Outbox**:

1. O consumer recebe uma mensagem da fila SQS.
2. A Inbox registra a identificação e o hash do conteúdo para detectar duplicidade ou conflito.
3. O processamento financeiro e o registro da Inbox acontecem na mesma transação do banco.
4. A Outbox armazena eventos na mesma transação das alterações financeiras.
5. Um worker independente publica os eventos pendentes no SQS.
6. Mensagens inválidas ou que excedem o limite de tentativas podem ser encaminhadas para a DLQ.

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

O arquivo `.env.example` contém configurações destinadas ao desenvolvimento local.

## Execução completa com Docker

Inicie os serviços:

```bash
docker compose up -d --build
```

Verifique os containers:

```bash
docker compose ps
```

A API estará disponível em:

`http://localhost:3000/api/v1`

O ambiente Docker inclui:

- API REST.
- PostgreSQL.
- LocalStack para emulação local do SQS.
- Consumer de transações.
- Worker de publicação da Outbox.

A API utiliza o hostname `postgres` e a porta interna `5432` para acessar o banco. A porta `5433` é disponibilizada para acesso ao PostgreSQL a partir da máquina host.

## Execução local

Para executar a API diretamente na máquina, mantendo o PostgreSQL em Docker:

```bash
bun install
docker compose up -d postgres
bun run db:migration:up
bun run start:dev
```

Nesse cenário, a API acessa o banco por `localhost:5433`.

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

A carteira começa com saldo `0.00`. A aplicação permite uma carteira por jogador e moeda.

### Consultar carteira

`GET /api/v1/wallets/{walletUuid}`

### Consultar ledger

`GET /api/v1/wallets/{walletUuid}/ledger`

### Processar transação

`POST /api/v1/transactions`

Exemplo de aposta:

```json
{
  "providerId": "provider-demo",
  "externalTransactionId": "event-0001",
  "idempotencyKey": "provider-demo:event-0001",
  "playerId": "player-123",
  "currency": "BRL",
  "roundId": "round-42",
  "gameId": "game-7",
  "kind": "BET",
  "amount": "10.00"
}
```

Tipos de transação:

- `OPENING`: crédito inicial, reservado a operações internas; não é aceito pela API pública nem pelo consumer de mensagens.
- `BET`: débito de aposta.
- `WIN`: crédito de prêmio.
- `LOSS`: registro de perda sem movimentação financeira.
- `REFUND`: reembolso de uma aposta referenciada.
- `ROLLBACK`: reversão do efeito financeiro de uma transação.

`REFUND` e `ROLLBACK` exigem `referenceExternalTransactionId`.

Os valores monetários são representados por strings decimais com até duas casas. O domínio utiliza unidades menores inteiras para evitar imprecisão de ponto flutuante.

### Consultar transação

`GET /api/v1/transactions/{transactionUuid}`

## Mensageria

O consumer utiliza uma fila FIFO de entrada:

- `wager-transactions.fifo`
- `wager-transactions-dlq.fifo`

O processamento inclui deduplicação por Inbox, tratamento de mensagens inválidas, controle de tentativas e encaminhamento para DLQ.

O worker da Outbox publica eventos financeiros persistidos no PostgreSQL em uma fila SQS independente.

No ambiente local, o LocalStack fornece a infraestrutura de mensageria sem exigir uma conta AWS.

## Integridade financeira

- Saldo, transação e lançamento no ledger são persistidos na mesma transação SQL.
- Carteiras são bloqueadas com `SELECT ... FOR UPDATE` durante o processamento financeiro.
- A versão da carteira é verificada durante a atualização.
- Identificadores externos e chaves de idempotência possuem restrições de unicidade.
- O banco impede lançamentos duplicados no ledger.
- Reversões duplicadas são protegidas por índice único parcial.
- A Inbox utiliza a combinação de consumidor e identificador da mensagem para controlar duplicidade.
- A Outbox registra eventos na mesma transação das alterações financeiras.

A idempotência utiliza fingerprint SHA-256 do conteúdo da requisição. A reutilização de uma chave com conteúdo diferente resulta em conflito HTTP `409`.

Transações que chegam antes de suas referências podem permanecer em `PENDING_REFERENCE` e ser reprocessadas quando a referência estiver disponível.

## Testes e qualidade

Execute:

```bash
bun run build
bun run lint
bun run test
```

Para os testes E2E:

```bash
bun run test:e2e
```

Última execução da suíte unitária: **64 testes aprovados, 0 falhas**.

O build de produção e a validação da configuração do Docker Compose também foram executados com sucesso nesta revisão.

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

Não remova volumes ou dados persistentes em ambientes que precisem ser preservados.

## Segurança e limitações

Este projeto é uma implementação de portfólio/desafio técnico, não uma solução financeira pronta para produção.

Antes de uma implantação pública, ainda são necessárias configurações e validações como:

- Autenticação e autorização.
- Validação de assinatura e autenticidade dos provedores.
- Rate limiting.
- Gestão segura de credenciais e integração com AWS Secrets Manager.
- Configuração de infraestrutura AWS de produção.
- Observabilidade, métricas e rastreamento distribuído.
- Testes adicionais de integração, concorrência e recuperação de falhas.
- Revisão de segurança e configuração de produção.

Nunca publique arquivos `.env`, credenciais reais ou backups de banco de dados.