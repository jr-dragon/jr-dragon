---
title: "[Day 5] Redis Command Handler"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## `Command{}` and reader

"Redis Command" is a special data type not defined in RESP. Actually, it just RESP array with multiple bulk string.

I defined a `Command{}` in `pkg/resp/cmd.go` for converting from RSEP array.

```go {./pkg/resp/cmd.go#L1-L51}(55f91b2e9e900e614872c0ba657bcc7ae19abeb8)
```

### Apply `resp.ReadCommand` in server

```diff
-	cmd, err := rd.Read()
+	cmd, err := resp.ReadCommand(rd)
```

```go {./internal/server/server.go#L38-L54}(55f91b2e9e900e614872c0ba657bcc7ae19abeb8)
```

## Server and Handler

In a small service, handler is a part of server, because server "handles" connections. However, when service scaling, the duty of server and handler are different. 

- Server: Listen a port, and accept connections. 
- Handler: Read requests from connections, do something and write response to connections.

### `Handler{}` interface and implementation

I created `internal/server/handler.go` and add `Handler{}` interface.

```go
// file: internal/server/handler.go
package server

type Handler interface {
	ServeRESP(context.Context, *resp.Reader) (resp.Value, error)
}

func NewHandler() Handler {
	return &simpleHandler{}
}

type simpleHandler struct {}

func (h *simpleHandler) ServeRESP(ctx context.Context, rd *resp.Reader) (resp.Value, error) {
	cmd, err := resp.ReadCommand(rd)
	if err != nil {
		return nil, err
	}

	slog.Info("Read RESP command:", slog.Any("command", cmd))

	return resp.SimpleString("OK"), nil
}
```

Update `internal/server/server.go`:
```go
// file: internal/server/server.go
func NewServer() Server {
	return &simpleSrv{
		handler: NewHandler(),
	}
}

func (s *simpleSrv) serve(conn net.Conn) {
	defer conn.Close()

	rd := resp.NewReader(conn)

	ret, err := s.handler.ServeRESP(context.Background(), rd)
	if err != nil {
		return
	}
	if ret == nil { // avoid panic
		ret = resp.SimpleString("OK")
	}

	if _, err := conn.Write(ret.Marshal()); err != nil {
		slog.Error("failed to write to conn:", slog.Any("error", err))
		return
	}
}
```

### Dependency Injection

I used `NewHandler()` in `NewServer()` constructor, it makes `Server{}` depends on `Handler{}`, it's a bad smell for this pattern, because no matter what I do, the `Server{}` requires `Handler{}` anyway.

There's a solution: [dependency injection](https://en.wikipedia.org/wiki/Dependency_injection), the `NewServer()` construct needs `Handler{}` as argument, we can free to choose other handler implementation when constructing `Server{}`.

```go {./internal/server/server.go#L16-L20}(4b27321244a3f681627527e15770c4d72dc8ab2d)
```

And we need to update `cmd/olivine/app.go`:

```go {./cmd/olivine/app.go#L13-L17}(4b27321244a3f681627527e15770c4d72dc8ab2d)
```

> Note: when the service scaling, we can use dependency injection library / tool to mangae dependencies, but it is no needed yet.

### Multiple Commands in single connection

As I used `redis-cli` to check this server, I found a strange behavior.

```shell
$ redis-cli -p 16879
(127.0.0.1:16879) > ping
Error: Server closed the connection
(not connected) > ping
OK
(127.0.0.1:16879) > ping
Error: Server closed the connection
```

The `s.serve()` uses `defer conn.Close()` for each connection be processed in `internal/server/server.go`. We need to reconnect to server for every command. 

It takes a lot of resources for multiple TCP handshakes, and `redis-cli` is also designed for multiple commands in single connection for a client.

Use a `for` loop for handling commands:

```go
// file: internal/server/server.go
func (s *simpleSrv) serve(conn net.Conn) {
	defer conn.Close()

	rd := resp.NewReader(conn)

	for {
		ret, err := s.handler.ServeRESP(context.Background(), rd)
		if err != nil {
			return
		}

		if _, err := conn.Write(ret.Marshal()); err != nil {
			slog.Error("failed to write to conn:", slog.Any("error", err))
			return
		}
	}

}
```

### Error Handling

The `ret, err := s.handler.ServeRESP(context.Background(), rd)` will return and close connection immediately when error occurred, that's no my expectation. 

The `err` from `handler.ServeRESP()` could be 2 types:
- Client Error: "Unknown command", "Mismatch arguments", ...
- Server Error: "Connection failed", "Out of memory", ...

Connections can be closed when server error, but clients usually hope that keep connection alive if client error.

Defines the 2 types of error in `internal/server/handler.go`:

```go {./internal/server/handler.go#L11-L14}(4b27321244a3f681627527e15770c4d72dc8ab2d)
```

```go {./internal/server/handler.go#L32-L42}(4b27321244a3f681627527e15770c4d72dc8ab2d)
```

## Command Factory

[Factory Pattern](https://en.wikipedia.org/wiki/Factory_(object-oriented_programming)) is an important design pattern, because it can make developers focus on single feature(redis command, in this service).

Add a `factory` in `simpleHandler{}`:

```go {./internal/server/handler.go#L20-L30}(aecc2d73610cbb6a68f97ceac06dc1d3aaffad48)
```

Define a function `exec()` for `simpleHandler{}`:

```go {./internal/server/handler.go#L32-L55}(aecc2d73610cbb6a68f97ceac06dc1d3aaffad48)
```

The `*resp.Command.Command()` is not defined now, we need to add it in `pkg/resp/cmd.go`:

```go {./pkg/resp/cmd.go#L54-L56}(aecc2d73610cbb6a68f97ceac06dc1d3aaffad48)
```
