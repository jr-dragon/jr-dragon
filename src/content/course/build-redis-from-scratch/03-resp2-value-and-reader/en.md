---
title: "[Day 3, 4] RESP2 value and reader"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## RESP: Redis Serialization Protocol

We need to talk the same language when we communicate with others. When we want to communicate with Redis, we need to use RESP, which is a protocol designed for Redis. 

There're 2 versions of RESP: RESP2 and RESP3. Today, we'll implement RESP2 because it is easier than RESP3.

> Note: RESP3 is most superset of RESP2, it is supported since Redis 6.0.

The [Redis serialization protocol specification](https://redis.io/docs/latest/develop/reference/protocol-spec/) is available on Redis official documentation. It tells us why and how RESP designed.

## RESP Value

### Magic Byte

RESP uses "magic byte" to identify data types, there're 5 data types in RESP2:
- Simple String: `+`
- Simple Error: `-`
- Integer: `:`
- Bulk String: `$`
- Array: `*`

Let's define constants in `pkg/resp/value.go`:

https://github.com/jr-dragon/olivine/blob/

```go
// file: pkg/resp/value.go
package resp

const(
	MAGIC_SIMPLE_STRING = '+'
	MAGIC_SIMPLE_ERROR  = '-'
	MAGIC_INTEGER       = ':'
	MAGIC_BULK_STRING   = '$'
	MAGIC_ARRAY         = '*'
)
```

> Note: packages under `pkg` means public accessible for other developers who use this repo as package, read [golang-standards/project-layout](https://github.com/golang-standards/project-layout#pkg) for more information. **This guide is not a go official standard**, but it is useful for mid-large project organization.

### `Value` interface

It made a `Value{}` in [Build Redis from scratch](https://www.build-redis-from-scratch.dev/en/resp-reader):
```go
type Value struct {
	typ   string
	str   string
	num   int
	bulk  string
	array []Value
}
```

It's simple, but I prefer define a `Value` interface for all RESP data types:

```go {./pkg/resp/value.go#L14-L16}(9b5841c1a7764708d8a4c545c4c63b9c0ed037c8)
```

The `Marshal()` is inspired from `json.Marshal()`, the things which be written in connection as response.

### Simple String

First of all, we can make a `SimpleString{}` struct implements `Value{}` interface.

```go {./pkg/resp/value.go#L21-L39}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### Write to `net.Conn`

We are using `conn.Write([]byte("ACK: " + strings.ToUpper(msg)))` to write response in `internal/server/server.go` 

```go {./internal/server/server.go#L39-L55}(975447adc04bdd83a41182de40169cefefaa0075)
```

```diff
-	if _, err := conn.Write([]byte("ACK: " + strings.ToUpper(msg))); err != nil {
+	if _, err := conn.Write(resp.SimpleString("OK").Marshal()); err != nil {
```

```go {./internal/server/server.go#L38-L52}(9b5841c1a7764708d8a4c545c4c63b9c0ed037c8)
```

### Manually testing with `redis-cli` 

Redis provides some useful tools, the `redis-cli` is the most popular tool, it can send requests and handle responses with RESP, we can check whether our service is compatible with Redis or not.

```shell
$ redis-cli -p 16879 ping
OK
```

### Redis Command: Array and BulkString

There's an RESP array with bulk strings in requests, it calls "Redis Command".
- `Array{ BulkString{"PING"} }`: a [`PING`](https://redis.io/docs/latest/commands/ping/) command.
- `Array{ BulkString{"GET"}, BulkString{"bar"} }`: a [`GET`](https://redis.io/docs/latest/commands/get/) command with `"bar"` argument. 

### `BulkString{}` Value

There're 2 types of bulk string in RESP: 
- [Bulk String](https://redis.io/docs/latest/develop/reference/protocol-spec/#bulk-strings)
- [Null Bulk String](https://redis.io/docs/latest/develop/reference/protocol-spec/#null-bulk-strings)

Because `Null` type is defined in RESP3, Redis uses "Null Bulk String" type for null string value.

```diff
// file: pkg/resp/value.go
const (
	MAGIC_SIMPLE_STRING = '+'
	MAGIC_SIMPLE_ERROR  = '-'
	MAGIC_INTEGER       = ':'
	MAGIC_BULK_STRING   = '$'
	MAGIC_ARRAY         = '*'
+	SENTINEL            = "\r\n"
)
```

```go {./pkg/resp/value.go#L41-L74}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### `Array{}` Value

Like `BulkString{}`, RESP2 defeined `null array`.

```go {./pkg/resp/value.go#L76-L110}(3892588b3493482ea5cd72542bdec55080a445b5)
```

## Read from `net.Conn`

We use `*bufio.Reader` to handle connections at this moment, but it is not designed for RESP.

Consider the reader below:
```go
rd := bufio.NewReader(conn)
for {
	msg, _, err := rd.ReadLine()
	if err != nil {
		fmt.Printf("err = %+v\n", err)
		break
	} else {
		fmt.Printf("msg = %s\n", msg)
	}
}
```

When I use `*1\r\n$4\r\nPING\r\n` as Redis Command, I needs to parse `msg` multiple times -- NOT ELEGANT.

> Demo: [Go Playground](https://go.dev/play/p/f1Pe0T6PMCw)

Therefore, I made `*resp.Reader` in `pkg/resp/io.go` to solve this problem. 

```go {./pkg/resp/io.go#L16-L38}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### `readLine()` and `readInt()`

As we know, the "Redis Command" is an "Array of BulkStrings" (it calls "multibulk" in redis internal), and both "Array" and "BulkString" formats by `{MAGIC}{LENGTH}\r\n{DATA}\r\n`.

It nice to have `readLine()` and `readInt()` before we implement `readArray()` and `readBulkString()`.

```go {./pkg/resp/io.go#L94-L108}(3892588b3493482ea5cd72542bdec55080a445b5)
```

```go {./pkg/resp/io.go#L85-L92}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### `readBulkString()`

BulkString is designed as a binary safe string, reading a binary safe string depends on its length defeined in header.

> Note: C-style string is a char array and terminates with null byte '\0', it is not binary-safe, because given data could includes null byte anywhere. 

```go {./pkg/resp/io.go#L64-L83}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### `readArray()`

RESP array can be imaged as "collection of RESP values", we can read recursively for each data in collection.

```go {./pkg/resp/io.go#L40-L62}(3892588b3493482ea5cd72542bdec55080a445b5)
```

### Handle Redis Commands

We are using `msg, err := rd.ReadString('\n')` in `internal/server/server.go`, it's time to use `*resp.Reader` instead.

```diff
	rd := resp.NewReader(conn)
-	msg, err := rd.ReadBytes('\n')
+	cmd, err := rd.Read()
```

```go {./internal/server/server.go#L37-L53}(3892588b3493482ea5cd72542bdec55080a445b5)
```
