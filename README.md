
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

Última validação automatizada:

- **76 testes aprovados**
- **0 falhas**
- **169 verificações (`expect`)**
- **7 arquivos de teste**
- **3 testes end-to-end aprovados**
- Build de produção concluído com sucesso.

A suíte automatizada contempla regras de domínio, processamento financeiro, idempotência, concorrência, ledger, Inbox, Outbox, health check e propagação do correlation ID.

### Testes adicionais de concorrência e integração

Além da suíte automatizada, foram executados cenários manuais contra a API e o PostgreSQL em execução:

**Idempotência concorrente**

- 50 requisições simultâneas com a mesma chave de idempotência e o mesmo payload.
- As 50 respostas retornaram HTTP 201 e status `PROCESSED`.
- Todas referenciaram o mesmo identificador de transação.
- Apenas um débito foi registrado no ledger.
- Uma carteira iniciada com R$ 100,00 terminou com R$ 90,00.
- A reconciliação confirmou diferença zero.

**Concorrência financeira e saldo insuficiente**

- Duas apostas simultâneas de R$ 80,00 em uma carteira com saldo inicial de R$ 100,00.
- Uma operação foi `PROCESSED`.
- A outra foi `REJECTED`, com `INSUFFICIENT_FUNDS`.
- O saldo final foi R$ 20,00.
- O ledger registrou somente o crédito inicial e o débito aprovado.
- A reconciliação confirmou diferença de R$ 0,00 e nenhuma entrada inválida.

**Concorrência com apostas distintas**

- 50 apostas distintas processadas simultaneamente com saldo inicial de R$ 1.000,00: todas processadas, saldo final de R$ 500,00.
- Em outro cenário, 50 apostas distintas com saldo inicial de R$ 100,00: 10 processadas e 40 rejeitadas por saldo insuficiente, saldo final zero.
- As reconciliações financeiras desses cenários foram confirmadas.

**Idempotência e identificadores externos**

Também foram verificados:

- Repetição da mesma chave com o mesmo payload.
- Reutilização de uma chave com payload diferente, rejeitada com conflito HTTP 409.
- Repetição de identificador externo do provedor com uma nova chave.
- Ausência de débitos duplicados.

### SQS, Inbox e Outbox

Os testes de integração com LocalStack exercitaram:

- Publicação e processamento de mensagem válida.
- Confirmação de processamento e ACK.
- Republicação controlada do mesmo envelope, identificada como duplicada pelo consumer.
- Rejeição de JSON inválido e conflito de payload, com encaminhamento para a DLQ nos cenários exercitados.
- Verificação das filas principal e DLQ após os testes.

A republicação controlada confirmou a deduplicação pelo Inbox. Ela não representa, por si só, um teste de redelivery automática após crash real do consumer e expiração do visibility timeout.

### Banco de dados

As sete migrations do projeto foram inspecionadas e as estruturas aplicadas foram verificadas diretamente no PostgreSQL.

Foram confirmadas as seis tabelas da aplicação:

- `wallets`
- `wager_transactions`
- `wallet_ledger_entries`
- `inbox_messages`
- `outbox_events`
- `mikro_orm_migrations`

Também foram confirmadas constraints e índices para unicidade de carteiras, idempotência, identificadores externos, entradas do ledger, mensagens da Inbox e eventos da Outbox, além de chaves estrangeiras e checks de formato e valores.

Os resultados documentados representam os cenários efetivamente exercitados; não equivalem a uma certificação de recuperação de falhas em produção ou a um teste completo de múltiplas instâncias distribuídas.
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
