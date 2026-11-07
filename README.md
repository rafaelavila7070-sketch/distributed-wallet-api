
# Distributed Wallet API

API de carteira digital distribuída desenvolvida como solução para o desafio técnico da Jungle Gaming.

O projeto utiliza NestJS, TypeScript, MikroORM e PostgreSQL, com foco em consistência financeira, concorrência, idempotência e processamento assíncrono de mensagens.

## Tecnologias

- TypeScript
- NestJS
- Bun
- MikroORM
- PostgreSQL
- Docker e Docker Compose
- AWS SDK for JavaScript (SQS)
- LocalStack
- Bun Test
- Oxlint

## Funcionalidades

- Criação e consulta de carteiras.
- Controle de saldo com precisão decimal.
- Operações financeiras: BET, WIN, LOSS, REFUND e ROLLBACK.
- Registro de transações e histórico financeiro (ledger).
- Idempotência por chave e identificação externa.
- Tratamento de transações recebidas antes de suas referências.
- Controle de concorrência com bloqueio pessimista e versão da carteira.
- Persistência transacional de saldo, transações e ledger.
- Padrões Inbox e Outbox para processamento assíncrono.
- Publicação de eventos por Amazon SQS.
- Retentativas, controle de visibilidade e Dead Letter Queue (DLQ).
- Identificação e rastreamento de requisições por correlation ID.
- Logs estruturados para operações HTTP e processamento de mensagens.
- Health check com verificação de conectividade com o banco de dados.

## Arquitetura

O projeto segue princípios de Domain-Driven Design (DDD) e arquitetura hexagonal, separando responsabilidades em quatro camadas:

```text
src/
├── domain/
│   ├── ledger/
│   ├── shared/
│   ├── wager-transaction/
│   └── wallet/
├── application/
│   ├── use-cases/
│   └── services/
├── infrastructure/
│   ├── database/
│   ├── logging/
│   └── messaging/
└── presentation/
    └── http/
```

- **Domain:** regras de negócio, entidades, objetos de valor e invariantes financeiras.
- **Application:** casos de uso e coordenação das operações.
- **Infrastructure:** persistência, mensageria, integrações e logging.
- **Presentation:** controllers, middleware e exposição dos endpoints HTTP.

## Consistência financeira

As operações financeiras são executadas em transações do banco de dados, garantindo que a atualização do saldo, o registro da transação e a criação das entradas do ledger sejam persistidos de forma consistente.

O controle de concorrência utiliza:

- Bloqueio pessimista para operações sobre carteiras.
- Controle de versão da carteira.
- Restrições de unicidade no banco de dados.
- Validações de saldo e direção das operações.
- Valores monetários representados com precisão decimal.

As operações que alteram o saldo são registradas no ledger, permitindo a reconciliação entre o saldo da carteira e o histórico financeiro.

## Idempotência

A API utiliza chaves de idempotência para evitar a execução duplicada de operações.

O processamento considera:

- Chave de idempotência.
- Identificação externa da transação.
- Hash do payload.
- Restrições de unicidade persistidas no banco de dados.

Uma requisição repetida com a mesma chave e o mesmo conteúdo não deve aplicar novamente a operação financeira.

A reutilização de uma chave com conteúdo diferente é rejeitada.

## Mensageria: Inbox e Outbox

O projeto utiliza os padrões Inbox e Outbox para aumentar a confiabilidade do processamento assíncrono.

### Inbox

Responsável pelo controle das mensagens recebidas.

- Identifica mensagens já processadas.
- Evita duplicidade de operações financeiras.
- Registra mensagens recebidas.
- Permite retentativas de processamento.
- Encaminha mensagens que excedem o limite de tentativas para a DLQ.

### Outbox

Os eventos são registrados no mesmo contexto transacional da operação financeira.

Um worker independente publica os eventos pendentes no Amazon SQS.

O publisher possui controle de processamento, tentativas e agendamento de novas publicações.

### Consumer

O consumer recebe mensagens do SQS e processa as operações utilizando o caso de uso da aplicação.

O processamento inclui:

- Deduplicação por Inbox.
- Controle de visibilidade das mensagens.
- Retentativas com backoff exponencial.
- Encaminhamento para Dead Letter Queue após o limite de tentativas.

## Observabilidade

O projeto possui mecanismos de rastreamento e registro de eventos operacionais.

### Correlation ID

O middleware HTTP:

- Aceita o header `x-correlation-id` enviado pelo cliente.
- Valida o formato do identificador recebido.
- Gera um UUID quando o identificador não é informado ou não é válido.
- Devolve o identificador no header `x-correlation-id` da resposta.
- Disponibiliza o contexto da requisição por meio de AsyncLocalStorage.

