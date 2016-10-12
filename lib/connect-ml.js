/*!
 * Connect - MarkLogic
 * Copyright(c) 2016 Bruce Holt <bjholt@gmail.com>
 * MIT Licensed
 */

var debug = require('debug')('connect:ml');
var marklogic = require('marklogic');
var util = require('util');
var noop = function() {};
var qb = marklogic.queryBuilder;
/**
 * One day in seconds.
 */

var oneDay = 86400;

function getTTL(store, sess) {
    var maxAge = sess.cookie.maxAge;
    var ttl = store.ttl || (typeof maxAge === 'number' ?
        Math.floor(maxAge / 1000) :
        oneDay);
    return Date.now() + ttl * 1000;
}

/**
 * Return the `MlStore` extending `express`'s session Store.
 *
 * @param {object} express session
 * @return {Function}
 * @api public
 */

module.exports = function(session) {

    /**
     * Express's session Store.
     */

    var Store = session.Store;

    /**
     * Initialize MlStore with the given `options`.
     *
     * @param {Object} options
     * @api public
     */

    function MlStore(options) {
        if (!(this instanceof MlStore)) {
            throw new TypeError('Cannot call MlStore constructor as a function');
        }

        var self = this;

        options = options || {};
        Store.call(this, options);
        this.prefix = options.prefix == null ?
            '/sess/' :
            options.prefix;

        delete options.prefix;

        this.serializer = options.serializer || JSON;

        this.client = options.client;

        // logErrors
        if (options.logErrors) {
            // if options.logErrors is function, allow it to override. else provide default logger. useful for large scale deployment
            // which may need to write to a distributed log
            if (typeof options.logErrors != 'function') {
                options.logErrors = function(err) {
                    console.error('Warning: connect-ml reported a client error: ' + err);
                };
            }
            this.client.setLogger(options.logErrors, true);
        }

        this.ttl = options.ttl;
        this.pruneSessionInterval = 60 * 1000;
        setImmediate(function() {
            this.pruneSessions();
        }.bind(this));
    }

    /**
     * Inherit from `Store`.
     */

    util.inherits(MlStore, Store);

    /**
     * Attempt to fetch all sessions
     * @param {Function} fn
     * @api public
     */

    MlStore.prototype.all = function(fn) {
        var store = this;
        var query = qb.where(qb.directory(store.prefix, true));
        if (!fn) fn = noop;
        store.client.documents.query(query).result(function(data) {
            debug(data);
            fn(null, data);
        }, function(err) {
            fn(err);
        });
    }

    /**
     * Attempt to clear all sessions
     * @param {Function} fn
     * @api public
     */

    MlStore.prototype.clear = function(fn) {
        var store = this;
        if (!fn) fn = noop;
        debug('CLEAR all docs');
        store.client.documents.removeAll({
            directory: store.prefix
        }).result(
            function(response) {
                fn(null);
            },
            function(err) {
                fn(err);
            }
        );
    }

    /**
     * A count of all sessions
     * @param {Function} fn
     * @api public
     */

    MlStore.prototype.length = function(fn) {
        var store = this;
        var query = qb.where(qb.directory(store.prefix, true));
        if (!fn) fn = noop;
        store.client.documents.query(query).result(function(data) {
            debug(data.length);
            fn(null, data.length);
        }, function(err) {
            fn(err);
        });
    }

    /**
     * Attempt to fetch session by the given `sid`.
     *
     * @param {String} sid
     * @param {Function} fn
     * @api public
     */

    MlStore.prototype.get = function(sid, fn) {
        var store = this;
        var psid = store.prefix + sid + '.json';
        if (!fn) fn = noop;
        debug('GET "%s"', sid);

        store.client.documents.read(psid).result(
            function(data) {
                debug(data);
                if (data.length > 0) {
                    return fn(null, data[0].content);
                } else {
                    return fn(null, null);
                }
            },
            function(err) {
                return fn(err);
            }
        );
    };

    /**
     * Commit the given `sess` object associated with the given `sid`.
     *
     * @param {String} sid
     * @param {Session} sess
     * @param {Function} fn
     * @api public
     */

    MlStore.prototype.set = function(sid, sess, fn) {
        var store = this;
        var psid = store.prefix + sid + '.json';
        if (!fn) fn = noop;
        sess._mlttl = getTTL(store, sess);
        debug('SET %s', psid);
        store.client.documents.write({
            uri: psid,
            contentType: 'application/json',
            content: sess
        }).result(function() {
            fn(null);
        }, function(err) {
            fn(err);
        });
    };

    /**
     * Destroy the session associated with the given `sid`.
     *
     * @param {String} sid
     * @api public
     */

    MlStore.prototype.destroy = function(sid, fn) {
        var psid = this.prefix + sid + '.json';
        debug('DEL "%s"', psid);
        this.client.documents.remove(psid).result(function(doc) {
            fn(null);
        }, function(err) {
            fn(err);
        });
    };

    /**
     * Refresh the time-to-live for the session with the given `sid`.
     *
     * @param {String} sid
     * @param {Session} sess
     * @param {Function} fn
     * @api public
     */

    MlStore.prototype.touch = function(sid, sess, fn) {
        var store = this;
        var psid = store.prefix + sid + '.json';
        var pb = marklogic.patchBuilder;
        var ttl = getTTL(store, sess);
        if (!fn) fn = noop;

        debug('EXPIRE "%s" ttl:%s', psid, ttl);
        store.client.documents.patch(psid, pb.replace('/_mlttl', ttl)).result();
        fn(null);
    };


    /**
     * Does garbage collection for expired session in the database
     *
     * @access public
     */
    MlStore.prototype.pruneSessions = function(fn) {
        var store = this;
        debug('PRUNING');
        store.client.documents.query(qb.where(qb.byExample({
                _mlttl: {
                    $lt: Date.now()
                },
                $filtered: true
            })))
            .result(function(results) {
                var uris = [];
                results.forEach(function(item) {
                    uris.push(item.uri);
                });
                if (uris.length > 0) {
                    debug(uris);
                    store.client.documents.remove(uris).result();
                }
            }, function(err) {
                return fn(err);
            });

        if (store.pruneSessionInterval) {
            store.pruneTimer = setTimeout(store.pruneSessions.bind(store, true), store.pruneSessionInterval);
        }
    };

    return MlStore;
};