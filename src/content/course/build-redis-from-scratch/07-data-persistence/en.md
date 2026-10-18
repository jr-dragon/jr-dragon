---
title: "[Day 7] Data Persistence"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

We have a TCP server supports RESP2 and `PING`, `GET` and `SET` Redis commands.

However, when the server is restarted, all of data will be reset because data is stored in memory by `repo.mapStorage{}`.

## Data Persistence in Redis

Ther're 2 methods to keep data persistence in Redis:
- Append Only File (AOF): a log file write all commands which changes storage in RESP commands.
- Redis Databae (RDB): a snapshot of storage at point-in-time.

I choosed AOF because it is easier to implement. (Maybe I'll add RDB as appendix in future.)

### AOF Format

The content of AOF is raw RESP marshaled bytes:

```shell
$ redis-cli -p 16879 SET foo bar
OK
$ cat database.aof
*3
$3
set
$3
foo
$3
bar
$ xxd database.aof
00000000: 2a33 0d0a 2433 0d0a 7365 740d 0a24 330d  *3..$3..set..$3.
00000010: 0a66 6f6f 0d0a 2433 0d0a 6261 720d 0a    .foo..$3..bar..
```

The logic is clear: when a storage changes Redis command execute successful, append RESP mashaled bytes into AOF.

### AOF Reader and Writer

```go {./internal/service/aof.go#L1-L55}(d8d36351fce4811bd305e82ec2deb24555fc9486)
```

## Integrate AOF with Middleware

[Middleware](https://en.wikipedia.org/wiki/Middleware) is an useful design pattern for a request-response model, such as HTTP server.

Middleware patttern in Go usually shows as function with handler, add `HandlerFunc` and `Middleware` type in `internal/server/handler.go`:

```go {./internal/server/handler.go#L22-L38}(8c47e4a97113f230f503a7ee694fdebcf45c1aaa)
```

### Add AOFMiddleware constructor

Add `NewAOFMiddleware()` constructor in `internal/server/middleware.go`:

```go {./internal/server/middleware.go#L1-L24}(369406d219d25205081734d89ea35df155064d0d)
```

### Register Middleware in `App{}`

```go {./cmd/olivine/app.go#L16-L25}(369406d219d25205081734d89ea35df155064d0d)
```

## Restore from AOF when server startup

### `Restorer{}` interface and `aofRestorer{}` implementation

I'm going to add RDB support in future, define a `Restorer{}` interface for `aofRestorer{}` and `rdbRestorer{}` implementations is better.

```go {./internal/server/restorer.go#L1-L38}(462824f2596cbd444f71ac0b0179945d75029813)
```

The `NewRestorer{}` requires `service.AOF` as argument, it is not good because this constructor should decide using `aofRestorer{}` or `rdbRestorer{}` by file header, but it's OK at this moment. 

### Use `Restorer{}`

Apply `Restorer{}` in `Server{}`:

```go {./internal/server/server.go#L12-L33}(462824f2596cbd444f71ac0b0179945d75029813)
```

And register `Restorer{}` into `Server{}` in `App{}`:

```go {./cmd/olivine/app.go#L20-L34}(462824f2596cbd444f71ac0b0179945d75029813)
```

## What's Next?

Congratulations! We have imlemented a TCP server supports RESP and some Redis commands.

However, there's a lot of things todo:
- Connection context not in use
- Graceful shutdown
- Testing (it complained by Gemini, I'll add it in next week.)
- RDB support, AOF rewrite support
- Sentiel and cluster mode
- ...

However, I hope that the basic section of tutorial can help both you and me. See you in advance section!
