import { RedisClient } from '../RedisClient';
import { RedisClientType } from 'redis';

export class NodeRedisAdapter implements RedisClient {
  private client: RedisClientType;

  constructor(client: RedisClientType) {
    this.client = client;
  }

  async set(
    key: string,
    value: string,
    options?: { nx?: boolean; px?: number }
  ): Promise<'OK' | null> {
    const setOptions: any = {};

    if (options?.nx) setOptions.NX = true;
    if (options?.px) setOptions.PX = options.px;

    const result = await this.client.set(key, value, setOptions);
    return result;
  }

  async eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<number> {
    const result = await this.client.eval(script, {
      keys,
      arguments: args.map(String),
    });
    return Number(result);
  }

  disconnect(): void {
    this.client.disconnect();
  }
}
