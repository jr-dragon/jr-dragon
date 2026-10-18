---
title: "Day 6：PING、SET 與 GET"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## `Command` interface

就像將 `Handler` 注入 `Server` 一樣，Redis Command 的實作也應注入 `Handler`。

在 `internal/service/cmd/cmd.go` 定義 `Command` interface：

```go {./internal/service/cmd/cmd.go#L1-L17}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

接著將 `cmds []cmd.Commands` 加入 `internal/server/handler.go` 的 `NewHandler()` 參數：

```go {./internal/server/handler.go#L23-L32}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

在 `cmd/olivine/app.go` 的 `NewApp()` 加入 `NewCommands()`：

```go {./cmd/olivine/app.go#L14-L18}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

## 加入 `Ping` 指令

Redis 的 `PING` 語法如下：

```
PING [message]
```

`[message]` 是選填參數。沒有指定時回傳 `PONG`，否則回傳 message：

```shell
(127.0.0.1:16879) > PING
PONG
(127.0.0.1:16879) > PING hello
"hello"
```

建立 `internal/service/cmd/ping.go`：

```go {./internal/service/cmd/ping.go#L1-L21}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

> 注意：別忘了在 `*resp.Command` 加入 `Args()`。

```go {./pkg/resp/cmd.go#L54-L56}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

將 `Ping` 註冊到 `NewCommands()`：

```go {./internal/service/cmd/cmd.go#L13-L17}(42e33f2c1026324579bf386d40523aacf8a5c841)
```

## 加入 `Get` 與 `Set`

實作這兩個指令之前，必須先決定資料如何儲存。

### `Storage` interface

在 `internal/repo/storage.go` 定義 `Storage` interface：

```go {./internal/repo/storage.go#L1-L16}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

> 注意：目前還沒使用 `ctx context.Context`，但在 goroutine 間傳遞操作時，預先納入 context 是實用的做法。

### `mapStorage` 實作

Go 內建的 `map` 可以用來儲存資料。

> 注意：Go 的 map 使用 Swiss Table，並利用 SIMD、branch prediction 等現代 CPU 特性最佳化。背景資料見 [Faster Go maps with Swiss Tables](https://go.dev/blog/swisstable)。

建立實作 `Storage` 的 `mapStorage`：

```go {./internal/repo/storage.go#L25-L48}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

**Map 並非 concurrency-safe 資料型別**。多個 goroutines 同時存取可能造成 panic，因此讀寫時以 `sync.RWMutex` 保護。

`sync.RWMutex` 允許多個讀取者並行讀取，適合讀取較多的情境。

### `NewStorage()` constructor

加入 `NewStorage()`：

```go {./internal/repo/storage.go#L18-L23}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

接著在 `cmd.NewCommand()` 加入 `repo.Storage` 參數，對應的 diff 如下：

```diff
// file: internal/service/cmd/cmd.go
-func NewCommands() []Command {
+func NewCommands(storage repo.Storage) []Command {
	return []Command{
		&Ping{},
	}
}
```

在 `NewApp()` 加入 `NewStorage()`：

```go {./cmd/olivine/app.go#L15-L19}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

### 加入 `Set` 與 `Get`

接著實作 `Set` 與 `Get`：

```go {./internal/service/cmd/set.go#L1-L35}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

```go {./internal/service/cmd/get.go#L1-L42}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```

將它們加入 `NewCommands()`：

```go {./internal/service/cmd/cmd.go#L15-L22}(a39eafd7f903b9869e7fcbabb131eb242a479f8a)
```
