import type { EntityManager } from 'typeorm';

import type { TxContext } from '../../application/ports/unit-of-work.port';

export class TypeOrmTxContext implements TxContext {
  readonly __brand = 'TxContext' as const;

  constructor(readonly manager: EntityManager) {}
}
