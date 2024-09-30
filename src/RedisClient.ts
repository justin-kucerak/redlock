export interface RedisClient {
    set(
      key: string,
      value: string,
      options?: {
        nx?: boolean;
        px?: number; // Expiration in milliseconds
      }
    ): Promise<'OK' | null>;
  
    eval(
      script: string,
      keys: string[],
      args: (string | number)[]
    ): Promise<number>;
  
    disconnect(): void;
}
  