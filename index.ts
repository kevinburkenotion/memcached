import * as events from "events"
import * as net from "net"

import * as hashring from "hashring"
import * as Pool from "pg-pool"

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
	private host: string
	private port: number
	private socket: net.Socket|null
	private connecting: boolean
	private connected: boolean
	private commandTimeoutMillis: number

	constructor(config) {
		super()
		this.host = config.host
		this.port = config.port
		this.socket = null
		this.connecting = false
		this.connected = false
		if (typeof config.commandTimeoutMillis === 'number' && config.commandTimeoutMillis > 0) {
			this.commandTimeoutMillis = config.commandTimeoutMillis
		} else {
			this.commandTimeoutMillis = 0
		}
	}

	connect(cb) {
		if (this.connecting === true || this.connected === true) {
			cb(new Error("Cannot call connect() twice on a client."))
			return
		}
		let cbCalled = false
		const socket = net.connect({
			host: this.host,
			port: this.port,
		})
		this.connecting = true
		socket.setNoDelay(true)
		this.socket = socket
		const onError = (err) => {
			if (!cbCalled) {
				cbCalled = true
			}
			cb(err)
		}
		socket.on('error', onError)
		const onTimeout = (err) => {
			if (!cbCalled) {
				cbCalled = true
			}
			cb(err)
		}
		this.socket.on('timeout', onTimeout)
		this.socket.on('ready', () => {
			this.connected = true
			socket.removeListener('error', onError)
			socket.removeListener('timeout', onError)
			cbCalled = true
			cb(null, this)
		})
	}

	end() {
		if (this.socket) {
			this.socket.destroy()
		}
	}

	command(s) {
		return new Promise((resolve, reject) => {
			if (this.socket === null) {
				reject(new Error("cannot issue commands on null socket"))
				return
			}
			const socket = this.socket
			let tid
			if (this.commandTimeoutMillis > 0) {
				tid = setTimeout(() => {
					socket.removeListener('error', onError)
					socket.removeListener('data', parseResponse)
					reject(new Error('command timed out'))
				}, this.commandTimeoutMillis)
			}
			const onError = (err) => {
				if (tid) {
					clearTimeout(tid)
				}
				socket.removeListener('error', onError)
				socket.removeListener('data', parseResponse)
				socket.destroy(err)
				reject(err)
			}
			const bufs: Buffer[] = []
			let size = 0
			const parseResponse = (chunk) => {
				bufs.push(chunk)
				size += chunk.length
				if (isEOF(chunk)) {
					socket.removeListener('error', onError)
					socket.removeListener('data', parseResponse)
					if (tid) {
						clearTimeout(tid)
					}
					resolve(Buffer.concat(bufs, size))
				}
			}
			socket.on('data', parseResponse)
			socket.on('error', onError)
			let buf = Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from(CRLF)])
			socket.write(buf)
		})
	}
}


const spaceChar = ' '.charCodeAt(0)
const returnChar = '\r'.charCodeAt(0)

const getCode = function(buf: Buffer): string {
	let idx = 0;
	while (idx < buf.length && buf[idx] !== spaceChar && buf[idx] !== returnChar) {
		idx++
	}
	return buf.slice(0, idx).toString()
}

const isEOF = function(buffer: Buffer): boolean {
	// might not be at the beginning... if result is GET the end will be near
	// the end.
	const code = getCode(buffer)
	if (code === 'VALUE') {
		return buffer.indexOf('\r\nEND\r\n') !== -1
	}
	return EOFMessageList[code] === true
}

const execCommand = async function(pool: Pool, command: string): Promise<Buffer> {
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
			const tmp: Buffer = Buffer.alloc(buf.length);
			tmp.write(buf, 0, 'binary');
			result = tmp;
			break;
		default:
			result = buf.toString('utf8')
	}
	return result
}

interface poolOptions {
	// defaults to 5
	connectionsPerHost: number|undefined
	// defaults to 30 seconds
	connectionTimeoutMillis: number|undefined
	// defaults to 30 seconds
	commandTimeoutMillis: number|undefined
}

class MemcachedPool {
	private indexMap: { [s: string]: number; }
	private pools: Pool[]
	private hashring: hashring

	// hosts: string or array
	constructor(hosts: string|string[]|undefined, options: poolOptions) {
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
		let connectionsPerHost = options.connectionsPerHost
		if (typeof connectionsPerHost === 'undefined') {
			connectionsPerHost = 5
		}
		let connectionTimeoutMillis = options.connectionTimeoutMillis
		if (typeof connectionTimeoutMillis === 'undefined') {
			connectionTimeoutMillis = 30*1000
		}
		let commandTimeoutMillis = options.commandTimeoutMillis
		if (typeof commandTimeoutMillis === 'undefined') {
			commandTimeoutMillis = 30*1000
		}
		// backwards compat with existing hashring implementation in
		// 3rd-Eden/memcached
		this.hashring = new hashring(hosts, 'md5', {
			compatibility: 'ketama',
			'default port': 11211,
		});
		// need to reverse out the hashring logic
		this.indexMap = {}
		for (var i = 0; i < hosts.length; i++) {
			this.indexMap[hosts[i]] = i
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

	_getPoolIndex(key): number {
		if (this.pools.length === 1) {
			return 0
		}
		const rawHost = this.hashring.get(key)
		const idx = this.indexMap[rawHost]
		return idx
	}

	_getPool(key): Pool {
		return this.pools[this._getPoolIndex(key)]
	}

	async getMulti(keys: string[]): Promise<object> {
		let keysByPool: {[i: number]: string[]; } = {}
		keys.map((key) => {
			const idx = this._getPoolIndex(key)
			if (typeof keysByPool[idx] === 'undefined') {
				keysByPool[idx] = []
			}
			keysByPool[idx].push(key)
		})
		const results = {};
		await Promise.all(Object.entries(keysByPool).map(async ([idx, poolKeys]) => {
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

	async set(key: string, val: Buffer|number|string|object, lifetimeSeconds: number): Promise<string> {
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
	}

	async del(key: string) {
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

	async end(): Promise<void> {
		let results: any = []
		for (var i = 0; i < this.pools.length; i++) {
			results.push(this.pools[i].end())
		}
		await Promise.all(results)
		return
	}
}

exports.MemcachedPool = MemcachedPool
exports.default = MemcachedPool
