---
title: "[Day 13] Key Expiration"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

We stored data into `map[string]string` now.

```go {./internal/repo/storage.go#L26-L29}(02cdaa804a23a69b0efc958dd6dd15be4000ad40)
```

Obviously, it cannot handle data expiration feature by this simple data structure directly.

## How to implement?

> Redis keys are expired in two ways: a passive way and active way.
>
> A key is passively expired when a client tries to access it and the key is timed out.
>
> However, this is not enough as there are expired keys that will never be accessed again. These keys should be expired anyway, so periodically, Redis tests a few keys at random amongst the set of keys with an expiration. All the keys that are already expired are deleted from the keyspace.
> 
> [Ref](https://redis.io/docs/latest/commands/expire/#how-redis-expires-keys)

Therefore, we need to store not only `string` but also `expiration` for values. 

### The `Object{}`

"Object" is used to be a collection of data, we defined the `Object{}` type is a value for storage to replace `string`.

```go {./internal/repo/object/object.go#L1-L21}(0e6741d06b6b449a61264240b644d866216abb0f)
```

"String" is an `Object{}` type which can be stored.

```go {./internal/repo/object/string.go#L1-L20}(0e6741d06b6b449a61264240b644d866216abb0f)
```

The `mapStorage{}` should be updated:

```diff
// file: internal/repo/storage.go
func NewStorage() Storage {
	s := mapStorage{}
-	s.storage = make(map[string]string)
+	s.storage = make(map[string]object.Object)

	return &s
}

type mapStorage struct {
-	storage map[string]string
+	storage map[string]object.Object
	mu      sync.Mutex
}
```

```go {./internal/repo/storage.go#L34-L56}(0e6741d06b6b449a61264240b644d866216abb0f)
```

It removes expired key from map when getting, it is passive deletion.

### Make `SET` supports expiration

The `SET` command can set a key with expiration by:
- `EX {sec}`: data expires after `{sec}` seconds.
- `PX {msec}`: data expires after `{msec}` milliseconds.
- `EXAT {usec}`: data expires at `{usec}` unix epoch in seconds.
- `PXAT {umsec}`: data expires at `{umsec}` unix epoch in milliseconds.

The full arguments format of `SET` command:
```
SET key value [NX | XX | IFEQ ifeq-value | IFNE ifne-value |
  IFDEQ ifdeq-digest | IFDNE ifdne-digest] [GET] [EX seconds |
  PX milliseconds | EXAT unix-time-seconds |
  PXAT unix-time-milliseconds | KEEPTTL]
```

Make a `parse()` for `Set{}` with returning `(parsedSet, error)`:

```go {./internal/service/cmd/set.go#L45-L227}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

> Note: I built a parser with a [finiate state machine](https://en.wikipedia.org/wiki/Finite-state_machine), it makes code very long but clear for state transfering.

### `SetParam{}` interface

Because we `parse()` in `Set{}` command, and returns `parsedSet{}` as result instead of put `object.Object` as parameter for `repo.Storage.Set()`.

It's a good design for recieving `repo.SetParam{}` interface, and handle `parsedSet{}` when calls `repo.Storage.Set()`

```go {./internal/repo/storage.go#L24-L26}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

```go {./internal/service/cmd/set.go#L221-L233}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

Use `var _ repo.SetParam = parsedSet{}` to ensure `parsedSet{}` is a `repo.SetParam{}` while compiling.

It's time to update `repo.Storage.Set()` function:
```go {./internal/repo/storage.go#L40-L46}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

The reason of using `SetParam{}` to handle `parsedSet{}` can make `repo.Storage.Set()` handle not only `object.String{}` but `object.Hash{}` in future for `HSET` Redis command.

## Active way expiration

We've implemented passive way for removing key from storage if expired when accessing.

How's the active way?

Redis spawn a thread, it cyclically get some keys from storage and remove it if expired every 100 millisecons. 

### Refactor with `Worker{}`

We've implemented a thread like feature: AOF syncing every second (if configured), although we implemented it by goroutine.

I decided to create a `service.Worker{}` to manage these gorutines: more clear flow in `Application.Run()`:

```go {./internal/service/worker.go#L1-L62}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

And call `Worker.Start()` in `Application.Run()` errgroup goroutine:

```go {./internal/service/worker.go#L1-L55}(b998266427c1f42b0676007d0537cb5dc78ca75b)
```

### `Storage.Prune()` and register in `Worker{}`

```go {./internal/repo/storage.go#L64-L104}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

```diff
// file: internal/service/worker.go
func (w *worker) Start(ctx context.Context) error {
	g, ctx := errgroup.WithContext(ctx)

	if w.cfg.AOFEnabled && w.cfg.AOFFsync == data.AOFFsyncEverySec {
		g.Go(w.aofSyncer(ctx))
	}

+	g.Go(w.storagePruner(ctx))

	return g.Wait()
}

+func (w *worker) storagePruner(ctx context.Context) func() error {
+	return func() error {
+		ticker := time.NewTicker(time.Millisecond * 100)
+		defer ticker.Stop()
+
+		for {
+			select {
+			case <-ctx.Done():
+				return nil
+			case <-ticker.C:
+				if err := w.storage.Prune(ctx); err != nil {
+					if ctx.Err() != nil && errors.Is(err, ctx.Err()) {
+						return nil
+					}
+					return err
+				}
+			}
+		}
+	}
+}
```

## AOF for expiration keys

We stores keys command directly when appending AOF, there's an unexpected behavior if stores key with expiration. 

Let's review by timeline:

1. 00:00:00: `SET foo bar EX 10`, it stores into both AOF and storage.
2. 00:00:05: `GET foo`, get `bar` because the key havn't expired.
3. 00:00:11: `GET foo`, get `(nil)` because the key have expired.
4. 00:01:00: Shutdown service
5. 01:00:00: Startup the service, read AOF and restore.
6. 01:00:05: `GET foo`, get `bar`, it is an unexpected behavior.

To solve this problem, it should stores unix timestamp in AOF instead. 

### `resp.Command{}` with `aof`

We know it stores different command in AOF when `SET` with expiration. It needs to add `aof` in `resp.Command{}` because AOF writer uses this.

```diff
type Command struct {
	raw  Value
+	aof  Array
	cmd  BulkString
	args []BulkString
}
```

The `aof` is a deep clone of `raw`, but we've checked `raw` is `resp.Array` type in `resp.ReadCommand()`.

```go {./pkg/resp/cmd.go#L26-L60}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

Add add a `UpdateAOF()` to update `aof`:

```go {./pkg/resp/cmd.go#L96-L98}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

### `UpdateAOF()` in `SET` command

```go {./internal/service/cmd/set.go#L149-L152}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

It updates `EX` or `PX` argument into `PXAT` when storing AOF.

## The `TTL` command

Implement and register a `TTL` Redis command:

```go {./internal/service/cmd/ttl.go#L1-L71}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

```diff
// file: internal/service/cmd/cmd.go
func NewCommands(storage repo.Storage) []Command {
	return []Command{
		&Ping{},

		NewSet(storage),
		NewGet(storage),

+		NewTTL(storage),
	}
}
```

## Note

This topic is hard to write. The key expiration feature is based on lots of computer science knowledge, but it could make this topic too long to read. 

I want to explian why Redis uses both active and passive way to expire keys, and why not to use min-heap (priority queue) to handle a sorted array by `expiration *time.Time` for expiration. 

I also want to explain how Redis stores expiration in `redisObject` by bitwise field likes magic, and I hope I can tell you why parse redis command syntax by self-made finite state machine in this topic, and why I give up to use regular expression.

I committed many changes not only in this topic, but I'm sorry that I cannot tell you more about these changes.
