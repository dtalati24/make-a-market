import { transaction } from '../transaction';

/** Behaves like expo-sqlite: a second BEGIN while one is open fails. */
function fakeDb(log: string[]) {
  let open = false;
  return {
    async withTransactionAsync(work: () => Promise<void>): Promise<void> {
      if (open) throw new Error('cannot start a transaction within a transaction');
      open = true;
      log.push('begin');
      try {
        await work();
        log.push('commit');
      } catch (error) {
        log.push('rollback');
        throw error;
      } finally {
        open = false;
      }
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('transaction', () => {
  it('runs overlapping transactions one after another', async () => {
    const log: string[] = [];
    const db = fakeDb(log);
    await Promise.all([
      transaction(db, async () => {
        log.push('a1');
        await tick();
        log.push('a2');
      }),
      transaction(db, async () => {
        log.push('b1');
        await tick();
        log.push('b2');
      }),
    ]);
    expect(log).toEqual(['begin', 'a1', 'a2', 'commit', 'begin', 'b1', 'b2', 'commit']);
  });

  it('keeps going after a failed transaction', async () => {
    const log: string[] = [];
    const db = fakeDb(log);
    const failing = transaction(db, async () => {
      throw new Error('boom');
    });
    const next = transaction(db, async () => {
      log.push('next');
    });
    await expect(failing).rejects.toThrow('boom');
    await next;
    expect(log).toEqual(['begin', 'rollback', 'begin', 'next', 'commit']);
  });
});
