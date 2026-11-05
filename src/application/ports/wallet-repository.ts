import { Wallet } from '../../domain/wallet/wallet.js';

export const WALLET_REPOSITORY = Symbol('WALLET_REPOSITORY');

export interface WalletRepository {
  findById(id: string, forUpdate?: boolean): Promise<Wallet | null>;

  findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
    forUpdate?: boolean,
  ): Promise<Wallet | null>;

  save(wallet: Wallet): Promise<void>;
}
