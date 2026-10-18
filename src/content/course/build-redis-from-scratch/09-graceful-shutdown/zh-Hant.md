---
title: "Day 9、10：Graceful Shutdown"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## 在 Server 加入 `Close()`

先在 `Server` interface 加入 `Close() error`：

```go {./internal/server/server.go#L12-L17}(ce936275b6c144d24364a95b788c01b320233031)
```

## 處理 signals

使用 `signal.NotifyContext()` 接收關閉訊號：

```go
func (app *App) Run() error {
	ctx, stop := signal.NotifyContext(context.TODO(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	slog.Info("restoring data from disk")
	if err := app.srv.RestoreFromDisk(); err != nil {
		return
	}

	go func() {
		slog.Info("starting olivine server")
		if err := app.srv.ListenAndServe(); err != nil {
			return
		}
	}()

	<-ctx.Done()

	slog.Info("closing olivine server")
	return app.srv.Close()
}
```

`app.srv.ListenAndServe()` 內含持續處理連線的無限迴圈，會阻塞目前流程，所以將它移到 goroutine，才能透過 `<-ctx.Done()` 等待 signal。

### 處理 goroutine 中的錯誤

前面的範例忽略了 goroutine 裡的 `app.srv.ListenAndServe()` 錯誤，這並不好。

改用 channel 接收錯誤，並透過 `select` 同時等待 `<-ctx.Done()`：

```go {./cmd/olivine/app.go#L40-L66}(ce936275b6c144d24364a95b788c01b320233031)
```

> 注意：為什麼不將 `app.srv.RestoreFromDisk()` 也放進 goroutine？
>
> 若還原資料時收到 signal，可能先關閉尚未建立的 listener，接著還原完成，又開始監聽，導致程式沒有退出。
>
> 正常流程：Start → RestoreFromDisk → Restored → ListenAndServe → Ctrl+C → Close → Exit。
>
> 非預期流程：Start → RestoreFromDisk → Ctrl+C → 關閉不存在的 listener → Restored → ListenAndServe → 沒有退出。

## listener `Close()` 後會發生什麼？

```go {./internal/server/server.go#L43-L47}(ce936275b6c144d24364a95b788c01b320233031)
```

`s.listener.Accept()` 會阻塞，直到有新連線或錯誤。

`s.Close()` 呼叫 `s.listener.Close()` 後，`Accept()` 回傳 `net.ErrClosed`，再由 `errch <- app.srv.ListenAndServe()` 傳出。

```go {./cmd/olivine/app.go#L50-L53}(ce936275b6c144d24364a95b788c01b320233031)
```

這會讓正常關閉也出現錯誤訊息：`failed to run app error="accept tcp [::]:16879: use of closed network connection"`。

```go {./cmd/olivine/main.go#L12-L15}(ce936275b6c144d24364a95b788c01b320233031)
```

### 記錄關閉狀態

在 `simpleSrv` 加入 `inShutdown`，標記是否正在關閉：

```diff
// file: internal/server/server.go
type simpleSrv struct {
	handler  Handler
	restorer Restorer

	listener   net.Listener
+	inShutdown atomic.Bool
}

func (s *simpleSrv) Close() error {
+	s.inShutdown.Store(true)
	if s.listener == nil {
		return nil
	}

	return s.listener.Close()
}

```

### 檢查 `Accept()` 錯誤

```go {./internal/server/server.go#L48-L61}(8bd560796a4cd2b37b61022a13a369e4c052cf29)
```

`Accept()` 回傳錯誤時，如果正在關閉，就回傳 `ErrServerClosed`。

```go {./cmd/olivine/app.go#L51-L57}(8bd560796a4cd2b37b61022a13a369e4c052cf29)
```

呼叫端檢查 `ListenAndServe()` 是否回傳 `server.ErrServerClosed`，再處理 `errch`。

