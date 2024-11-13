// test/__tests__/Redlock.integration.test.ts
import { Redlock } from '../../src/Redlock';
import { IORedisAdapter } from '../../src/adapters/IORedisAdapter';
import Redis from 'ioredis';

describe('Redlock Integration Tests', () => {
  let redisClients: Redis[];
  let clients: IORedisAdapter[];
  let redlock: Redlock;

  beforeAll(async () => {
    redisClients = [
      new Redis({ port: 63791 }),
      new Redis({ port: 63792 }),
      new Redis({ port: 63793 }),
    ];

    clients = redisClients.map((client) => new IORedisAdapter(client));
    redlock = new Redlock(clients);
  });

  afterAll(async () => {
    await Promise.all(redisClients.map((client) => client.quit()));
    redlock.removeAllListeners();
  });

  test('should acquire and release lock successfully', async () => {
    const resource = 'test-resource';
    const ttl = 5000;

    const lockId = await redlock.acquire(resource, ttl);
    expect(typeof lockId).toBe('string');

    // Ensure that another lock cannot be acquired on the same resource
    const anotherLockPromise = redlock.acquire(resource, ttl);

    await expect(anotherLockPromise).rejects.toThrow(
      'Failed to acquire lock after maximum retries.'
    );

    await redlock.release(resource, lockId);

    // Now another lock can be acquired
    const newLockId = await redlock.acquire(resource, ttl);
    expect(newLockId).not.toBe(lockId);

    await redlock.release(resource, newLockId);
  });

  test('should handle lock expiration', async () => {
    const resource = 'test-resource-expiration';
    const ttl = 1000; // 1 second

    const lockId = await redlock.acquire(resource, ttl);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, ttl + 200));

    // Now another lock can be acquired
    const newLockId = await redlock.acquire(resource, ttl);
    expect(newLockId).not.toBe(lockId);

    await redlock.release(resource, newLockId);
  });

  test('should extend lock successfully', async () => {
    const resource = 'test-resource-extend';
    const ttl = 1000; // 1 second

    const lockId = await redlock.acquire(resource, ttl);

    // Extend the lock before it expires
    await new Promise((resolve) => setTimeout(resolve, 500));
    await redlock.extend(resource, lockId, ttl * 2);

    // Wait for original TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 600));

    // The lock should still be held
    const anotherLockPromise = redlock.acquire(resource, ttl);
    await expect(anotherLockPromise).rejects.toThrow(
      'Failed to acquire lock after maximum retries.'
    );

    await redlock.release(resource, lockId);
  });

  test('should not extend an expired lock', async () => {
    const resource = 'test-resource-expired-extend';
    const ttl = 1000; // 1 second

    const lockId = await redlock.acquire(resource, ttl);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, ttl + 500));

    // Attempt to extend the expired lock
    await expect(redlock.extend(resource, lockId, ttl)).rejects.toThrow(
      'Failed to extend lock on a majority of instances.'
    );
  });

  test('should not release a lock with incorrect lockId', async () => {
    const resource = 'test-resource-wrong-lockid';
    const ttl = 5000;

    const lockId = await redlock.acquire(resource, ttl);

    // Attempt to release the lock with an incorrect lockId
    await redlock.release(resource, 'incorrect-lock-id');

    // The lock should still be held
    const anotherLockPromise = redlock.acquire(resource, ttl);
    await expect(anotherLockPromise).rejects.toThrow(
      'Failed to acquire lock after maximum retries.'
    );

    // Release the lock with the correct lockId
    await redlock.release(resource, lockId);
  });

  test('should re-acquire lock after release', async () => {
    const resource = 'test-resource-reacquire';
    const ttl = 5000;

    const lockId = await redlock.acquire(resource, ttl);
    await redlock.release(resource, lockId);

    // Immediately try to acquire the lock again
    const newLockId = await redlock.acquire(resource, ttl);
    expect(newLockId).not.toBe(lockId);

    await redlock.release(resource, newLockId);
  });

  test('should handle Redis instance failure during lock acquisition', async () => {
    const resource = 'test-resource-redis-failure';
    const ttl = 5000;

    // Simulate Redis instance failure
    await redisClients[0].quit();

    // Attempt to acquire the lock
    const lockId = await redlock.acquire(resource, ttl);
    expect(typeof lockId).toBe('string');

    // Restore the Redis instance
    redisClients[0] = new Redis({ port: 63791 });
    clients[0] = new IORedisAdapter(redisClients[0]);

    await redlock.release(resource, lockId);
  });

  test('should calculate lock validity time correctly', async () => {
    const resource = 'test-resource-validity-time';
    const ttl = 5000;

    const lockAcquiredHandler = jest.fn();

    redlock.on('lockAcquired', lockAcquiredHandler);

    const lockId = await redlock.acquire(resource, ttl);

    expect(lockAcquiredHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        resource,
        lockId,
        validityTime: expect.any(Number),
      })
    );

    const { validityTime } = lockAcquiredHandler.mock.calls[0][0];

    expect(validityTime).toBeLessThanOrEqual(ttl);
    expect(validityTime).toBeGreaterThan(ttl * 0.9); // Assuming negligible delay

    await redlock.release(resource, lockId);
    redlock.removeAllListeners('lockAcquired');
  });

  test('should handle concurrent lock acquisition attempts', async () => {
    const resource = 'test-resource-concurrent';
    const ttl = 5000;

    const lockPromises = [
      redlock.acquire(resource, ttl),
      redlock.acquire(resource, ttl),
      redlock.acquire(resource, ttl),
    ];

    const results = await Promise.allSettled(lockPromises);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);

    const lockId = (fulfilled[0] as PromiseFulfilledResult<string>).value;

    // Release the lock
    await redlock.release(resource, lockId);
  });

  test('should not release a lock that does not exist', async () => {
    const resource = 'test-resource-nonexistent-lock';
    const lockId = 'nonexistent-lock-id';

    // Attempt to release a non-existent lock
    await redlock.release(resource, lockId);

    // No error should be thrown, and the operation should be idempotent
  });

  test('should handle Redis instance failure during lock release', async () => {
    const resource = 'test-resource-release-failure';
    const ttl = 5000;

    const lockId = await redlock.acquire(resource, ttl);

    // Simulate Redis instance failure
    await redisClients[1].quit();

    // Attempt to release the lock
    await redlock.release(resource, lockId);

    // Restore the Redis instance
    redisClients[1] = new Redis({ port: 63792 });
    clients[1] = new IORedisAdapter(redisClients[1]);
  });

  test('should handle Redis instance failure during lock extension', async () => {
    const resource = 'test-resource-extend-failure';
    const ttl = 5000;

    const lockId = await redlock.acquire(resource, ttl);

    // Simulate Redis instance failure
    await redisClients[2].quit();

    // Attempt to extend the lock
    await redlock.extend(resource, lockId, ttl);

    // Restore the Redis instance
    redisClients[2] = new Redis({ port: 63793 });
    clients[2] = new IORedisAdapter(redisClients[2]);

    await redlock.release(resource, lockId);
  });
});
