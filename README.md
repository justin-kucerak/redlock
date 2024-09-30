# Redlock - Distributed Locking with Redis in TypeScript

A TypeScript implementation of the Redlock algorithm for distributed locking using Redis. This package provides a flexible, client-agnostic locking mechanism suitable for synchronization across multiple processes or services.
## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Quick Start](#quick-start)
  - [Event Handling](#event-handling)
- [API Documentation](#api-documentation)
  - [Class: Redlock](#class-redlock)
    - [Constructor](#constructor)
    - [Methods](#methods)
      - [acquire(resource, ttl)](#acquire)
      - [release(resource, lockId)](#release)
      - [extend(resource, lockId, ttl)](#extend)
    - [Events](#events)
- [Implementing Redis Clients](#implementing-redis-clients)
  - [Using ioredis](#using-ioredis)
  - [Using node-redis](#using-node-redis)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

<a name="features"/>

## Features

- Distributed Locking: Implements the Redlock algorithm for safe distributed locking across multiple Redis instances.
- Client-Agnostic: Works with any Redis client library that implements the provided `RedisClient` interface.
- Event-Driven: Emits events for lock acquisition, release, extension, and errors, allowing for custom handling and logging.
- TypeScript Support: Fully typed for enhanced development experience and code safety.

<a name="installation"/>

## Installation

Install the package via npm:

```
npm install @justin-kucerak/redlock
```
You'll also need to install a Redis client library. The package supports ioredis and node-redis via provided adapters.
### For `ioredis`:
```
npm install ioredis
```
### For `node-redis`:
```
npm install redis
```
**Note**: The Redis client libraries are listed as peer dependencies. You must install one of them separately.

<a name="usage"/>

## Usage

<a name="quick-start"/>

### Quick Start

Here's a simple example of how to use the Redlock class with ioredis:
```typescript
import { Redlock, IORedisAdapter } from '@justin-kucerak/redlock';
import Redis from 'ioredis';

// Create Redis clients
const redisClients = [
  new Redis({ host: 'localhost', port: 6379 }),
  new Redis({ host: 'localhost', port: 6380 }),
  new Redis({ host: 'localhost', port: 6381 }),
];

// Wrap clients with adapters
const clients = redisClients.map((client) => new IORedisAdapter(client));

// Create Redlock instance
const redlock = new Redlock(clients);

async function doWork() {
  const resource = 'my-resource';
  const ttl = 10000; // 10 seconds

  let lockId: string | null = null;

  try {
    // Acquire the lock
    lockId = await redlock.acquire(resource, ttl);
    console.log('Lock acquired:', lockId);

    // Perform your critical section code here

    // Optionally extend the lock if needed
    await redlock.extend(resource, lockId, ttl);
    console.log('Lock extended');

    // Release the lock
    await redlock.release(resource, lockId);
    console.log('Lock released');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Ensure the lock is released if it was acquired
    if (lockId) {
      try {
        await redlock.release(resource, lockId);
      } catch (releaseError) {
        console.error('Error releasing lock in finally block:', releaseError);
      }
    }

    // Close Redis clients
    redisClients.forEach((client) => client.disconnect());
  }
}

doWork();
```

<a name="event-handling"/>

### Event Handling

The Redlock class extends EventEmitter and emits events during its operation. You can attach listeners to these events for logging or custom handling.
```typescript
redlock.on('error', (error) => {
  console.error('Redlock error:', error);
});

redlock.on('lockAcquired', ({ resource, lockId }) => {
  console.log(`Lock acquired on resource ${resource} with ID ${lockId}`);
});

redlock.on('lockReleased', ({ resource, lockId }) => {
  console.log(`Lock released on resource ${resource} with ID ${lockId}`);
});

redlock.on('lockExtended', ({ resource, lockId, ttl }) => {
  console.log(`Lock on resource ${resource} extended with ID ${lockId} for ${ttl}ms`);
});
```

<a name="api-documentation"/>

## API Documentation

<a name="class-redlock"/>

### Class: `Redlock`

The Redlock class provides methods to acquire, release, and extend locks on resources using the Redlock algorithm.

<a name="constructor"/>

### Constructor
```typescript
constructor(clients: RedisClient[], options?: RedlockOptions)
```
- **Parameters**:
  - `clients` (`RedisClient[]`): An array of Redis clients implementing the `RedisClient` interface.
  - `options` (`RedlockOptions`, optional):
    - `retryCount` (`number`, optional): Number of times to retry acquiring the lock (default: `3`).
    - `retryDelay` (`number`, optional): Delay between retries in milliseconds (default: `200`).

<a name="methods"/>

### Methods

<a name="acquire"/>

#### `acquire(resource, ttl)`

Acquires a distributed lock on the specified resource.

```typescript
async acquire(resource: string, ttl: number): Promise<string>
```
- Parameters:
  - `resource` (`string`): The resource key to lock.
  - `ttl` (`number`): The time-to-live of the lock in milliseconds.
- Returns:
  - `Promise<string>`: The unique lock ID if the lock is acquired.
- Throws:
  - `Error` if the lock cannot be acquired after the maximum retries.

<a name="release"/>

#### `release(resource, lockId)`

Releases the distributed lock on the specified resource.

```typescript
async release(resource: string, lockId: string): Promise<void>
```
- Parameters:
  - `resource` (`string`): The resource key to unlock.
  - `lockId` (`string`): The unique lock ID returned by acquire.
- `Throws`:
  - `Error` if the lock cannot be released.

<a name="extend"/>

### `extend(resource, lockId, ttl)`

Extends the duration of an existing lock.

```typescript
async extend(resource: string, lockId: string, ttl: number): Promise<void>
```
- Parameters:
  - `resource` (`string`): The resource key whose lock duration is to be extended.
  - `lockId` (`string`): The unique lock ID returned by acquire.
  - `ttl` (`number`): The new time-to-live for the lock in milliseconds.
- `Throws`:
  - `Error` if the lock cannot be extended.

<a name="events"/>

### Events

The `Redlock` class emits the following events:

- error: Emitted when an error occurs.
  - Listener Parameters: (error: Error)

- lockAcquired: Emitted when a lock is successfully acquired.
  - Listener Parameters: ({ resource: string, lockId: string, validityTime: number })

- lockReleased: Emitted when a lock is successfully released.
  - Listener Parameters: ({ resource: string, lockId: string })

- lockExtended: Emitted when a lock is successfully extended.
  - Listener Parameters: ({ resource: string, lockId: string, ttl: number })

- lockError: Emitted when an error occurs during lock acquisition on a client.
  - Listener Parameters: ({ client: RedisClient, error: Error })

- unlockError: Emitted when an error occurs during lock release on a client.
  - Listener Parameters: ({ client: RedisClient, error: Error })

- extendError: Emitted when an error occurs during lock extension on a client.
  - Listener Parameters: ({ client: RedisClient, error: Error })

- attemptFailed: Emitted when a lock acquisition attempt fails but retries are remaining.
  - Listener Parameters: ({ resource: string, lockId: string, attempts: number })

<a name="implementing-redis-clients"/>

## Implementing Redis Clients

To use the Redlock class, you need to provide Redis clients that implement the RedisClient interface.

```typescript
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
```

<a name="using-ioredis"/>

### Using ioredis

First, install ioredis as a dependency:

```
npm install ioredis
```
Then, use the IORedisAdapter provided by the package:

```typescript
import { Redlock, IORedisAdapter } from '@justin-kucerak/redlock';
import Redis from 'ioredis';

// Create Redis clients
const redisClients = [
  new Redis({ host: 'localhost', port: 6379 }),
  // ... other clients
];

// Wrap Redis clients with IORedisAdapter
const clients = redisClients.map((client) => new IORedisAdapter(client));

// Create Redlock instance
const redlock = new Redlock(clients);
```

<a name="using-node-redis"/>

### Using node-redis

First, install redis as a dependency:

```
npm install redis
```
Then, use the NodeRedisAdapter provided by the package:

```typescript
import { Redlock, NodeRedisAdapter } from '@justin-kucerak/redlock';
import { createClient } from 'redis';

// Create Redis clients
const redisClients = [
  createClient({ url: 'redis://localhost:6379' }),
  // ... other clients
];

// Ensure clients are connected
await Promise.all(redisClients.map((client) => client.connect()));

// Wrap Redis clients with NodeRedisAdapter
const clients = redisClients.map((client) => new NodeRedisAdapter(client));

// Create Redlock instance
const redlock = new Redlock(clients);
```

<a name="testing"/>

## Testing

The package includes unit tests to ensure correct functionality.
### Unit Tests

Unit tests are written using Jest and can be run with:
```
npm run test
```
These tests use mock implementations of the RedisClient interface to simulate Redis behavior.

<a name="contributing"/>

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository and create a new branch for your feature or bug fix.
2. Write tests to cover your changes.
4. Submit a pull request with a detailed description of your changes.

For major changes, please open an issue first to discuss what you would like to change.

<a name="license"/>

### License

This project is licensed under the MIT License - see the LICENSE file for details.

<a name="acknowledgments"/>

### Acknowledgments

- Inspired by the Redlock algorithm as described by Redis.
- Thanks to the contributors of ioredis and node-redis for their excellent Redis client libraries.
- Hat tip to all developers who have contributed to similar distributed locking mechanisms.
