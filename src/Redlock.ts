import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { RedisClient } from './RedisClient';

interface RedlockOptions {
  retryCount?: number;
  retryDelay?: number;
}

export class Redlock extends EventEmitter {
  private clients: RedisClient[];
  private retryCount: number;
  private retryDelay: number;
  private quorum: number;
  private clockDriftFactor: number = 0.01; // 1% clock drift factor

  constructor(clients: RedisClient[], options?: RedlockOptions) {
    super();
    this.clients = clients;
    this.retryCount = options?.retryCount || 3;
    this.retryDelay = options?.retryDelay || 200; // milliseconds
    this.quorum = Math.floor(clients.length / 2) + 1;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async executeOnAllClients<T>(
    fn: (client: RedisClient) => Promise<T>
  ): Promise<(T | null)[]> {
    return Promise.all(
      this.clients.map(async (client) => {
        try {
          return await fn(client);
        } catch (error) {
          this.emit('error', error);
          return null;
        }
      })
    );
  }

  private generateLockId(): string {
    return randomBytes(16).toString('hex');
  }

  private async lockInstances(
    resource: string,
    lockId: string,
    ttl: number
  ): Promise<number> {
    const lockPromises = this.clients.map(async (client) => {
      try {
        const result = await client.set(resource, lockId, { px: ttl });
        return result === 'OK' ? 1 : 0;
      } catch (error) {
        this.emit('lockError', { client, error });
        return 0;
      }
    });

    const results = await Promise.all(lockPromises);
    const successfulLocks = results.reduce((acc: number, val) => acc + val, 0);
    return successfulLocks;
  }

  private async unlockInstances(resource: string, lockId: string): Promise<void> {
    const unlockScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    await this.executeOnAllClients(async (client) => {
      try {
        await client.eval(unlockScript, [resource], [lockId]);
      } catch (error) {
        this.emit('unlockError', { client, error });
      }
    });
  }

  public async acquire(resource: string, ttl: number): Promise<string> {
    const lockId = this.generateLockId();
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < this.retryCount) {
      const successfulLocks = await this.lockInstances(resource, lockId, ttl);

      if (successfulLocks >= this.quorum) {
        const elapsedTime = Date.now() - startTime;
        const drift = Math.floor(this.clockDriftFactor * ttl) + 2;
        const validityTime = ttl - elapsedTime - drift;

        if (validityTime > 0) {
          this.emit('lockAcquired', { resource, lockId, validityTime });
          return lockId;
        } else {
          await this.unlockInstances(resource, lockId);
          const error = new Error('Lock validity time expired before acquiring quorum.');
          this.emit('error', error);
          throw error;
        }
      } else {
        await this.unlockInstances(resource, lockId);
        this.emit('attemptFailed', { resource, lockId, attempts });
      }

      attempts++;
      await this.sleep(this.retryDelay);
    }

    const error = new Error('Failed to acquire lock after maximum retries.');
    this.emit('error', error);
    throw error;
  }

  public async release(resource: string, lockId: string): Promise<void> {
    try {
      await this.unlockInstances(resource, lockId);
      this.emit('lockReleased', { resource, lockId });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  public async extend(resource: string, lockId: string, ttl: number): Promise<void> {
    const extendScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const results = await this.executeOnAllClients(async (client) => {
      try {
        return await client.eval(extendScript, [resource], [lockId, ttl]);
      } catch (error) {
        this.emit('extendError', { client, error });
        return null;
      }
    });

    const extensions = results.filter((res) => Number(res) === 1).length;

    if (extensions >= this.quorum) {
      this.emit('lockExtended', { resource, lockId, ttl });
      return;
    } else {
      const error = new Error('Failed to extend lock on a majority of instances.');
      this.emit('error', error);
      throw error;
    }
  }
}
