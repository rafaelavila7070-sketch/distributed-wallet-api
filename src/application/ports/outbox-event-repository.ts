
export interface CreateOutboxEvent {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface OutboxEventRepository {
  save(event: CreateOutboxEvent): Promise<void>;
}
