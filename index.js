const net = require('net')
const events = require('events')

const hashring = require('hashring')
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
    'CLIENT_ERROR': true,
};

const CRLF = '\r\n';
const CRLF_LENGTH = CRLF.length;

const FLAG_JSON = 1<<1
const FLAG_BINARY = 1<<2
const FLAG_NUMERIC = 1<<3;

class Client extends events.EventEmitter {
    constructor(config) {
        super()
        this.host = config.host
        this.port = config.port
        this.socket = null
        this.activeQuery = null
        this.connected = false
        this.commandTimeoutMillis = config.commandTimeoutMillis
    }

    connect(cb) {
        if (this.connected === true) {
            cb(new Error("Cannot call connect() twice on a client."))
            return
        }
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
            this.connected = true
            this.socket.removeListener('error', onError)
            this.socket.removeListener('timeout', onError)
            cbCalled = true
            cb(null, this)
        })
    }

    hash() {
        return this.host + ':' + this.port.toString()
    }

    end() {
        this.socket.destroy()
    }

    command(s) {
        return new Promise((resolve, reject) => {
            let tid
            if (this.commandTimeoutMillis > 0) {
                tid = setTimeout(() => {
                    this.socket.removeListener('error', onError)
                    this.socket.removeListener('data', parseResponse)
                    reject(new Error('command timed out'))
                }, this.commandTimeoutMillis)
            }
            const onError = (err) => {
                if (tid) {
                    clearTimeout(tid)
                }
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
                    if (tid) {
                        clearTimeout(tid)
                    }
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

const execCommand = async function(pool, command) {
    const client = await pool.connect()
    let err, result
    try {
        result = await client.command(command)
    } catch (e) {
        err = e
    }
    client.release(err)
    if (err) {
        throw err
    }
    return result
}

const convertValue = function(flag, buf) {
    let result;
    switch (flag) {
        case FLAG_JSON:
            result = JSON.parse(buf.toString('utf8'));
            break;
        case FLAG_NUMERIC:
            result = +buf.toString();
            break;
        case FLAG_BINARY:
            tmp = new Buffer(buf.length);
            tmp.write(buf, 0, 'binary');
            result = tmp;
            break;
        default:
            result = buf.toString('utf8')
    }
    return result
}

class MemcachedPool {
    // hosts: string or array
    constructor(hosts, connectionsPerHost, connectionTimeoutMillis, commandTimeoutMillis) {
        if (typeof hosts === 'undefined') {
            hosts = ['localhost:11211']
        } else if (typeof hosts === 'string') {
            hosts = [hosts]
        }
        if (!Array.isArray(hosts)) {
            throw new Error('hosts argument should be undefined, a string, or an array')
        }
        if (hosts.length === 0) {
            throw new Error('memcached: specify at least one host to connect to')
        }
        if (typeof connectionsPerHost === 'undefined') {
            connectionsPerHost = 5
        }
        // backwards compat with existing hashring implementation in
        // 3rd-Eden/memcached
        this.hashring = new hashring(hosts, 'md5', {
            compatibility: 'ketama',
            'default port': 11211,
        });
        // need to reverse out the hashring logic
        this._indexMap = {}
        for (var i = 0; i < hosts.length; i++) {
            this._indexMap[hosts[i]] = i
        }
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
                commandTimeoutMillis: commandTimeoutMillis,
            })
            this.pools[i] = new Pool(config)
        }
    }

    _getPoolIndex(key) {
        if (this.pools.length === 1) {
            return 0
        }
        const rawHost = this.hashring.get(key)
        const idx = this._indexMap[rawHost]
        return idx
    }

    _getPool(key) {
        return this.pools[this._getPoolIndex(key)]
    }

    async getMulti(keys) {
        let keysByPool = {}
        keys.map((key) => {
            const idx = this._getPoolIndex(key)
            if (typeof keysByPool[idx] === 'undefined') {
                keysByPool[idx] = []
            }
            keysByPool[idx].push(key)
        })
        const results = {};
        await Promise.all(Object.entries(keysByPool).map(async (entry) => {
            const idx = entry[0]
            const poolKeys = entry[1]
            const command = 'get ' + poolKeys.join(' ')
            const buffer = await execCommand(this.pools[idx], command)
            let index = 0;

            while (true) {
                const delim = buffer.indexOf(CRLF, index);
                if (delim === -1) {
                    throw new Error("getmulti: malformed response data: could not find CRLF or END" + buffer.slice(index).toString('utf8'))
                }
                const meta = buffer.slice(index, delim).toString('utf8').split(' ');
                if (meta[0] === 'END') {
                    break;
                }
                index = delim + CRLF_LENGTH;
                const dataSize = parseInt(meta[3], 10);
                const resultBuf = buffer.slice(index, index + dataSize).toString('utf8')
                const flag = parseInt(meta[2], 10)
                results[meta[1]] = convertValue(flag, resultBuf)
                index += dataSize + CRLF_LENGTH;
            }
        }))
        return results
    }

    async get(key) {
        const result = await execCommand(this._getPool(key), 'get ' + key)
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
                const resultBuf = result.slice(start, start + parseInt(meta[3], 10));
                const flag = parseInt(meta[2], 10)
                return convertValue(flag, resultBuf)
            default:
                throw new Error(`get ${key}: unknown response ${code}`)
        }
        return result
    }

    async set(key, val, lifetimeSeconds) {
        let flag = 0
        let value;
        const valuetype = typeof val
        if (Buffer.isBuffer(val)) {
            flag = FLAG_BINARY;
            value = val.toString('binary');
        } else if (valuetype === 'number') {
            flag = FLAG_NUMERIC;
            value = val.toString();
        } else if (valuetype !== 'string') {
            flag = FLAG_JSON;
            value = JSON.stringify(val);
        } else {
            value = val
        }
        const data = `set ${key} ${flag} ${lifetimeSeconds.toString()} ${Buffer.byteLength(value)}\r\n${value}`
        const result = await execCommand(this._getPool(key), data)
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
        const data = `delete ${key}`
        const result = await execCommand(this._getPool(key), data)
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

exports.MemcachedPool = MemcachedPool
exports.default = MemcachedPool
