---
title: "[Day 6] PING, SET and GET"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## The `Command{}` interface

As `Handler{}` is injected into `Server{}`, the Redis commands implementation should be injected into `Handler{}`.

Define a `Command{}` interface in `internal/service/cmd/cmd.go`:

```go {./internal/service/cmd/cmd.go#L1-L17}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

Add `cmds []cmd.Commands` as argument for `NewHandler()` in `internal/server/handler.go`:

```go {./internal/server/handler.go#L23-L32}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

Add `NewCommands()` into `NewApp()` in `cmd/olivine/app.go`:

```go {./cmd/olivine/app.go#L14-L18}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

## Add `Ping{}` command

The syntax of `PING` command of Redis is:
```
PING [message]
```

The `[message]` is optional: if not set, return `PONG`; otherwise, return `[message]`:
```shell
(127.0.0.1:16879) > PING
PONG
(127.0.0.1:16879) > PING hello
"hello"
```

Create a new file in `internal/service/cmd/ping.go`:

```go {./internal/service/cmd/ping.go#L1-L21}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

> Note: remember to add `Args()` into `*resp.Command`.
> 
> ```go {./pkg/resp/cmd.go#L54-L56}(42e33f2c1026324579bf386d40523aacf8a5c841)
> ```

Register `Ping{}` into `NewCommands()`:

```go {./internal/service/cmd/cmd.go#L13-L17}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

## Add `Get{}` and `Set{}`

Before adding these commands, I need to decide how the data be stored.

### The `Storage{}` interface

Define a `Storage{}` interface in `internal/repo/storage.go`:

```go {./internal/repo/storage.go#L1-L16}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

> Note: honestly, the `ctx context.Context` haven't in used yet, but it's a good practice for using `context.Context` when chaning with goroutine.

### The `mapStorage{}` implementation

There's a built-in data type in Go for storage: `Map`. 

> Note: Go use Swiss Table as built-in map implementation, it's a data structure which optimized with SIMD, branch prediction and more modern CPU features. Read more detail in [Faster Go maps with Swiss Tables](https://go.dev/blog/swisstable).

Create `mapStorage{}` to implement `Storage{}` interface:

```go {./internal/repo/storage.go#L25-L48}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

**Map is not a concurrency safe data type**, it could panic when two or more goroutines access the same map, that's why it needs to lock with `sync.RWMutex` when reading and writing.

The `sync.RWMutex` doesn't block concurrency reading, it is useful in read-heavy scenario.

### `NewStorage()` constructor

Add `NewStorage()` constructor for `Storage{}` interface:

```go {./internal/repo/storage.go#L18-L23}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

Add `repo.Storage` as argument in `cmd.NewCommand()`:

```diff
// file: internal/service/cmd/cmd.go
-func NewCommands() []Command {
+func NewCommands(storage repo.Storage) []Command {
	return []Command{
		&Ping{},
	}
}
```

Add `NewStorage()` in `NewApp()`:

```go {./cmd/olivine/app.go#L15-L19}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

### Add `Set{}` and `Get{}`

It's easy to add `Set{}` and `Get{}`:

```go {./internal/service/cmd/set.go#L1-L35}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

```go {./internal/service/cmd/get.go#L1-L42}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

Add `Set{}` and `Get{}` into `NewCommands()`:

```go {./internal/service/cmd/cmd.go#L15-L22}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```
