import { RedisClient } from '../RedisClient';
import Redis from 'ioredis';

export class IORedisAdapter implements RedisClient {
  private client: Redis.Redis;

  constructor(client: Redis.Redis) {
    this.client = client;
  }

  async set(
    key: string,
    value: string,
    options?: { nx?: boolean; px?: number }
  ): Promise<'OK' | null> {
    const args = [key, value];

    if (options?.nx) args.push('NX');
    if (options?.px) args.push('PX', options.px.toString());

    const result = await this.client.set(...args);
    return result as 'OK' | null;
  }

  async eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<number> {
    const result = await this.client.eval(script, keys.length, ...keys, ...args);
    return Number(result);
  }

  disconnect(): void {
    this.client.disconnect();
  }
}
