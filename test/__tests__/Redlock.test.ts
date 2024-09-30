// __tests__/Redlock.test.ts
import { Redlock } from '../../src/Redlock';
import { MockRedisClient } from '../__mocks__/MockRedisClient';

const resource = 'test_resource';
const ttl = 1000;

describe('Redlock', () => {
  let redlock: Redlock;
  let clients: MockRedisClient[];

  beforeEach(() => {
    clients = [new MockRedisClient(), new MockRedisClient(), new MockRedisClient()];
    redlock = new Redlock(clients, { retryCount: 3, retryDelay: 100 });
  });

  test('should initialize with default options if not provided', () => {
    const defaultRedlock = new Redlock(clients);
    expect(defaultRedlock['retryCount']).toBe(3);
    expect(defaultRedlock['retryDelay']).toBe(200);
    expect(defaultRedlock['quorum']).toBe(2);
  });

  test('should generate a lockId', () => {
    const lockId = redlock['generateLockId']();
    expect(lockId).toHaveLength(32); // 16 bytes hex string
  });

  test('should acquire lock successfully and emit lockAcquired event', async () => {
    const lockAcquiredSpy = jest.spyOn(redlock, 'emit');

    const resultLockId = await redlock.acquire(resource, ttl);

    expect(resultLockId).toHaveLength(32);
    expect(lockAcquiredSpy).toHaveBeenCalledWith('lockAcquired', expect.any(Object));
  });

  test('should fail to acquire lock after max retries and emit error', async () => {
    // Simulate clients already having locks
    await clients[0].set(resource, 'existing_lock', { nx: true, px: ttl });
    await clients[1].set(resource, 'existing_lock', { nx: true, px: ttl });
    jest.spyOn(clients[2], 'set').mockRejectedValue(new Error());

    const errorSpy = jest.spyOn(redlock, 'emit');

    await expect(redlock.acquire(resource, ttl)).rejects.toThrow(
      'Failed to acquire lock after maximum retries.'
    );

    expect(errorSpy).toHaveBeenCalledWith('attemptFailed', expect.objectContaining({
      resource,
     }))
    expect(errorSpy).toHaveBeenCalledWith('error', expect.any(Error));
  });

  test('should emit error when lock validity time expired', async () => {
    const errorSpy = jest.spyOn(redlock, 'emit');

    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(8000); // Simulate time delay

    await expect(redlock.acquire(resource, ttl)).rejects.toThrow(
      'Lock validity time expired before acquiring quorum.'
    );

    expect(errorSpy).toHaveBeenCalledWith('error', expect.any(Error));
  });

  test('should release lock successfully and emit lockReleased event', async () => {
    const lockReleasedSpy = jest.spyOn(redlock, 'emit');
    const lockId = await redlock.acquire(resource, ttl);

    await redlock.release(resource, lockId);

    expect(lockReleasedSpy).toHaveBeenCalledWith('lockReleased', { resource, lockId });
  });

  test('should emit unlockError if release fails', async () => {
    const unlockErrorSpy = jest.spyOn(redlock, 'emit');
  
    // Mock the eval method to simulate an error during the release process
    jest.spyOn(clients[0], 'eval').mockRejectedValue(new Error('Eval error'));
  
    // Acquire a lock first
    const lockId = await redlock.acquire(resource, ttl);
  
    // Attempt to release the lock, which will fail on the first client
    await redlock.release(resource, lockId);
  
    // Expect the unlockError event to be emitted due to the eval failure
    expect(unlockErrorSpy).toHaveBeenCalledWith('unlockError', expect.objectContaining({
      client: clients[0],
      error: expect.any(Error),
    }));
  });

  test('should extend lock successfully and emit lockExtended event', async () => {
    const lockExtendedSpy = jest.spyOn(redlock, 'emit');
    const lockId = await redlock.acquire(resource, ttl);

    await redlock.extend(resource, lockId, ttl);

    expect(lockExtendedSpy).toHaveBeenCalledWith('lockExtended', { resource, lockId, ttl });
  });

  test('should emit error when failing to extend lock', async () => {
    const errorSpy = jest.spyOn(redlock, 'emit');

    // Try to extend a lock that was never acquired
    await expect(redlock.extend(resource, 'non_existent_lock', ttl)).rejects.toThrow(
      'Failed to extend lock on a majority of instances.'
    );

    expect(errorSpy).toHaveBeenCalledWith('error', expect.any(Error));
  });

  test('should handle retry logic during lock', async () => {
    const spySleep = jest.spyOn(global, 'setTimeout');

    // Simulate lock failure on first attempt
    jest.spyOn(clients[0], 'set').mockResolvedValueOnce(null);
    jest.spyOn(clients[1], 'set').mockResolvedValueOnce(null)

    const lockAcquiredSpy = jest.spyOn(redlock, 'emit');

    await redlock.acquire(resource, ttl);

    expect(spySleep).toHaveBeenCalledWith(expect.any(Function), 100); // retryDelay
    expect(lockAcquiredSpy).toHaveBeenCalledWith('lockAcquired', expect.any(Object));
  });
});
