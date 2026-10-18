---
title: "[Day 12] Dependency Injection"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

[Dependency Injection](https://en.wikipedia.org/wiki/Dependency_injection) is a design pattern for initializing structs. 

Let's review `NewApp()` in `cmd/olivine/app.go`

```go {./cmd/olivine/app.go#L30-L53}(e645f0dfc7e07aa9069639cdfdb286454882b7c2)
```

I need `server.Server{}` to store in `App{}`, and it requires `server.Handler{}`, `server.Restorer{}`. It calls `App{}` depends on `server.Server{}` and `server.Handler{}`; and `server.Handler{}` depends on `service.AOF{}`, ...

## Dependency Inection Library

Depencency injection can be managed by self, what I do in `NewApp()` implementation, but it's easier when using a library.

There're 2 different methods to implement dependency injection:
1. Compile Time: `go generate`
2. Runtime: `reflect`

I prefer compile time dependency injection, because it generates a readable / analyzable go source code everything expected.

Although runtime dependency injection is good, but there're too many "magic" to debug because of `reflect`. 

### Kessoku: a wire alternative

`google/wire` is a good compile time dependency injection library, but it is archived on Aug, 2025. I used [mazrean/kessoku](https://github.com/mazrean/kessoku) as alternative.

Install it is very easy:
```shell
$ go get -tool github.com/mazrean/kessoku/cmd/kessoku
```

> Note: go module supports tool management on Go 1.24+, it's no need to install tools globally. 

### Migrate `NewApp()` to kessoku

Create a file `cmd/olivine/kessoku.go`:

```go
// file: cmd/olivine/kessoku.go
package main

import (
	"github.com/mazrean/kessoku"
)

//go:generate go tool kessoku $GOFILE
var _ = kessoku.Inject[*App](
	"NewApp",
	kessoku.Provide(func(cfg *data.Config) (*App, error) { return nil, nil }),
)
```

The `kessoku.Inject` hints kessoku to generate a constructor `NewApp()` by given `cfg *data.Config` and returns `(*App, error)`

We can move `NewApp()` here directly:

```go {./cmd/olivine/kessoku.go#L15-L41}(3095e45c9113a73e5ec6dff88a16465fd151f5f2)
```

Don't forget to remove `NewApp()` from `app.go`.

```shell
$ go generate ./...
```

### Initialize dependencies

It still initialize `server.Server{}`, `server.Handler{}`, `server.Restorer{}` in single kessoku provider. 

It can be moved to other kessoku provider easily:

```go {./cmd/olivine/kessoku.go#L15-L48}(11334302727d2af52561a685703b27bdcc1a0734)
```

### Tips for Dependency Injection

Sometimes, I could need an interface `Server{}`:
```go
interface Server {
	Handle()
	Restore()
}
```

However, I defined `Handle()` in `service.Handler{}`, and `Restore()` in `service.Restorer{}`. I can package `*service.Handler{}` and `*service.Restorer{}` in a anonymous struct, and inject by kessoku:
```go
kessoku.Provide(service.NewHandler), // create `*service.Handler{}`
kessoku.Provide(service.NewRestorer), // create `*service.Restorer{}`
kessoku.Bind[server.Server](
	kessoku.Provide(func(h *service.Handler, r *service.Restorer) server.Server {
		return &struct{
			*service.Handler,
			*service.Restorer,
		}{ Handler: h, Restorer: r }
	}),
),
```

## Refactor goroutine with `errgroup`

It uses error channel with goroutine at this moment, we can refactor it with `errgroup`

```diff
-	errch := make(chan error, 1)
-	if app.cfg.AOFEnabled && app.cfg.AOFFsync == data.AOFFsyncEverySec {
-		go func() {
-			ticker := time.NewTicker(time.Second)
-			defer ticker.Stop()
-			for {
-				select {
-				case <-ctx.Done():
-					return
-				case <-ticker.C:
-					if err := app.aof.Sync(); err != nil {
-						errch <- err
-						return
-					}
-				}
-			}
-		}()
-	}
-	go func() {
-		slog.Info("starting olivine server")
-		if err := app.srv.ListenAndServe(); err != nil && !errors.Is(err, server.ErrServerClosed) {
-			errch <- err
-			return
-		}
-		errch <- nil
-	}()
+	g, ctx := errgroup.WithContext(ctx)
+	if app.cfg.AOFEnabled && app.cfg.AOFFsync == data.AOFFsyncEverySec {
+		g.Go(func() error {
+			ticker := time.NewTicker(time.Second)
+			defer ticker.Stop()
+
+			for {
+				select {
+				case <-ctx.Done():
+					return nil
+				case <-ticker.C:
+					if err := app.aof.Sync(); err != nil {
+						return err
+					}
+				}
+			}
+		})
+	}
+
+	g.Go(func() error {
+		slog.Info("starting olivine server")
+		if err := app.srv.ListenAndServe(); err != nil && !errors.Is(err, server.ErrServerClosed) {
+			return err
+		}
+		return nil
+	})
+
+	errch := make(chan error, 1)
+	go func() { errch <- g.Wait() }()
```
