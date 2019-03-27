const net = require('net')
const events = require('events')

const Pool = require('pg-pool')

const EOFMessageList = {
    'END': true,
    'STORED': true,
    'NOT_STORED': true,
    'NOT_FOUND': true,
    'ERROR': true,
    'EXISTS': true,
    'TOUCHED': true,
    'DELETED': true,
};

const CRLF = '\r\n';
const CRLF_LENGTH = CRLF.length;

class Client extends events.EventEmitter {
    constructor(config) {
        super()
        this.host = config.host
        this.port = config.port
        this.socket = null
    }

    connect(cb) {
        let cbCalled = false
        this.socket = net.connect({
            host: this.host,
            port: this.port,
        })
        this.socket.setNoDelay(true)
        const onError = (err) => {
            if (!cbCalled) {
                cbCalled = true
            }
            cb(err)
        }
        this.socket.on('error', onError)
        const onTimeout = (err) => {
            if (!cbCalled) {
                cbCalled = true
            }
            cb(err)
        }
        this.socket.on('timeout', onTimeout)
        this.socket.on('ready', () => {
            this.socket.removeListener('error', onError)
            this.socket.removeListener('timeout', onError)
            cbCalled = true
            cb(null, this)
        })
    }

    end() {
        this.socket.destroy()
    }

    command(s) {
        return new Promise((resolve, reject) => {
            const onError = (err) => {
                this.socket.removeListener('error', onError)
                this.socket.removeListener('data', parseResponse)
                this.socket.destroy(err)
                reject(err)
            }
            const bufs = []
            let size = 0
            const parseResponse = (chunk) => {
                bufs.push(chunk)
                size += chunk.length
                if (isEOF(chunk)) {
                    this.socket.removeListener('error', onError)
                    this.socket.removeListener('data', parseResponse)
                    resolve(Buffer.concat(bufs, size))
                }
            }
            this.socket.on('data', parseResponse)
            this.socket.on('error', onError)
            let buf = Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from(CRLF)])
            this.socket.write(buf)
        })
    }
}


const poolFactory = (Client) => {
  var BoundPool = function (options) {
    var config = Object.assign({ Client: Client }, options)
    return new Pool(config)
  }

  util.inherits(BoundPool, Pool)

  return BoundPool
}

const spaceChar = ' '.charCodeAt(0)
const returnChar = '\r'.charCodeAt(0)

const getCode = function(buf) {
    let idx = 0;
    while (idx < buf.length && buf[idx] !== spaceChar && buf[idx] !== returnChar) {
        idx++
    }
    return buf.slice(0, idx).toString()
}

const isEOF = function(buffer) {
    // might not be at the beginning... if result is GET the end will be near
    // the end.
    const code = getCode(buffer)
    if (code === 'VALUE') {
        return buffer.indexOf('\r\nEND\r\n') !== -1
    }
    return EOFMessageList[code] === true
}

module.exports = class MemcachedPool {
    // hosts: string or array
    constructor(hosts, connectionsPerHost, connectionTimeoutMillis) {
        if (typeof hosts === 'undefined') {
            hosts = ['localhost:11211']
        } else if (typeof hosts === 'string') {
            hosts = [hosts]
        }
        if (typeof connectionsPerHost === 'undefined') {
            connectionsPerHost = 5
        }
        // backwards compat with existing hashring implementation in
        // 3rd-Eden/memcached
        this.hashring = new hashring.HashRing(hosts, 'md5', {
            compatibility: 'ketama',
            'default port': 11211,
        });
        this.pools = []
        for (var i = 0; i < hosts.length; i++) {
            let host = hosts[i];
            let port = 11211;
            let portIndex = host.indexOf(':')
            if (portIndex >= 0) {
                port = parseInt(host.slice(portIndex+1), 10)
                if (isNaN(port)) {
                    throw new Error("could not parse host:port value: " + host)
                }
                host = host.slice(0, portIndex)
            }
            var config = Object.assign({Client: Client}, {
                host: host,
                port: port,
                max: connectionsPerHost,
                min: connectionsPerHost,
                connectionTimeoutMillis: connectionTimeoutMillis,
            })
            this.pools[i] = new Pool(config)
        }
    }

    _getPool(key) {
        if (this.pools.length === 1) {
            return this.pools[0]
        }
    }

    async get(key) {
        const client = await this._getPool(key).connect()
        const result = await client.command('get ' + key)
        await client.release()
        const code = getCode(result)
        switch (code) {
            case 'END':
                return null
            case 'ERROR':
                throw new Error(`get ${key}: Received ERROR response from Memcached server`)
            case 'CLIENT_ERROR':
                throw new Error(`get ${key}: got client error, check input: ${result.toString()}`)
            case 'VALUE':
                let start = result.indexOf(CRLF);
                const meta = result.slice(0, start).toString('utf8').split(' ');
                start += CRLF_LENGTH;
                const value = result.slice(start, start + parseInt(meta[3], 10));
                return value
            default:
                throw new Error(`get ${key}: unknown response ${code}`)
        }
        return result
    }

    async set(key, val, lifetimeSeconds) {
        const client = await this._getPool(key).connect()
        const data = `set ${key} 0 ${lifetimeSeconds.toString()} ${val.length}\r\n${val}`
        const result = await client.command(data)
        await client.release()
        const code = getCode(result)
        switch (code) {
            case 'STORED':
                return 'STORED'
            // item you are trying to store with a 'cas' command has been modified
            case 'EXISTS':
                return 'EXISTS'
            case 'NOT_STORED':
                throw new Error(`Data was not stored, but should have been (did not use add/replace to set it)`)
            case 'CLIENT_ERROR':
                throw new Error(`set ${key}: got client error, check input: ${result.toString()}`)
            default:
                throw new Error(`set ${key}: unknown response ${code}`)
        }
        return result
    }

    async delete(key) {
        const client = await this._getPool(key).connect()
        const data = `delete ${key}`
        const result = await client.command(data)
        await client.release()
        const code = getCode(result)
        switch (code) {
            case 'DELETED':
                return 'DELETED'
            case 'NOT_FOUND':
                return 'NOT_FOUND'
            default:
                throw new Error(`delete ${key}: unknown response ${code}`)
        }
        return result
    }

    async end() {
        let results = []
        for (var i = 0; i < this.pools.length; i++) {
            results.push(this.pools[i].end())
        }
        return Promise.all(results)
    }
}
