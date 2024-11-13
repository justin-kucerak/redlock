import { RedisClient } from '../../src/RedisClient';

export class MockRedisClient implements RedisClient {
  private data: Map<string, { value: string; expiresAt: number }> = new Map();

  async set(
    key: string,
    value: string,
    options?: { px?: number }
  ): Promise<'OK' | null> {
    const currentTime = Date.now();
    const existing = this.data.get(key);

    if (existing && existing.expiresAt > currentTime) {
      // Key exists and is not expired
      return null;
    }

    const expiresAt = options?.px
      ? currentTime + options.px
      : Infinity;

    this.data.set(key, { value, expiresAt });
    return 'OK';
  }

  async eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<number> {
    const key = keys[0];
    const currentTime = Date.now();
    const lockId = args[0] as string;
    const ttl = Number(args[1]);

    const entry = this.data.get(key);

    if (script.includes('redis.call("get"')) {
      // Simulate the unlock or extend scripts
      if (entry && entry.value === lockId && entry.expiresAt > currentTime) {
        if (script.includes('redis.call("del"')) {
          // Unlock
          this.data.delete(key);
          return 1;
        } else if (script.includes('redis.call("pexpire"')) {
          // Extend
          entry.expiresAt = currentTime + ttl;
          this.data.set(key, entry); // Update the entry
          return 1;
        }
      }
      return 0;
    }

    return 0;
  }

  disconnect(): void {
    // No-op for mock
  }
}
