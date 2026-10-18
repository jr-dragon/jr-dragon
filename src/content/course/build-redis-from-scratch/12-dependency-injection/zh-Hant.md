---
title: "Day 12：Dependency Injection"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

[Dependency Injection](https://en.wikipedia.org/wiki/Dependency_injection) 是管理 struct 初始化與依賴的設計模式。

回顧 `cmd/olivine/app.go` 的 `NewApp()`：

```go {./cmd/olivine/app.go#L30-L53}(e645f0dfc7e07aa9069639cdfdb286454882b7c2)
```

`App` 需要 `server.Server`，而 server 又需要 `server.Handler` 與 `server.Restorer`；handler 也會依賴 `service.AOF` 等元件，形成依賴關係。

## Dependency Injection Library

可以像目前的 `NewApp()` 一樣自行管理依賴，也可以交給 library。

常見方式有兩種：

1. Compile Time：透過 `go generate` 產生程式碼。
2. Runtime：透過 `reflect` 建立依賴。

我偏好 compile time，因為產生的 Go 原始碼可閱讀、可分析。Runtime 方案也有優點，但 `reflect` 帶來的隱藏行為比較難除錯。

### Kessoku：wire 的替代方案

`google/wire` 已於 2025 年八月封存，因此我使用 [mazrean/kessoku](https://github.com/mazrean/kessoku) 作為替代。

安裝方式：

```shell
$ go get -tool github.com/mazrean/kessoku/cmd/kessoku
```

> 注意：Go 1.24 起支援 module 工具管理，不必將工具安裝到全域。

### 將 `NewApp()` 移到 kessoku

建立 `cmd/olivine/kessoku.go`：

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

`kessoku.Inject` 指示產生名為 `NewApp()` 的 constructor，接收 `cfg *data.Config` 並回傳 `(*App, error)`。

可以先將原本 `NewApp()` 的內容直接搬入：

```go {./cmd/olivine/kessoku.go#L15-L41}(3095e45c9113a73e5ec6dff88a16465fd151f5f2)
```

別忘了從 `app.go` 移除 `NewApp()`。

```shell
$ go generate ./...
```

### 初始化依賴

目前仍在同一個 provider 裡初始化 server、handler、restorer，可以拆成個別 provider：

```go {./cmd/olivine/kessoku.go#L15-L48}(11334302727d2af52561a685703b27bdcc1a0734)
```

### Dependency Injection 技巧

假設需要以下 `Server` interface：

```go
interface Server {
	Handle()
	Restore()
}
```

而 `Handle()` 和 `Restore()` 分別定義在 `service.Handler`、`service.Restorer`，就可以將它們嵌入匿名 struct，再交給 kessoku 注入：

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

## 使用 `errgroup` 重構 goroutine

目前以 error channel 管理 goroutines，可以改用 `errgroup`：

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
