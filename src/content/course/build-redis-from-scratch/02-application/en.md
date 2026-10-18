---
title: "[Day 2] Application"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## `App` struct

We wrote all codes in `main.go`, and it is not a good idea: when project scales, developers puts lots of code, logic, logging, comments in single file, that will make everyone crazy.

I always create a `App{}` struct in `cmd/olivine/app.go`, it controls application lifecycle (bootstrap, run, close, ...).

```go {./cmd/olivine/app.go#L1-L45}(a0352c09791c8f1a82551ceffe6dfd9c6a1816a9)
```

## The `Server` implementation

I create `App{}` for application lifecycle handling, but I still write request handler in this sturct, it's bad smell in code.

The `http.Server` in stdard libary provides `ListenAndServe()` function, there's an example: [Go by Exaple: HTTP Servers](https://gobyexample.com/http-servers). However, `net.Listener` didn't provide this function, it's time to make it by self!

Create an "internal package" in `internal/server`, it is a private package can be used by `olivine` package only. For more info: [Organize a Go module: Package or command with supporting packages](https://go.dev/doc/modules/layout#package-or-command-with-supporting-packages).

```go {./internal/server/server.go#L1-L52}(5f4e64311b36add2a398d718693f338d3ce6a3b2)
```

```go {./cmd/olivine/app.go#L1-L26}(5f4e64311b36add2a398d718693f338d3ce6a3b2)
```

### Why `Server` interface?

I built `type Server interface` with `ListenAndServe() error` function, and implement `type simpleSrv struct{}` for this interface. 

But, why?

It's undoubt over-design for this project at this moment, but I plan to implement other server implementations to compare performance or something interesting. 

### Where's `listener.Close()`?

Unlike `http.Server`, there's no `Close()` or `Shutdown()` in `simpleSrv{}`, not yet. 

I'll add `Shutdown()` for graceful shutdown in the future, maybe.
