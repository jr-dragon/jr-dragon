---
title: "Day 2：應用程式架構"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## `App` struct

把所有程式碼都放在 `main.go` 並不是好主意。隨著專案成長，邏輯、紀錄與註解不斷擠進同一個檔案，會變得難以維護。

我通常會在 `cmd/olivine/app.go` 建立 `App{}` struct，管理應用程式生命週期，包含初始化、執行與關閉。

```go {./cmd/olivine/app.go#L1-L45}(a0352c09791c8f1a82551ceffe6dfd9c6a1816a9)
```

## `Server` 實作

雖然建立了 `App{}` 管理生命週期，但 request handler 仍寫在這個 struct 中，這是一個需要改善的設計。

標準函式庫的 `http.Server` 提供 `ListenAndServe()`，可以參考 [Go by Example: HTTP Servers](https://gobyexample.com/http-servers)。`net.Listener` 沒有提供這個函式，因此要自己實作。

在 `internal/server` 建立 internal package，作為 `olivine` 專案內部使用的 package。相關說明見 [Organize a Go module: Package or command with supporting packages](https://go.dev/doc/modules/layout#package-or-command-with-supporting-packages)。

```go {./internal/server/server.go#L1-L52}(5f4e64311b36add2a398d718693f338d3ce6a3b2)
```

```go {./cmd/olivine/app.go#L1-L26}(5f4e64311b36add2a398d718693f338d3ce6a3b2)
```

### 為什麼使用 `Server` interface？

我建立了含有 `ListenAndServe() error` 的 `type Server interface`，再以 `type simpleSrv struct{}` 實作它。

目前這對專案來說確實有些過度設計，但我計畫加入其他 server 實作，用來比較效能或進行其他有趣的實驗。

### `listener.Close()` 呢？

與 `http.Server` 不同，`simpleSrv{}` 目前還沒有 `Close()` 或 `Shutdown()`。

未來或許會加入 `Shutdown()`，實作 graceful shutdown。
