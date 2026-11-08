# Implementation Notes

## 1. Project Status

This repository contains an independent implementation of the Distributed Wallet API challenge.

The current revision implements the main financial transaction processing flow, database-backed idempotency, concurrency controls, transactional Inbox and Outbox patterns, and asynchronous SQS processing.

The project is intended as a backend engineering portfolio implementation demonstrating distributed systems and financial consistency concepts. It is not presented as a production-ready financial platform.

## 2. Implemented Capabilities

### Application and Domain

- Domain models for wallets, money, wager transactions, and ledger entries.
- Application use cases for wallet creation, wallet lookup, ledger retrieval, transaction processing, and reconciliation.
- Application ports for repositories and transaction-scoped Unit of Work.
- Centralized application error handling.
- HTTP endpoints under `/api/v1`.

### Financial Consistency

- Monetary calculations using integer minor-unit string arithmetic.
- Atomic persistence of wallet balance, transaction, and ledger changes.
- PostgreSQL transactions through MikroORM.
- Pessimistic wallet locking.
- Optimistic wallet version checks.
- Insufficient-balance validation.
- Refund and rollback reference validation.
- Duplicate reversal protection.
- `PENDING_REFERENCE` handling for transactions whose references have not yet arrived.
- Ledger-based wallet reconciliation.

### Idempotency and Messaging

- SHA-256 payload fingerprints.
- Database-backed request idempotency.
- Provider transaction identifier uniqueness.
- Transactional Inbox for incoming message deduplication.
- Transactional Outbox for outgoing event persistence.
- Independent Outbox publisher worker.
- SQS FIFO transaction consumer.
- Dead-letter queue configuration.
- Retry handling with exponential backoff.
- Message correlation identifiers.

## 3. Database

The project uses PostgreSQL 17 and MikroORM.

Database migrations create and evolve the persistence structures for:

- Wallets.
- Wager transactions.
- Wallet ledger entries.
- Inbox messages.
- Outbox events.

Database-level integrity protections include unique constraints, foreign keys, check constraints, supporting indexes, and duplicate reversal protection.

PostgreSQL remains the source of truth for financial state and message-processing records.

## 4. Asynchronous Processing

The SQS consumer and Outbox publisher run as independent worker processes.

The consumer processes incoming wager messages and coordinates Inbox registration with financial transaction processing through the application Unit of Work.

The Outbox publisher claims pending events using PostgreSQL `FOR UPDATE SKIP LOCKED`, publishes them to SQS, and schedules retries when publication fails.

Message delivery follows an at-least-once model. Consumers must remain idempotent because duplicate delivery is possible.

Local development uses LocalStack to emulate SQS.

## 5. Runtime and Infrastructure

The project includes:

- Dockerfile.
- Docker Compose configuration.
- PostgreSQL service.
- LocalStack service.
- HTTP API service.
- Outbox publisher worker.
- SQS transaction consumer.
- `.env.example` configuration template.

The HTTP API exposes liveness and database-readiness endpoints.

The readiness check currently verifies PostgreSQL connectivity; it does not represent a complete health check of every external dependency.

## 6. Verification Performed

The latest recorded automated validation included:

- 76 passing tests.
- 0 failing tests.
- 169 assertions.
- 7 test files.
- Successful production build.

The test suite includes domain behavior, application transaction scenarios, HTTP health endpoint behavior, and Outbox publisher success and failure scenarios.

Manual LocalStack validation exercised message processing, duplicate delivery, malformed-message handling, and queue/DLQ behavior.

A duplicate-delivery scenario confirmed that processing the same wager message again did not apply a second financial debit or create an additional ledger entry.

These validations do not constitute a complete multi-instance concurrency or production crash-recovery test suite.

## 7. Intentionally Deferred or Not Fully Verified

The following capabilities remain outside the current implementation scope or require additional validation:

- Authentication and authorization.
- Provider signature verification.
- Rate limiting and abuse protection.
- Production AWS credentials and Secrets Manager integration.
- Complete metrics, dashboards, distributed tracing, and alerting.
- Full multi-instance concurrency testing.
- Automated crash-recovery and publisher/consumer interruption testing.
- Complete SQS dependency readiness checks.
- Production deployment and operational hardening.

## 8. Project Scope

This implementation prioritizes financial consistency, durable idempotency, transactional persistence, and recoverable asynchronous processing.

The architecture and implementation details are documented in `ARCHITECTURE.md`.

The project should be evaluated as a technical implementation of distributed backend patterns, with the limitations and validation scope described above taken into account.