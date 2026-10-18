---
title: "[Day 14] SET with exists KEYs"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

`SET` Redis command supports some options needs stored value.

- `NX`: only set value when key doesn't exist
- `XX`: only set value when key exists

```shell
# because key "foo" doesn't exist, SET successful.
(redis-cli) > SET foo bar NX
OK
(redis-cli) > GET foo
"bar"
# because key "foo" exists, SET failed.
(redis-cli) > SET foo baz NX
(nil)
(redis-cli) > GET foo
"bar"
```

- `IFEQ {val}`: only set value when stored value equals `{val}`
- `IFNE {val}`: only set value when stored value not equals `{val}`

```shell
(redis-cli) > SET foo bar
OK
# SET successful
(redis-cli) > SET foo baz IFEQ bar
OK
# SET failed
(redis-cli) > SET foo bax IFEQ bar
```

## Code Review and Refactor

I've implemented some prototype of this feature, but incomplete.

```go {./internal/service/cmd/set.go#L207-L233}(c9b00b0f11c08bf595bc5d2f335d8d97f80ca71c)
```

It just parses with condition options (`NX`, `XX`, `IFEQ`, `IFNE`, ...) but useless; in the other hand, it defined in `cmd`, but should be used in `repo`.

Otherwise, the `repo.SetParam{}` handles all data type inputs: `object.String`, `object.Hash`, ... maybe add `object.List` or `object.OrderedSet` in future. However, it stores by `s.storage[param.Obj().Key()] = param.Obj()` directly. 

It's time to refactor code.

### `SetStringParam{}` interface

I defined a `SetStringParam{}` interface which composition with `SetParam{}`:

```go {./internal/repo/storage.go#L32-L51}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

Rename `cmd.parsedSet{}` to `cmd.setparams{}`, and be a `SetStringParam{}`:

```go {./internal/service/cmd/set.go#L223-L268}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

Don't forget to update `parse()` for `cmd.setparams{}`.

### Handle `mapStorage.Set()` with `SetStringParam{}`

```go {./internal/repo/storage.go#L63-L78}(b358753df7f111e0aa4bb1d4455646ba3be8f823)
```

## `setString()` implementation

There's some features when `setString()`:
- Delete expired key when getting current value (passive way deletion).
- Attach current value if `GET` option set and it is `*object.String`.
- Check conditions (`NX`, `XX`, `IFEQ`, `IFNE`, ...) before setting.
- `object.SetExpiresAt()` with current value if `KEEPTTL` is set.

```go {./internal/repo/storage.go#L73-L162}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

> Note: `setString()` is a workaround at this moment, the better way is [factory method pattern](https://en.wikipedia.org/wiki/Factory_method_pattern) to handle `SET`, `HSET`, `ZSET`, ... and more.

### About AOF and `KEEPTTL`

Option `KEEPTTL` is a challenge with AOF. 

I've rewritten commands for AOF when `EX` and `PX` options. However, the `KEEPTTL` is too hard to handle: we cannot ensure the current expiration in command parsing stage. 

Therefore, it is an unexpected behavior of using `KEEPTTL` and AOF in the same time, we'll try to solve it in future.

## `IFDEQ` and `IFDNE`

The value in storage could be very large, `IFEQ` or `IFNE` costs $O(n)$ time complexity which $n$ means stringn length.

Redis supports `IFDEQ` and `IFDNE` options to compare with digest. Redis uses [XXH3](https://github.com/cyan4973/xxhash) for digest algorithm.

Add `digest uint64` in `*object.String{}`:

```go {./internal/repo/object/string.go#L10-L15}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

```go {./internal/repo/object/string.go#L33-L40}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

Generate digest when set in storage:

```go {./internal/repo/object/string.go#L17-L23}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

> Note: I'm using `github.com/zeebo/xxh3` to generate XXH3 hash with string, it is fast because SIMD.