O correlation ID também é propagado para os eventos da Outbox, permitindo relacionar a requisição HTTP original com o processamento assíncrono.

### Logs estruturados

Os registros HTTP incluem:

- timestamp
- correlationId
- method
- path
- statusCode
- durationMs

Os níveis de log variam de acordo com o resultado da requisição.

Os componentes de mensageria também registram informações operacionais, incluindo identificadores de eventos e mensagens, tentativas de processamento, erros e agendamento de retentativas.

Os eventos de processamento do consumer são registrados em formato JSON estruturado.

**Observação:** o projeto não inclui atualmente uma stack de métricas Prometheus ou tracing distribuído.

## Pré-requisitos

- Bun 1.4 ou superior.
- Docker Desktop.
- Git.

## Como executar

### 1. Clonar o repositório

```bash
git clone https://github.com/rafaelavila7070-sketch/distributed-wallet-api.git
cd distributed-wallet-api
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Confira as configurações do arquivo `.env` antes de iniciar a aplicação.

### 3. Executar com Docker Compose

```bash
docker compose up -d --build
```

A aplicação estará disponível em:

```text
http://localhost:3000/api/v1
```

O ambiente utiliza os seguintes serviços:

- API
- PostgreSQL
- LocalStack
- Outbox Worker
- SQS Consumer

### 4. Executar localmente

Para executar a aplicação fora do Docker:

```bash
bun install
docker compose up -d postgres
bun run db:migration:up
bun run start:dev
```

Nesse modo, a aplicação utiliza a porta `5433` do PostgreSQL disponibilizada pelo Docker Compose.

### 5. Executar os processos assíncronos

Outbox Worker:

```bash
bun run start:worker
```

SQS Consumer:

```bash
bun run start:consumer
```

## Endpoints

### Health Check

```http
GET /api/v1
```

Verifica o estado da aplicação e a conectividade com o banco de dados.

A resposta inclui o estado do serviço e da conexão com o PostgreSQL.

### Criar carteira

```http
POST /api/v1/wallets
Content-Type: application/json
```

Exemplo:

```json
{
  "playerId": "player-123",
  "currency": "BRL",
  "initialBalance": {
    "amount": "100.00",
    "currency": "BRL"
  }
}
```

O campo `initialBalance` é opcional. Quando não informado, a carteira é criada com saldo zero.

Quando informado com valor positivo, a criação do saldo inicial é registrada como uma operação interna de abertura (`OPENING`).

A aplicação permite uma carteira por jogador e moeda.

### Processar transação

```http
POST /api/v1/transactions
Content-Type: application/json
Idempotency-Key: provider-demo:event-0001
```

A chave de idempotência é enviada no header HTTP `Idempotency-Key`, não no corpo da requisição.

As operações públicas incluem:

- `BET`
- `WIN`
- `LOSS`
- `REFUND`
- `ROLLBACK`

As operações `REFUND` e `ROLLBACK` exigem uma referência à transação externa correspondente.

A operação `OPENING` é interna e utilizada na criação de carteiras com saldo inicial.

## Testes

Para executar os testes unitários:

```bash
bun run test
```

Para executar os testes end-to-end:

```bash
bun run test:e2e
```

Para gerar o build:

```bash
bun run build
```

Para executar a análise estática:

```bash
bun run lint
```

### Resultado atual dos testes

- **69 testes aprovados**
- **0 falhas**
- **143 verificações (`expect`)**
- Testes distribuídos em 6 arquivos.

A suíte contempla regras de domínio, processamento financeiro, idempotência, concorrência, ledger, Inbox e propagação do correlation ID.

Os testes end-to-end também verificam o health check e a geração e propagação do correlation ID nas requisições HTTP.

## Migrations

Para executar as migrations:

```bash
bun run db:migration:up
```

## Limitações e melhorias futuras

O projeto foi desenvolvido como solução de desafio técnico e não deve ser considerado pronto para produção sem etapas adicionais de segurança e operação.

Entre os próximos pontos de evolução:

- Autenticação e autorização.
- Validação de assinatura de provedores.
- Rate limiting.
- Integração de segredos com AWS Secrets Manager.
- Configuração de infraestrutura AWS para produção.
- Métricas operacionais e dashboards.
- Tracing distribuído.
- Ampliação dos testes de integração, concorrência e recuperação de falhas.
- Revisão de segurança e hardening da infraestrutura.

## Repositório

[GitHub — Distributed Wallet API](https://github.com/rafaelavila7070-sketch/distributed-wallet-api)
