const net = require('net')
const events = require('events')

const Pool = require('pg-pool')

const EOFMessageList = [
    'END',
    'STORED',
    'NOT_STORED',
    'NOT_FOUND',
    'ERROR',
    'EXISTS',
    'TOUCHED',
    'DELETED',
];

const CRLF = '\r\n';
const CRLF_LENGTH = CRLF.length;

const isEOF = function(buffer) {
    for (var i = 0; i < EOFMessageList.length; i++) {
        const msg = EOFMessageList[i]
        const index = buffer.indexOf(msg);
        if (index === -1) {
            continue
        }
        if (index + msg.length + CRLF_LENGTH === buffer.length) {
            return true
        }
    }
    return false
}

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
        this.socket.on('error', (err) => {
            if (!cbCalled) {
                cbCalled = true
            }
            cb(err)
        })
        this.socket.on('timeout', (err) => {
            if (!cbCalled) {
                cbCalled = true
            }
            cb(err)
        })
        this.socket.on('ready', () => {
            cbCalled = true
            cb(null, this)
        })
    }

    release(done) {
        console.log('releasing')
        this.socket.destroy(done)
    }

    end() {
        this.socket.destroy()
    }

    command(s) {
        return new Promise((resolve, reject) => {
            const bufs = []
            let size = 0
            const parseResponse = (chunk) => {
                bufs.push(chunk)
                size += chunk.length
                if (isEOF(chunk)) {
                    this.socket.removeListener('data', parseResponse)
                    resolve(Buffer.concat(bufs, size))
                }
            }
            this.socket.on('data', parseResponse)
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

module.exports = class MemcachedPool {
    constructor(host, port) {
        var config = Object.assign({Client: Client}, {host: host, port: port})
        this.pool = new Pool(config)
    }

    async get(key) {
        const client = await this.pool.connect()
        const result = await client.command('get ' + key)
        await client.release()
        return result
    }

    async end() {
        return this.pool.end()
    }
}
