const expect = require('expect')

const memcached = require('..')

const timeoutPromise = function(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

const randKey = function() {
    return "notion-memcached-test-" + Math.floor(Math.random()*10000000).toString()
}

describe('memcached', () => {
    describe('timeout', () => {
        it('times out if the query does not complete in time', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211', undefined, undefined, 1)
            try {
                const result = await pool.get('ping')
                expect(true).toBe(false)
            } catch (e) {
                expect(e.message).toBe("command timed out")
            }
            await pool.end()
        })
    })

    describe('get', () => {
        it('returns null if a key is not present', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const result = await pool.get('ping')
            expect(result).toBe(null)
            await pool.end()
        })

        it('does not get expired items', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            await pool.set(key, 'foo', 1)
            await timeoutPromise(1001)
            const val = await pool.get(key)
            expect(val).toBe(null)
            await pool.end()
        })
    })

    describe('getMulti', () => {
        it('returns if a single key is not found', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            const val = await pool.getMulti(['statusKey'])
            expect(val).toStrictEqual({})
            await pool.end()
        })
        it('returns if a single key is not found, multiple hosts', async () => {
            const pool = new memcached.MemcachedPool(['localhost:11211', 'localhost:11211'])
            const key = randKey()
            const val = await pool.getMulti(['statusKey'])
            expect(val).toStrictEqual({})
            await pool.end()
        })
        it('can get multiple keys', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            await pool.set(key+"-one", 'one', 5000)
            await pool.set(key+"-three", 'three', 5000)
            await pool.set(key+"-two", 'two', 5000)
            const val = await pool.getMulti([key+"-one", key+"-two", key+"-three"])
            expect(Object.keys(val).length).toBe(3)
            expect(val[key+"-two"]).toBe('two')
            await pool.end()
        })
        it('can get keys with newlines', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            await pool.set(key+"-one", 'one\ntwo', 5000)
            await pool.set(key+"-three", 'three\nfour', 5000)
            await pool.set(key+"-two", 'five\nsix', 5000)
            const val = await pool.getMulti([key+"-one", key+"-two", key+"-three"])
            expect(Object.keys(val).length).toBe(3)
            expect(val[key+"-two"]).toBe('five\nsix')
            await pool.end()
        })
    })

    describe('set', () => {
        it('sets data', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const result = await pool.set(randKey(), 'foo', 5000)
            expect(result).toBe('STORED')
            await pool.end()
        })

        it('uses correct length for emoji data', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            await pool.set(key, '🤙 hang loose 🤙 hang loose', 5000)
            const val = await pool.get(key)
            expect(val).toBe('🤙 hang loose 🤙 hang loose')
            await pool.end()
        })

        it('sets JSON data', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            const result = await pool.set(key, {'foo': [3, 4]}, 5000)
            const val = await pool.get(key)
            expect(val).toStrictEqual({'foo': [3, 4]})
            await pool.end()
        })

        it('sets JSON array data', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            const result = await pool.set(key, ['foo', 1, 3, [7]], 5000)
            const val = await pool.get(key)
            expect(val).toStrictEqual(['foo', 1, 3, [7]])
            await pool.end()
        })

        it('can retrieve set data', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            await pool.set(key, 'foo', 5000)
            const val = await pool.get(key)
            expect(val.toString()).toBe('foo')
            await pool.end()
        })
    })

    describe('delete', () => {
        it('returns NOT_FOUND when deleting a key that does not exist', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const result = await pool.delete(randKey())
            expect(result).toBe('NOT_FOUND')
            await pool.end()
        })

        it('returns DELETED for a deleted key', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            await pool.set(key, 'foo', 5000)
            const val = await pool.delete(key)
            expect(val).toBe('DELETED')
            await pool.end()
        })

        it('deleted keys cannot be retrieved', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211')
            const key = randKey()
            await pool.set(key, 'foo', 5000)
            await pool.delete(key)
            const result = await pool.get(key)
            expect(result).toBe(null)
            await pool.end()
        })
    })

    describe('pool', () => {
        it('returns an error if a pool object is not available', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211', 1, 100)
            const client = await pool.pools[0].connect()
            try {
                await pool.pools[0].connect()
                expect(true).toBe(false) // shouldn't reach here
            } catch (e) {
                expect(e.message).toBe("timeout exceeded when trying to connect")
            }
            await client.release()
            await pool.end()
        })

        it('can reuse connection', async () => {
            const pool = new memcached.MemcachedPool('localhost:11211', 1)
            const key = randKey()
            await pool.set(key, 'foo', 5000)
            expect((await pool.get(key)).toString()).toBe('foo')
            await pool.set(key, 'bar', 5000)
            expect((await pool.get(key)).toString()).toBe('bar')
            expect((await pool.get(key)).toString()).toBe('bar')
            await pool.end()
        })

        it('can use multiple internal pools', async () => {
            const pool = new memcached.MemcachedPool(['localhost:11211', '127.0.0.1:11211'], 1)
            await pool.set(randKey(), 'foo', 5000)
            await pool.end()
        })
    })
})