> 注意：多數服務直接檢查 `net.ErrClosed` 即可。這裡的 `inShutdown` 參考了標準函式庫 [`http.Server` 的實作](https://github.com/golang/go/blob/go1.26.4/src/net/http/server.go#L3434-L3438)。

## 尚未完成的連線

關閉 listener 後不再接受新連線，但既有連線可能還沒處理完。

使用 `sync.WaitGroup` 追蹤連線，等待它們完成：

```diff

type simpleSrv struct {
	handler  Handler
	restorer Restorer

	listener   net.Listener
	inShutdown atomic.Bool

+	wg sync.WaitGroup
}
```

透過 `s.wg.Go(func() { s.serve(conn) })` 啟動連線處理（第 62 行）：

```go {./internal/server/server.go#L46-L64}(fc24d619d90598910210177cc084339693a1d397)
```

在 `Close()` 等待（第 96 行）：

```go {./internal/server/server.go#L87-L99}(fc24d619d90598910210177cc084339693a1d397)
```

> 注意：`WaitGroup.Go()` 自 Go 1.25 加入。較早版本可以在啟動處理前呼叫 `s.wg.Add(1)`，並在 `s.serve()` 內 `defer s.wg.Done()`。

### 關閉閒置連線

包含 `redis-cli` 在內的 Redis clients，通常會在同一條 TCP 連線傳送多個指令，因此用無限迴圈處理 `s.handler.ServeRESP`：

```go {./internal/server/server.go#L71-L84}(fc24d619d90598910210177cc084339693a1d397)
```

若仍有閒置連線，`s.Close()` 的 `s.wg.Wait()` 可能永遠等不到結束。因此關閉 server 時，也要關閉已建立的連線。

> 注意：關閉連線會讓 `conn.Read()`、`conn.Write()` 立即回傳 `net.ErrClosed`，但不會中斷已經開始的資料處理，例如 AOF 寫入。

在 `simpleSrv` 加入 `conns map[net.Conn]struct{}` 與 `mu sync.Mutex`：

```diff
type simpleSrv struct {
	handler  Handler
	restorer Restorer

	listener   net.Listener
	inShutdown atomic.Bool

	wg    sync.WaitGroup
+	mu    sync.Mutex
+	conns map[net.Conn]struct{}
}
```

> 注意：map 不是 concurrency-safe，讀寫時需要 mutex 保護。

接受連線後加入 `conns`：

```diff
func (s *simpleSrv) ListenAndServe() (err error) {
	if s.listener, err = net.Listen("tcp", ":16879"); err != nil {
		return
	}

	for {
		conn, err := s.listener.Accept()

		// ...

+		s.mu.Lock()
+		s.conns[conn] = struct{}{}
+		s.mu.Unlock()
		s.wg.Go(func() { s.serve(conn) })
	}
}
```

處理結束後，從 map 刪除：

```diff
func (s *simpleSrv) serve(conn net.Conn) {
	defer conn.Close()
+	defer func() {
+		s.mu.Lock()
+		defer s.mu.Unlock()
+	
+		delete(s.conns, conn)
+	}()

	rd := resp.NewReader(conn)

	for {
		ret, err := s.handler.ServeRESP(context.Background(), rd)
		// ...
```

加入 `closeConns()`：

```go {./internal/server/server.go#L130-L141}(11b3745981b6825c5a589ec280cfc00323d22689)
```

> 注意：在鎖內複製 map，於鎖外關閉連線，避免關閉流程與 mutex 互相影響。

最後在 `s.listener.Close()` 與 `s.wg.Wait()` 之間關閉連線：

```go {./internal/server/server.go#L111-L128}(11b3745981b6825c5a589ec280cfc00323d22689)
```

> 注意：這個階段仍存在競態。若連線已被接受、卻尚未放入 `conns`，關閉流程可能漏掉它，導致 `s.wg.Wait()` 卡住。這裡暫時保留這個限制。

可以在 `SET` 加入 `time.Sleep()`，確認關閉期間仍會完成 AOF 寫入。

## Timeout

不能永遠等待 `sync.WaitGroup`。服務應設定 timeout，即使 graceful shutdown 沒完成，也能結束程式。

> 注意：許多 VM 雲端服務（例如 AWS EC2、GCP）與 container 管理平台（例如 Kubernetes 的 Pod lifecycle）都會提供一段 graceful shutdown 時間。

### 用 `Shutdown()` 取代 `Close()`

將介面改為 `Shutdown(context.Context)`，使用帶 timeout 的 context：

```diff
type Server interface {
	ListenAndServe() error
	RestoreFromDisk() error

-	Close() error
+	Shutdown(context.Context) error
}

-func (s *simpleSrv) Close() error {
+func (s *simpleSrv) Shutdown(ctx context.Context) error {
	s.inShutdown.Store(true)
	if s.listener == nil {
		return nil
	}
	// ...
}
```

### 加入 Timeout Context

```go {./cmd/olivine/app.go#L61-L75}(41fc29cd477a486562b9d5c29b872fc28591cd03)
```

透過 timeout context，可以在指定的 `time.Duration` 到期後，讓等待 `<-ctx.Done()` 的流程繼續。

可在 [Go Playground](https://go.dev/play/p/bnO8OIyXhS7) 試驗。

### 在 `Shutdown()` 處理 Timeout

```go {./internal/server/server.go#L111-L138}(41fc29cd477a486562b9d5c29b872fc28591cd03)
```

必須同時等待 `<-ctx.Done()` 與 `s.wg.Wait()`。後者會阻塞，因此放入 goroutine，再用 `select` 等待完成通知或 timeout：

```go
done := make(chan struct{})
go func() { 
	s.wg.Wait()
	close(done)
}()

select {
case <-done:
	// WaitGroup is done
case <-ctx.Done():
	// Timeout exceed
}
```
