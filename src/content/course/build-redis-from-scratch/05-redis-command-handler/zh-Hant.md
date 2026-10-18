---
title: "Day 5：Redis Command Handler"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## `Command` 與 reader

Redis Command 並不是 RESP 額外定義的資料型別，而是由多個 Bulk Strings 組成的 Array。

我在 `pkg/resp/cmd.go` 定義 `Command`，負責從 RESP Array 轉換：

```go {./pkg/resp/cmd.go#L1-L51}(55f91b2e9e900e614872c0ba657bcc7ae19abeb8)
```

### 在 server 使用 `resp.ReadCommand`

```diff
-	cmd, err := rd.Read()
+	cmd, err := resp.ReadCommand(rd)
```

```go {./internal/server/server.go#L38-L54}(55f91b2e9e900e614872c0ba657bcc7ae19abeb8)
```

## Server 與 Handler

小型服務常把 handler 放在 server 裡，因為 server 本來就需要處理連線。但隨著服務成長，兩者的職責應分開：

- Server：監聽 port 並接受連線。
- Handler：從連線讀取請求、執行操作，再寫入回應。

### `Handler` interface 與實作

建立 `internal/server/handler.go`，加入 `Handler` interface：

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

更新 `internal/server/server.go`：

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

在 `NewServer()` 內直接呼叫 `NewHandler()`，會讓 server 綁定特定 handler 的建立方式。

透過 [dependency injection](https://en.wikipedia.org/wiki/Dependency_injection)，將 `Handler` 作為 `NewServer()` 的參數，就能在建立 server 時選擇不同的 handler 實作。

```go {./internal/server/server.go#L16-L20}(4b27321244a3f681627527e15770c4d72dc8ab2d)
```

同時更新 `cmd/olivine/app.go`：

```go {./cmd/olivine/app.go#L13-L17}(4b27321244a3f681627527e15770c4d72dc8ab2d)
```

> 注意：服務規模成長後可以使用 dependency injection library 或工具管理依賴，目前還不需要。

### 在同一條連線處理多個指令

使用 `redis-cli` 檢查 server 時，我發現奇怪的行為：

```shell
$ redis-cli -p 16879
(127.0.0.1:16879) > ping
Error: Server closed the connection
(not connected) > ping
OK
(127.0.0.1:16879) > ping
Error: Server closed the connection
```

`internal/server/server.go` 的 `s.serve()` 使用 `defer conn.Close()`，每處理完一個指令就關閉連線，下一個指令必須重新連線。

反覆進行 TCP handshake 會消耗資源，`redis-cli` 也預期能在同一條連線傳送多個指令。

加入 `for` 迴圈處理：

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

### 錯誤處理

`ret, err := s.handler.ServeRESP(context.Background(), rd)` 一旦回傳錯誤，就立即返回並關閉連線，這不完全符合預期。

`handler.ServeRESP()` 的錯誤可以分成兩類：

- Client Error：未知指令、參數不符等。
- Server Error：連線失敗、記憶體不足等。

Server Error 可以關閉連線，但 Client Error 通常應保留連線，讓 client 繼續傳送指令。

在 `internal/server/handler.go` 定義這兩種錯誤：

```go {./internal/server/handler.go#L11-L14}(4b27321244a3f681627527e15770c4d72dc8ab2d)
```

```go {./internal/server/handler.go#L32-L42}(4b27321244a3f681627527e15770c4d72dc8ab2d)
```

## Command Factory

[Factory Pattern](https://en.wikipedia.org/wiki/Factory_(object-oriented_programming)) 讓開發者能專注實作單一功能，在這個服務中就是各個 Redis Command。

在 `simpleHandler` 加入 `factory`：

```go {./internal/server/handler.go#L20-L30}(aecc2d73610cbb6a68f97ceac06dc1d3aaffad48)
```

再定義 `exec()`：

```go {./internal/server/handler.go#L32-L55}(aecc2d73610cbb6a68f97ceac06dc1d3aaffad48)
```

`*resp.Command.Command()` 尚未定義，因此也要加入 `pkg/resp/cmd.go`：

```go {./pkg/resp/cmd.go#L54-L56}(aecc2d73610cbb6a68f97ceac06dc1d3aaffad48)
```
