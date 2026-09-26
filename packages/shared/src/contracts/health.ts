export interface HealthStatus {
  status: 'ok';
  database: 'up' | 'down';
}

export interface WebhookReceived {
  received: true;
}
