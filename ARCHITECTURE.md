# Architecture — Distributed Wallet API

## 1. Overview

This project implements a distributed wallet and wager transaction processing API using NestJS, TypeScript, PostgreSQL, MikroORM, and Amazon SQS (LocalStack for local development).

The system is designed around financial consistency, transaction idempotency, concurrency control, auditability, and asynchronous event delivery.

The main architectural principles are:

- Domain-Driven Design (DDD).
- Ports and Adapters (Hexagonal Architecture).
- Transactional persistence through the Unit of Work pattern.
- Database-backed idempotency.
- Pessimistic locking and optimistic version checks.
- Append-only financial ledger.
- Transactional Inbox and Outbox patterns.
- At-least-once asynchronous message delivery.

## 2. Technology Stack

| Component | Technology |
|---|---|
| Runtime | Bun |
| Language | TypeScript |
| Framework | NestJS |
| ORM | MikroORM |
| Database | PostgreSQL |
| Messaging | Amazon SQS |
| Local AWS environment | LocalStack |
| Containerization | Docker / Docker Compose |
| Testing | Bun Test |

## 3. Architectural Layers

The codebase is organized into four main layers.

### Domain

Contains business rules and domain models independently of infrastructure.

Main concepts:

- `Wallet`: wallet balance, credits, debits, and balance validation.
- `Money`: monetary values and currency operations.
- `WagerTransaction`: transaction lifecycle, status transitions, references, and reversal rules.
- `WalletLedgerEntry`: immutable financial movement records.

Money calculations use integer minor-unit string arithmetic rather than JavaScript floating-point arithmetic.

### Application

Contains use cases and application ports.

Examples:

- `CreateWalletUseCase`
- `GetWalletUseCase`
- `GetWalletLedgerUseCase`
- `ProcessWagerTransactionUseCase`
- `ReconcileWalletUseCase`

The application layer depends on repository and Unit of Work interfaces rather than concrete database implementations.

### Infrastructure

Implements persistence and messaging adapters.

Includes:

- MikroORM entities and repositories.
- PostgreSQL migrations.
- Wallet Unit of Work.
- Inbox and Outbox repositories.
- Outbox publisher worker.
- SQS transaction consumer.

### Presentation

Contains the HTTP controller and application error handling.

The HTTP layer translates requests into application commands and serializes domain results.

## 4. Persistence Model

PostgreSQL is the source of truth for wallet balances and financial transaction records.

Main tables:

- `wallets`: wallet identity, player, currency, balance, and version.
- `wager_transactions`: financial transaction records and lifecycle state.
- `wallet_ledger_entries`: financial movement history.
- `inbox_messages`: consumed-message deduplication records.
- `outbox_events`: events awaiting asynchronous publication.

Database constraints provide additional integrity guarantees:

- Unique provider and external transaction identifier.
- Unique idempotency key.
- Unique ledger entry per transaction.
- Unique Inbox consumer/message identifier.
- Unique Outbox event identifier.
- Partial unique index preventing multiple active reversals for the same reference transaction.
- Foreign keys and check constraints for financial records.

## 5. Monetary Representation

The `Money` value object validates monetary amounts and currency codes.

Amounts are represented internally using integer minor-unit strings. Arithmetic operations avoid JavaScript `number`, `float`, and `double` calculations for monetary values.

The API and persistence boundaries use decimal strings.

Wallet debits are validated by the domain model. Insufficient funds reject the transaction without creating a financial ledger entry.

## 6. Transaction Processing

The `ProcessWagerTransactionUseCase` coordinates financial operations through a Unit of Work.

The processing flow is:

1. Normalize and validate the incoming command.
2. Parse and validate the monetary amount.
3. Calculate a SHA-256 payload fingerprint.
4. Check the idempotency key.
5. Check the provider's external transaction identifier.
6. Acquire a pessimistic lock on the target wallet.
7. Recheck idempotency and external transaction identifiers after acquiring the lock.
8. Create or resume the wager transaction.
9. Validate references and reversal rules when applicable.
10. Apply the debit or credit through the Wallet domain model.
11. Persist the updated wallet, transaction, and ledger entry.
12. Persist the corresponding Outbox event.
13. Commit the database transaction.

All database writes in this flow are executed through the same Unit of Work transaction.

### Transaction Types

Supported transaction kinds:

- `OPENING`
- `BET`
- `WIN`
- `LOSS`
- `REFUND`
- `ROLLBACK`

`OPENING` is an internal wallet initialization operation and is not accepted through the SQS wager consumer.

Refunds and rollbacks require a valid reference transaction. The system checks for an existing reversal and also relies on a PostgreSQL partial unique index to protect against duplicate reversals.

Transactions that arrive before their required reference can be stored with `PENDING_REFERENCE` status and resumed when the reference becomes available.

## 7. Concurrency and Idempotency

### Pessimistic Locking

Wallet reads that precede financial mutations use PostgreSQL pessimistic write locking through MikroORM.

This serializes competing balance mutations for the same wallet.

### Optimistic Version Check

The wallet repository also verifies the expected wallet version when updating an existing wallet.

