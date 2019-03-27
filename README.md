# Memcached client

We wrote this because we got nervous about the connection pooling logic in the
node-memcached client, along with several other concerning things that that
library chooses to do.

### Usage

The tests are probably the best place to start, but:

```typescript
const memcached = require('..')
const pool = new memcached.MemcachedPool('localhost:11211', 10, 1000, 1)
