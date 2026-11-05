import { randomUUID } from 'node:crypto';
import { Money } from '../../domain/shared/money.js';
import { Wallet } from '../../domain/wallet/wallet.js';
import { ApplicationError } from '../errors/application-error.js';
import type { WalletUnitOfWork } from '../ports/wallet-unit-of-work.js';

export interface CreateWalletCommand {
  playerId: string;
  currency: string;
}

export class CreateWalletUseCase {
  constructor(private readonly unitOfWork: WalletUnitOfWork) {}

  async execute(command: CreateWalletCommand): Promise<Wallet> {
    const playerId = command.playerId?.trim();
    const currency = command.currency?.trim().toUpperCase() ?? '';

    if (!playerId || playerId.length > 100) {
      throw new ApplicationError('INVALID_PLAYER_ID', 400);
    }

    try {
      Money.zero(currency);
    } catch {
      throw new ApplicationError('INVALID_CURRENCY', 400);
    }

    try {
      return await this.unitOfWork.execute(async ({ wallets }) => {
        const existing = await wallets.findByPlayerIdAndCurrency(
          playerId,
          currency,
        );
        if (existing) {
          throw new ApplicationError('WALLET_ALREADY_EXISTS', 409);
        }

        const wallet = Wallet.create({
          id: randomUUID(),
          playerId,
          currency,
        });

        await wallets.save(wallet);
        return wallet;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ApplicationError('WALLET_ALREADY_EXISTS', 409);
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: string; cause?: { code?: string } };
    return candidate.code === '23505' || candidate.cause?.code === '23505';
  }
}
