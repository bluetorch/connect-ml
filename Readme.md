# connect-ml

[MarkLogic](http://www.marklogic.com) session store for [Express](http://expressjs.com/) and [Connect](https://github.com/senchalabs/connect).
Also you can use it with [Koa](http://koajs.com/)

MarkLogic session store is a provision for storing session data as json in MarkLogic Server

## Compatibility

* Supports Express `>= 4.x` and Connect `>= 1.4.0` through [express-session][express-session-url]
* Supports [Node.js][node-url] `>= 0.10` and [io.js][io-url]
* Indirectly supports Koa `>= 0.9.0` through [express-session][express-session-url]

## Getting Started

### Installation

    $ npm install connect-ml

  - `prefix`    The directory where the session files will be stored. Defaults to `/sess/`
  - `client`    The marklogic [DatabaseClient](http://docs.marklogic.com/jsdoc/DatabaseClient.html) instance.
  - `logErrors` The function for logging errors
  - `ttl`       Session time to live in seconds. Defaults to 86400 (24 hours)

## Usage

### Express or Connect integration

Due to express `>= 4` changes, we need to pass `express-session` to the function `connect-ml` exports in order to extend `session.Store`:

```js
var session = require('express-session');
var marklogic = require('marklogic');
var MlStore = require('connect-ml')(session);
var db = marklogic.createDatabaseClient(connInfo);

app.use(session({
    store: new MlStore({
        client: db
    }),
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true
}));
```

[node-url]: http://nodejs.org/download/
[express-session-url]: https://github.com/expressjs/session
[io-url]: https://iojs.org