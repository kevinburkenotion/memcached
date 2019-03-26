const expect = require('expect')

const MemcachedPool = require('..')

describe('memcached', () => {
    describe('get', () => {
        it('makes get requests', async () => {
            const pool = new MemcachedPool('localhost', 11211)
            const result = await pool.get('ping')
            expect(result.toString()).toBe('END\r\n')
            await pool.end()
        })
    })
})
