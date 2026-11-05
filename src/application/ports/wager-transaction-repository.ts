import { WagerTransaction } from '../../domain/wager-transaction/wager-transaction.js';

export interface WagerTransactionRepository {
  findById(id: string): Promise<WagerTransaction | null>;

  findByIdForUpdate(id: string): Promise<WagerTransaction | null>;

  findByExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null>;

  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<WagerTransaction | null>;

  findReversalForReference(
    referenceTransactionId: string,
  ): Promise<WagerTransaction | null>;

  save(transaction: WagerTransaction): Promise<void>;
}
