export interface RegisterInboxMessage {
  consumerName: string;
  messageId: string;
  payloadHash: string;
  receivedAt?: Date;
}

export type InboxRegistrationResult =
  | 'REGISTERED'
  | 'DUPLICATE'
  | 'PAYLOAD_CONFLICT';

export interface InboxMessageRepository {
  register(
    message: RegisterInboxMessage,
  ): Promise<InboxRegistrationResult>;

  markProcessed(
    consumerName: string,
    messageId: string,
    processedAt?: Date,
  ): Promise<void>;
}