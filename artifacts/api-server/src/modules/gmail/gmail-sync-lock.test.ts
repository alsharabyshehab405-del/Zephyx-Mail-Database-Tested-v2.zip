import { describe, expect, it } from 'vitest';
import { GmailSyncLock } from './gmail.service.js';

describe('Gmail multi-account sync locking', () => {
  it('locks one user/account atomically while isolating other accounts and users', () => {
    const lock = new GmailSyncLock();
    expect(lock.acquire('user-a', 'account-1')).toBe(true);
    expect(lock.acquire('user-a', 'account-1')).toBe(false);
    expect(lock.isLocked('user-a', 'account-1')).toBe(true);
    expect(lock.acquire('user-a', 'account-2')).toBe(true);
    expect(lock.acquire('user-b', 'account-1')).toBe(true);
    lock.release('user-a', 'account-1');
    expect(lock.acquire('user-a', 'account-1')).toBe(true);
  });

  it('does not leak a lock after release and keeps default account isolated', () => {
    const lock = new GmailSyncLock();
    expect(lock.acquire('user-a')).toBe(true);
    expect(lock.acquire('user-a', 'account-1')).toBe(true);
    lock.release('user-a');
    expect(lock.isLocked('user-a')).toBe(false);
    expect(lock.isLocked('user-a', 'account-1')).toBe(true);
  });
});
