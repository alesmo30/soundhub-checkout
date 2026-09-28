import { Logger } from '@nestjs/common';
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';

import type { SendTransactionEmailUseCase } from '../modules/notifications';

const logger = new Logger('EmailWorker');

interface TransactionFinalizedMessage {
  readonly transactionId: string;
}

function parseTransactionId(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const transactionId =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Partial<TransactionFinalizedMessage>).transactionId
        : undefined;

    return typeof transactionId === 'string' ? transactionId : null;
  } catch {
    return null;
  }
}

// Records are processed one by one, never Promise.all: SPEC 12b's accepted
// duplicate-email trade-off depends on this staying sequential (see
// specs/12b-api-email-notifications.md, Decisions > Idempotency).
export async function processBatch(
  event: SQSEvent,
  useCase: SendTransactionEmailUseCase,
): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    const transactionId = parseTransactionId(record.body);

    if (!transactionId) {
      // A retry cannot fix a malformed body: the reconciler re-publishes
      // later if the transaction really lacks its email (SPEC 12a).
      logger.error(`malformed message body, not reported: ${record.messageId}`);
      continue;
    }

    const result = await useCase.execute(transactionId);

    if (result.isErr()) {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
