
# Implementation Notes

## Implemented

This revision delivers the main distributed wallet application flow.

- Application ports and transaction-scoped Unit of Work.
- Wallet creation and lookup use cases.
- Ledger history and wager transaction processing use cases.
- HTTP endpoints under `/api/v1`.
- Centralized application error responses.
- Atomic balance, transaction and ledger persistence using a single PostgreSQL transaction.
- Pessimistic wallet locking and optimistic wallet version checks.
- SHA-256 payload fingerprints and idempotency handling.
- `PENDING_REFERENCE` handling for transactions whose references have not arrived yet.
- Refund and rollback reference validation.
- Duplicate reversal protection.
- Database uniqueness constraints and supporting indexes.
- Application-level tests for transaction scenarios.
- Dockerfile and Docker Compose configuration.
- Environment example and project documentation.

## Database

The project uses PostgreSQL 17 and MikroORM.

The migrations included in this revision create and evolve the wallet, wager transaction and ledger persistence structures.

The latest migration adds database-level integrity protections for:

- Provider transaction identifiers.
- Idempotency keys.
- Ledger transaction references.
- Duplicate reversals.
- Wallet transaction history indexes.
- Ledger history indexes.

## Verification performed

The following validations were performed in the development environment:

- Production build completed successfully.
- Oxlint completed with zero warnings and errors.
- 58 unit tests passed across 6 test files.
- E2E health endpoint test passed.
- Docker image built successfully.
- Docker Compose API container started and responded successfully.
- Wallet and transaction operations were exercised through the HTTP API.
- PostgreSQL persistence was checked directly.
- Database migrations and expected constraints/indexes were verified.
- Wallet balance and ledger entries were reconciled after the test operations.

## Intentionally deferred

The following capabilities are not implemented or verified as production-ready:

- AWS SQS/SNS/S3/Secrets Manager integration.
- Inbox/Outbox tables and asynchronous relay workers.
- Dead-letter handling and reconciliation jobs.
- Authentication and provider signature validation.
- Authorization and rate limiting.
- Production secrets management.
- Distributed tracing, metrics and alerting.
- Full automated database concurrency and integration test coverage.
- Production deployment configuration.

## Project scope

This repository represents an independent revision of the Distributed Wallet API challenge.

The implementation focuses on financial consistency, transaction processing, idempotency, persistence integrity and separation of application responsibilities.

The project should be treated as a technical portfolio implementation rather than a production financial service.