The update is conditional on the previous version. If another operation has already changed it, the repository raises a version conflict.

### Database-Level Uniqueness

Idempotency is persisted in PostgreSQL rather than held in application memory.

The system uses unique constraints for:

- `idempotency_key`
- `(provider_id, external_transaction_id)`

A repeated request with the same key and matching payload returns the existing transaction. Reusing the key with a different payload results in a conflict.

These mechanisms support safe processing across application instances, subject to the database transaction and locking behavior.

## 8. Financial Ledger and Reconciliation

The ledger records each successful financial movement with:

- Wallet identifier.
- Transaction identifier.
- Direction (debit or credit).
- Amount and currency.
- Balance before the movement.
- Balance after the movement.
- Creation timestamp.

A unique constraint ensures that a transaction cannot create multiple ledger entries.

The reconciliation use case compares the wallet's current balance with the balance calculated from its ledger entries.

The HTTP API exposes reconciliation through:

`GET /api/v1/wallets/{walletId}/reconciliation`

The ledger is intended to provide an auditable history of financial movements.

## 9. Inbox Pattern — Incoming Messages

The SQS consumer processes incoming wager transaction messages.

Before processing, the application registers the message in the Inbox table using:

- Consumer name.
- Message identifier.
- Payload hash.

The database enforces uniqueness for the consumer/message identifier.

The Inbox registration, financial processing, and processed-message update occur inside the same Unit of Work transaction.

This prevents a message from being marked as successfully processed independently of its financial database operation.

Duplicate messages are recognized and acknowledged without applying the financial operation again.

## 10. Outbox Pattern — Outgoing Events

Financial operations persist their corresponding Outbox events in the same database transaction as the wallet, transaction, and ledger changes.

The independent Outbox publisher worker:

1. Finds unpublished events that are eligible for delivery.
2. Claims events using PostgreSQL `FOR UPDATE SKIP LOCKED`.
3. Uses a time-limited lease to coordinate multiple publisher instances.
4. Publishes events to SQS.
5. Marks successfully published events.
6. Schedules failed events for retry using exponential backoff.

The event identifier is unique in PostgreSQL.

The delivery model is **at-least-once**, not exactly-once. If the publisher sends a message successfully but crashes before marking the event as published, the event may be delivered again. Downstream consumers should therefore be idempotent.

## 11. SQS Consumer and Failure Handling

The transaction consumer uses an SQS FIFO queue and a separate dead-letter queue.

It supports:

- Long polling.
- Configurable visibility timeout.
- Message validation.
- Duplicate-message handling.
- Retry with exponential visibility delays.
- Maximum receive count.
- Dead-letter handling for invalid or repeatedly failing messages.

Messages are acknowledged only after successful application processing or after being classified as terminal.

The Outbox publisher and SQS consumer run as independent workers, separate from the HTTP API process.

## 12. HTTP API

Base URL:

`http://localhost:3000/api/v1`

Implemented operations include:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Service status |
| POST | `/wallets` | Create a wallet |
| GET | `/wallets/{walletId}` | Retrieve a wallet |
| GET | `/wallets/{walletId}/ledger` | Retrieve wallet ledger |
| GET | `/wallets/{walletId}/reconciliation` | Reconcile wallet balance |
| POST | `/transactions` | Process a wager transaction |
| GET | `/transactions/{transactionId}` | Retrieve a transaction |

The transaction endpoint requires an `Idempotency-Key` HTTP header.

## 13. Local Development

The project provides Docker Compose services for:

- PostgreSQL.
- LocalStack.
- HTTP API.
- Outbox publisher worker.
- SQS transaction consumer.

Start the environment with:

```bash
docker compose up --build
```

The API is exposed on port `3000`.

The PostgreSQL container is exposed on port `5433`, and LocalStack is exposed on port `4566`.

## 14. Validation and Tests

The project has been validated with:

```bash
bun run build
bun run test
bun run test:e2e
bun run lint
```

At the time of this documentation:

- 66 unit tests pass.
- 1 end-to-end test passes.
- Build completes successfully.
- Lint has passed in the development validation.

A manual LocalStack smoke test also exercised message processing, malformed-message handling, dead-letter routing, duplicate delivery handling, and a successful balance update.

These checks do not constitute a complete multi-instance concurrency or production recovery test suite.

## 15. Security and Production Considerations

This project focuses on financial consistency and distributed processing patterns. It is not presented as a production-ready financial platform.

Further work would be required for production deployment, including:

- Authentication and authorization.
- Provider signature verification.
- Rate limiting and abuse protection.
- Production AWS credentials and Secrets Manager integration.
- Structured observability, metrics, and distributed tracing.
- Automated integration tests against PostgreSQL and SQS.
- Multi-instance concurrency and crash-recovery testing.
- Security review and operational hardening.

## 16. Design Goals

The primary goal is to demonstrate how a wallet service can preserve financial consistency while handling duplicate requests, concurrent balance mutations, asynchronous events, and message redelivery.

The implementation prioritizes database-backed correctness, explicit domain rules, and recoverable asynchronous processing over claims of exactly-once message delivery.