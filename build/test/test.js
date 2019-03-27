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
var _this = this;
var expect = require('expect');
var memcached = require('..');
var timeoutPromise = function (ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
};
var randKey = function () {
    return "notion-memcached-test-" + Math.floor(Math.random() * 10000000).toString();
};
describe('memcached', function () {
    describe('timeout', function () {
        it('times out if the query does not complete in time', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, result, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211', undefined, undefined, 1);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, pool.get('ping')];
                    case 2:
                        result = _a.sent();
                        expect(true).toBe(false);
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _a.sent();
                        expect(e_1.message).toBe("command timed out");
                        return [3 /*break*/, 4];
                    case 4: return [4 /*yield*/, pool.end()];
                    case 5:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('get', function () {
        it('returns null if a key is not present', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        return [4 /*yield*/, pool.get('ping')];
                    case 1:
                        result = _a.sent();
                        expect(result).toBe(null);
                        return [4 /*yield*/, pool.end()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('does not get expired items', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.set(key, 'foo', 1)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, timeoutPromise(1001)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, pool.get(key)];
                    case 3:
                        val = _a.sent();
                        expect(val).toBe(null);
                        return [4 /*yield*/, pool.end()];
                    case 4:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('getMulti', function () {
        it('returns if a single key is not found', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.getMulti(['statusKey'])];
                    case 1:
                        val = _a.sent();
                        expect(val).toStrictEqual({});
                        return [4 /*yield*/, pool.end()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('returns if a single key is not found, multiple hosts', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool(['localhost:11211', 'localhost:11211']);
                        key = randKey();
                        return [4 /*yield*/, pool.getMulti(['statusKey'])];
                    case 1:
                        val = _a.sent();
                        expect(val).toStrictEqual({});
                        return [4 /*yield*/, pool.end()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('can get multiple keys', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.set(key + "-one", 'one', 5000)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, pool.set(key + "-three", 'three', 5000)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, pool.set(key + "-two", 'two', 5000)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, pool.getMulti([key + "-one", key + "-two", key + "-three"])];
                    case 4:
                        val = _a.sent();
                        expect(Object.keys(val).length).toBe(3);
                        expect(val[key + "-two"]).toBe('two');
                        return [4 /*yield*/, pool.end()];
                    case 5:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('can get keys with newlines', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.set(key + "-one", 'one\ntwo', 5000)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, pool.set(key + "-three", 'three\nfour', 5000)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, pool.set(key + "-two", 'five\nsix', 5000)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, pool.getMulti([key + "-one", key + "-two", key + "-three"])];
                    case 4:
                        val = _a.sent();
                        expect(Object.keys(val).length).toBe(3);
                        expect(val[key + "-two"]).toBe('five\nsix');
                        return [4 /*yield*/, pool.end()];
                    case 5:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('set', function () {
        it('sets data', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        return [4 /*yield*/, pool.set(randKey(), 'foo', 5000)];
                    case 1:
                        result = _a.sent();
                        expect(result).toBe('STORED');
                        return [4 /*yield*/, pool.end()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('uses correct length for emoji data', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.set(key, '🤙 hang loose 🤙 hang loose', 5000)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, pool.get(key)];
                    case 2:
                        val = _a.sent();
                        expect(val).toBe('🤙 hang loose 🤙 hang loose');
                        return [4 /*yield*/, pool.end()];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('sets JSON data', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, result, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.set(key, { 'foo': [3, 4] }, 5000)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, pool.get(key)];
                    case 2:
                        val = _a.sent();
                        expect(val).toStrictEqual({ 'foo': [3, 4] });
                        return [4 /*yield*/, pool.end()];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('sets JSON array data', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, result, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.set(key, ['foo', 1, 3, [7]], 5000)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, pool.get(key)];
                    case 2:
                        val = _a.sent();
                        expect(val).toStrictEqual(['foo', 1, 3, [7]]);
                        return [4 /*yield*/, pool.end()];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('can retrieve set data', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.set(key, 'foo', 5000)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, pool.get(key)];
                    case 2:
                        val = _a.sent();
                        expect(val.toString()).toBe('foo');
                        return [4 /*yield*/, pool.end()];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('del', function () {
        it('returns NOT_FOUND when deleting a key that does not exist', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        return [4 /*yield*/, pool.del(randKey())];
                    case 1:
                        result = _a.sent();
                        expect(result).toBe('NOT_FOUND');
                        return [4 /*yield*/, pool.end()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('returns DELETED for a deleted key', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, val;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.set(key, 'foo', 5000)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, pool.del(key)];
                    case 2:
                        val = _a.sent();
                        expect(val).toBe('DELETED');
                        return [4 /*yield*/, pool.end()];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('deleted keys cannot be retrieved', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211');
                        key = randKey();
                        return [4 /*yield*/, pool.set(key, 'foo', 5000)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, pool.get(key)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, pool.get(key)];
                    case 3:
                        result = _a.sent();
                        expect(result).toBe(null);
                        return [4 /*yield*/, pool.end()];
                    case 4:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('pool', function () {
        it('returns an error if a pool object is not available', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, client, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211', 1, 100);
                        return [4 /*yield*/, pool.pools[0].connect()];
                    case 1:
                        client = _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, pool.pools[0].connect()];
                    case 3:
                        _a.sent();
                        expect(true).toBe(false); // shouldn't reach here
                        return [3 /*break*/, 5];
                    case 4:
                        e_2 = _a.sent();
                        expect(e_2.message).toBe("timeout exceeded when trying to connect");
                        return [3 /*break*/, 5];
                    case 5: return [4 /*yield*/, client.release()];
                    case 6:
                        _a.sent();
                        return [4 /*yield*/, pool.end()];
                    case 7:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('can reuse connection', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool, key, _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        pool = new memcached.MemcachedPool('localhost:11211', 1);
                        key = randKey();
                        return [4 /*yield*/, pool.set(key, 'foo', 5000)];
                    case 1:
                        _d.sent();
                        _a = expect;
                        return [4 /*yield*/, pool.get(key)];
                    case 2:
                        _a.apply(void 0, [(_d.sent()).toString()]).toBe('foo');
                        return [4 /*yield*/, pool.set(key, 'bar', 5000)];
                    case 3:
                        _d.sent();
                        _b = expect;
                        return [4 /*yield*/, pool.get(key)];
                    case 4:
                        _b.apply(void 0, [(_d.sent()).toString()]).toBe('bar');
                        _c = expect;
                        return [4 /*yield*/, pool.get(key)];
                    case 5:
                        _c.apply(void 0, [(_d.sent()).toString()]).toBe('bar');
                        return [4 /*yield*/, pool.end()];
                    case 6:
                        _d.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('can use multiple internal pools', function () { return __awaiter(_this, void 0, void 0, function () {
            var pool;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pool = new memcached.MemcachedPool(['localhost:11211', '127.0.0.1:11211'], 1);
                        return [4 /*yield*/, pool.set(randKey(), 'foo', 5000)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, pool.end()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
});
