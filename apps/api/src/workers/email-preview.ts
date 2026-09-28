import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildSampleEmailData } from '../modules/notifications/templates/__fixtures__/sample-email-data';
import { renderTransactionEmail } from '../modules/notifications/templates/render-transaction-email';
import type { FinalStatus } from '../modules/notifications/templates/render-transaction-email';

const STATUSES: readonly FinalStatus[] = ['APPROVED', 'DECLINED', 'ERROR', 'VOIDED', 'EXPIRED'];

const OUTPUT_DIR = join(__dirname, '../../../../docs/evidence/emails');

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const status of STATUSES) {
    const data = buildSampleEmailData({ status });
    const { html } = renderTransactionEmail(data);
    const outputPath = join(OUTPUT_DIR, `${status.toLowerCase()}.html`);

    writeFileSync(outputPath, html);
    // eslint-disable-next-line no-console -- CLI output, not application logging.
    console.log(`Wrote ${outputPath}`);
  }
}

main();
