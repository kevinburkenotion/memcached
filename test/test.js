const expect = require('expect')

const MemcachedPool = require('..')

const timeoutPromise = function(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

describe('memcached', () => {
    describe('get', () => {
        it('returns null if a key is not present', async () => {
            const pool = new MemcachedPool('localhost:11211')
            const result = await pool.get('ping')
            expect(result).toBe(null)
            await pool.end()
        })

        it('does not get expired items', async () => {
            const pool = new MemcachedPool('localhost:11211')
            const randKey = "test-"+Math.floor(Math.random()*1000000).toString()
            await pool.set(randKey, 'foo', 1)
            await timeoutPromise(1001)
            const val = await pool.get(randKey)
            expect(val).toBe(null)
            await pool.end()
        })

        it('can get multiple keys', async () => {
            const pool = new MemcachedPool('localhost:11211')
            const randKey = "test-"+Math.floor(Math.random()*1000000).toString()
            await pool.set(randKey+"-one", 'one', 5000)
            await pool.set(randKey+"-three", 'three', 5000)
            await pool.set(randKey+"-two", 'two', 5000)
            const val = await pool.get(randKey)
            expect(val).toBe(null)
            await pool.end()
        })
    })

    describe('set', () => {
        it('sets data', async () => {
            const pool = new MemcachedPool('localhost:11211')
            const randKey = "test-"+Math.floor(Math.random()*1000000).toString()
            const result = await pool.set(randKey, 'foo', 5000)
            expect(result).toBe('STORED')
            await pool.end()
        })

        it('can retrieve set data', async () => {
            const pool = new MemcachedPool('localhost:11211')
            const randKey = "test-"+Math.floor(Math.random()*1000000).toString()
            await pool.set(randKey, 'foo', 5000)
            const val = await pool.get(randKey)
            expect(val.toString()).toBe('foo')
            await pool.end()
        })
    })

    describe('delete', () => {
        it('returns NOT_FOUND when deleting a key that does not exist', async () => {
            const pool = new MemcachedPool('localhost:11211')
            const randKey = "test-"+Math.floor(Math.random()*1000000).toString()
            const result = await pool.delete(randKey)
            expect(result).toBe('NOT_FOUND')
            await pool.end()
        })

        it('returns DELETED for a deleted key', async () => {
            const pool = new MemcachedPool('localhost:11211')
            const randKey = "test-"+Math.floor(Math.random()*1000000).toString()
            await pool.set(randKey, 'foo', 5000)
            const val = await pool.delete(randKey)
            expect(val).toBe('DELETED')
            await pool.end()
        })

        it('deleted keys cannot be retrieved', async () => {
            const pool = new MemcachedPool('localhost:11211')
            const randKey = "test-"+Math.floor(Math.random()*1000000).toString()
            await pool.set(randKey, 'foo', 5000)
            await pool.delete(randKey)
            const result = await pool.get(randKey)
            expect(result).toBe(null)
            await pool.end()
        })
    })

    describe('pool', () => {
        it('returns an error if a pool object is not available', async () => {
            const pool = new MemcachedPool('localhost:11211', 1, 100)
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
            const pool = new MemcachedPool('localhost:11211', 1)
            const randKey = "test-"+Math.floor(Math.random()*1000000).toString()
            await pool.set(randKey, 'foo', 5000)
            expect((await pool.get(randKey)).toString()).toBe('foo')
            await pool.set(randKey, 'bar', 5000)
            expect((await pool.get(randKey)).toString()).toBe('bar')
            expect((await pool.get(randKey)).toString()).toBe('bar')
            await pool.end()
        })

        it('can use multiple internal pools', async () => {
            const pool = new MemcachedPool(['localhost:11211', '127.0.0.1:11211'], 1)
            const randKey = "test-"+Math.floor(Math.random()*1000000).toString()
            await pool.set(randKey, 'foo', 5000)
            await pool.end()
        })
    })
})
