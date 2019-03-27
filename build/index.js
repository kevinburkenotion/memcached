"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var events = require("events");
var net = require("net");
var hashring = require("hashring");
var Pool = require("pg-pool");
var EOFMessageList = {
    'END': true,
    'STORED': true,
    'NOT_STORED': true,
    'NOT_FOUND': true,
    'ERROR': true,
    'EXISTS': true,
    'TOUCHED': true,
    'DELETED': true,
    'CLIENT_ERROR': true
};
var CRLF = '\r\n';
var CRLF_LENGTH = CRLF.length;
var FLAG_JSON = 1 << 1;
var FLAG_BINARY = 1 << 2;
var FLAG_NUMERIC = 1 << 3;
var Client = /** @class */ (function (_super) {
    __extends(Client, _super);
    function Client(config) {
        var _this = _super.call(this) || this;
        _this.host = config.host;
        _this.port = config.port;
        _this.socket = null;
        _this.connecting = false;
        _this.connected = false;
        if (typeof config.commandTimeoutMillis === 'number' && config.commandTimeoutMillis > 0) {
            _this.commandTimeoutMillis = config.commandTimeoutMillis;
        }
        else {
            _this.commandTimeoutMillis = 0;
        }
        return _this;
    }
    Client.prototype.connect = function (cb) {
        var _this = this;
        if (this.connecting === true || this.connected === true) {
            cb(new Error("Cannot call connect() twice on a client."));
            return;
        }
        var cbCalled = false;
        var socket = net.connect({
            host: this.host,
            port: this.port
        });
        this.connecting = true;
        socket.setNoDelay(true);
        this.socket = socket;
        var onError = function (err) {
            if (!cbCalled) {
                cbCalled = true;
            }
            cb(err);
        };
        socket.on('error', onError);
        var onTimeout = function (err) {
            if (!cbCalled) {
                cbCalled = true;
            }
            cb(err);
        };
        this.socket.on('timeout', onTimeout);
        this.socket.on('ready', function () {
            _this.connected = true;
            socket.removeListener('error', onError);
            socket.removeListener('timeout', onError);
            cbCalled = true;
            cb(null, _this);
        });
    };
    Client.prototype.hash = function () {
        return this.host + ':' + this.port.toString();
    };
    Client.prototype.end = function () {
        if (this.socket) {
            this.socket.destroy();
        }
    };
    Client.prototype.command = function (s) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.socket === null) {
                reject(new Error("cannot issue commands on null socket"));
                return;
            }
            var socket = _this.socket;
            var tid;
            if (_this.commandTimeoutMillis > 0) {
                tid = setTimeout(function () {
                    socket.removeListener('error', onError);
                    socket.removeListener('data', parseResponse);
                    reject(new Error('command timed out'));
                }, _this.commandTimeoutMillis);
            }
            var onError = function (err) {
                if (tid) {
                    clearTimeout(tid);
                }
                socket.removeListener('error', onError);
                socket.removeListener('data', parseResponse);
                socket.destroy(err);
                reject(err);
            };
            var bufs = [];
            var size = 0;
            var parseResponse = function (chunk) {
                bufs.push(chunk);
                size += chunk.length;
                if (isEOF(chunk)) {
                    socket.removeListener('error', onError);
                    socket.removeListener('data', parseResponse);
                    if (tid) {
                        clearTimeout(tid);
                    }
                    resolve(Buffer.concat(bufs, size));
                }
            };
            socket.on('data', parseResponse);
            socket.on('error', onError);
            var buf = Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from(CRLF)]);
            socket.write(buf);
        });
    };
    return Client;
}(events.EventEmitter));
var spaceChar = ' '.charCodeAt(0);
var returnChar = '\r'.charCodeAt(0);
var getCode = function (buf) {
    var idx = 0;
    while (idx < buf.length && buf[idx] !== spaceChar && buf[idx] !== returnChar) {
        idx++;
    }
    return buf.slice(0, idx).toString();
};
var isEOF = function (buffer) {
    // might not be at the beginning... if result is GET the end will be near
    // the end.
    var code = getCode(buffer);
    if (code === 'VALUE') {
        return buffer.indexOf('\r\nEND\r\n') !== -1;
    }
    return EOFMessageList[code] === true;
};
var execCommand = function (pool, command) {
    return __awaiter(this, void 0, void 0, function () {
        var client, err, result, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, pool.connect()];
                case 1:
                    client = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.command(command)];
                case 3:
                    result = _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _a.sent();
                    err = e_1;
                    return [3 /*break*/, 5];
                case 5:
                    client.release(err);
                    if (err) {
                        throw err;
                    }
                    return [2 /*return*/, result];
            }
        });
    });
};
var convertValue = function (flag, buf) {
    var result;
    switch (flag) {
        case FLAG_JSON:
            result = JSON.parse(buf.toString('utf8'));
            break;
        case FLAG_NUMERIC:
            result = +buf.toString();
            break;
        case FLAG_BINARY:
            var tmp = Buffer.alloc(buf.length);
            tmp.write(buf, 0, 'binary');
            result = tmp;
            break;
        default:
            result = buf.toString('utf8');
    }
    return result;
};
var MemcachedPool = /** @class */ (function () {
    // hosts: string or array
    function MemcachedPool(hosts, options) {
        if (typeof hosts === 'undefined') {
            hosts = ['localhost:11211'];
        }
        else if (typeof hosts === 'string') {
            hosts = [hosts];
        }
        if (!Array.isArray(hosts)) {
            throw new Error('hosts argument should be undefined, a string, or an array');
        }
        if (hosts.length === 0) {
            throw new Error('memcached: specify at least one host to connect to');
        }
        var connectionsPerHost = options.connectionsPerHost;
        if (typeof connectionsPerHost === 'undefined') {
            connectionsPerHost = 5;
        }
        var connectionTimeoutMillis = options.connectionTimeoutMillis;
        if (typeof connectionTimeoutMillis === 'undefined') {
            connectionTimeoutMillis = 30 * 1000;
        }
        var commandTimeoutMillis = options.commandTimeoutMillis;
        if (typeof commandTimeoutMillis === 'undefined') {
            commandTimeoutMillis = 30 * 1000;
        }
        // backwards compat with existing hashring implementation in
        // 3rd-Eden/memcached
        this.hashring = new hashring(hosts, 'md5', {
            compatibility: 'ketama',
            'default port': 11211
        });
        // need to reverse out the hashring logic
        this.indexMap = {};
        for (var i = 0; i < hosts.length; i++) {
            this.indexMap[hosts[i]] = i;
        }
        this.pools = [];
        for (var i = 0; i < hosts.length; i++) {
            var host = hosts[i];
            var port = 11211;
            var portIndex = host.indexOf(':');
            if (portIndex >= 0) {
                port = parseInt(host.slice(portIndex + 1), 10);
                if (isNaN(port)) {
                    throw new Error("could not parse host:port value: " + host);
                }
                host = host.slice(0, portIndex);
            }
            var config = Object.assign({ Client: Client }, {
                host: host,
                port: port,
                max: connectionsPerHost,
                min: connectionsPerHost,
                connectionTimeoutMillis: connectionTimeoutMillis,
                commandTimeoutMillis: commandTimeoutMillis
            });
            this.pools[i] = new Pool(config);
        }
    }
    MemcachedPool.prototype._getPoolIndex = function (key) {
        if (this.pools.length === 1) {
            return 0;
        }
        var rawHost = this.hashring.get(key);
        var idx = this.indexMap[rawHost];
        return idx;
    };
    MemcachedPool.prototype._getPool = function (key) {
        return this.pools[this._getPoolIndex(key)];
    };
    MemcachedPool.prototype.getMulti = function (keys) {
        return __awaiter(this, void 0, void 0, function () {
            var keysByPool, results;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        keysByPool = {};
                        keys.map(function (key) {
                            var idx = _this._getPoolIndex(key);
                            if (typeof keysByPool[idx] === 'undefined') {
                                keysByPool[idx] = [];
                            }
                            keysByPool[idx].push(key);
                        });
                        results = {};
                        return [4 /*yield*/, Promise.all(Object.entries(keysByPool).map(function (_a) {
                                var idx = _a[0], poolKeys = _a[1];
                                return __awaiter(_this, void 0, void 0, function () {
                                    var command, buffer, index, delim, meta, dataSize, resultBuf, flag;
                                    return __generator(this, function (_b) {
                                        switch (_b.label) {
                                            case 0:
                                                command = 'get ' + poolKeys.join(' ');
                                                return [4 /*yield*/, execCommand(this.pools[idx], command)];
                                            case 1:
                                                buffer = _b.sent();
                                                index = 0;
                                                while (true) {
                                                    delim = buffer.indexOf(CRLF, index);
                                                    if (delim === -1) {
                                                        throw new Error("getmulti: malformed response data: could not find CRLF or END" + buffer.slice(index).toString('utf8'));
                                                    }
                                                    meta = buffer.slice(index, delim).toString('utf8').split(' ');
                                                    if (meta[0] === 'END') {
                                                        break;
                                                    }
                                                    index = delim + CRLF_LENGTH;
                                                    dataSize = parseInt(meta[3], 10);
                                                    resultBuf = buffer.slice(index, index + dataSize).toString('utf8');
                                                    flag = parseInt(meta[2], 10);
                                                    results[meta[1]] = convertValue(flag, resultBuf);
                                                    index += dataSize + CRLF_LENGTH;
                                                }
                                                return [2 /*return*/];
                                        }
                                    });
                                });
                            }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, results];
                }
            });
        });
    };
    MemcachedPool.prototype.get = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var result, code, start, meta, resultBuf, flag;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, execCommand(this._getPool(key), 'get ' + key)];
                    case 1:
                        result = _a.sent();
                        code = getCode(result);
                        switch (code) {
                            case 'END':
                                return [2 /*return*/, null];
                            case 'ERROR':
                                throw new Error("get " + key + ": Received ERROR response from Memcached server");
                            case 'CLIENT_ERROR':
                                throw new Error("get " + key + ": got client error, check input: " + result.toString());
                            case 'VALUE':
                                start = result.indexOf(CRLF);
                                meta = result.slice(0, start).toString('utf8').split(' ');
                                start += CRLF_LENGTH;
                                resultBuf = result.slice(start, start + parseInt(meta[3], 10));
                                flag = parseInt(meta[2], 10);
                                return [2 /*return*/, convertValue(flag, resultBuf)];
                            default:
                                throw new Error("get " + key + ": unknown response " + code);
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    MemcachedPool.prototype.set = function (key, val, lifetimeSeconds) {
        return __awaiter(this, void 0, void 0, function () {
            var flag, value, valuetype, data, result, code;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        flag = 0;
                        valuetype = typeof val;
                        if (Buffer.isBuffer(val)) {
                            flag = FLAG_BINARY;
                            value = val.toString('binary');
                        }
                        else if (valuetype === 'number') {
                            flag = FLAG_NUMERIC;
                            value = val.toString();
                        }
                        else if (valuetype !== 'string') {
                            flag = FLAG_JSON;
                            value = JSON.stringify(val);
                        }
                        else {
                            value = val;
                        }
                        data = "set " + key + " " + flag + " " + lifetimeSeconds.toString() + " " + Buffer.byteLength(value) + "\r\n" + value;
                        return [4 /*yield*/, execCommand(this._getPool(key), data)];
                    case 1:
                        result = _a.sent();
                        code = getCode(result);
                        switch (code) {
                            case 'STORED':
                                return [2 /*return*/, 'STORED'
                                    // item you are trying to store with a 'cas' command has been modified
                                ];
                            // item you are trying to store with a 'cas' command has been modified
                            case 'EXISTS':
                                return [2 /*return*/, 'EXISTS'];
                            case 'NOT_STORED':
                                throw new Error("Data was not stored, but should have been (did not use add/replace to set it)");
                            case 'CLIENT_ERROR':
                                throw new Error("set " + key + ": got client error, check input: " + result.toString());
                            default:
                                throw new Error("set " + key + ": unknown response " + code);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    MemcachedPool.prototype.del = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var data, result, code;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = "delete " + key;
                        return [4 /*yield*/, execCommand(this._getPool(key), data)];
                    case 1:
                        result = _a.sent();
                        code = getCode(result);
                        switch (code) {
                            case 'DELETED':
                                return [2 /*return*/, 'DELETED'];
                            case 'NOT_FOUND':
                                return [2 /*return*/, 'NOT_FOUND'];
                            default:
                                throw new Error("delete " + key + ": unknown response " + code);
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    MemcachedPool.prototype.end = function () {
        return __awaiter(this, void 0, void 0, function () {
            var results, i;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        results = [];
                        for (i = 0; i < this.pools.length; i++) {
                            results.push(this.pools[i].end());
                        }
                        return [4 /*yield*/, Promise.all(results)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return MemcachedPool;
}());
exports.MemcachedPool = MemcachedPool;
exports["default"] = MemcachedPool;
