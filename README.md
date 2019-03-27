# Memcached client

We wrote this because we got nervous about the connection pooling logic in the
3rd-Eden/memcached client, along with the lack of maintenance and several other
concerning behaviors that that library chooses to do.

### Usage

The tests are probably the best place to start, but:

```typescript
const memcached = require('..')
const pool = new memcached.MemcachedPool(['localhost:11211'], {
    connectionsPerHost: 10,
    // How much time to wait to acquire a free connection
    connectionTimeoutMillis: 1000,
    // How much time to wait for a response from Memcached
    commandTimeoutMillis: 5000,
})
const expirySeconds = 10
await pool.set('key', 'value', expirySeconds)
const key = await pool.get('key')
await pool.del('key')
```
