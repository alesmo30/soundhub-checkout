import type { EntityManager } from 'typeorm';

import { TypeOrmTxContext } from './typeorm-tx-context';

describe('TypeOrmTxContext', () => {
  it('carries the given manager and the TxContext brand', () => {
    const manager = {} as EntityManager;
    const tx = new TypeOrmTxContext(manager);

    expect(tx.manager).toBe(manager);
    expect(tx.__brand).toBe('TxContext');
  });
});
