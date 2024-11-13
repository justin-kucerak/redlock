import { RedisClient } from '../RedisClient';
import Redis from 'ioredis';

export class IORedisAdapter implements RedisClient {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  async set(
    key: string,
    value: string,
    options: { px: number }
  ): Promise<'OK' | null> {
    const result = await this.client.set(key, value, 'PX', options.px.toString(), 'NX');
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
