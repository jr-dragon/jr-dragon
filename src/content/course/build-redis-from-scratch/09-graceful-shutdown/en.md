---
title: "[Day 9, 10] Graceful Shutdown"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## `Close()` in Server

Add `Close() error` in `Server{}` interface:

```go {./internal/server/server.go#L12-L17}(ce936275b6c144d24364a95b788c01b320233031)
```

## Handle signals

Use `signal.NotifyContext()` to handle shutdown signals:

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

I moved `app.srv.ListenAndServe()` into a goroutine, because it includes a infinite loop to handle connections, it blocks main process and we cannot handle signal by `<-ctx.Done()` directly.

### Error handling with goroutine

I ignored `app.srv.ListenAndServe()` error in goroutine, it's not a good practice. 

Use `channel` to handle errors in goroutine and `select` statement to work with `<-ctx.Done()`

```go {./cmd/olivine/app.go#L40-L66}(ce936275b6c144d24364a95b788c01b320233031)
```

> Note: Why don't put `app.srv.RestoreFromDisk()` into goroutine?
>
> If user send signal when storing from disk, it closes listener doesn't exist. Process `ListenAndServe` after restored and block with infinite for loop. 
>
> Normal Flow:
> Start -> RestoreFromDisk -> Restored -> ListenAndServe -> Ctrl+C -> Close -> Exit
> Unexpected Flow:
> Start -> RestoreFromDisk -> Ctrl+C -> Close Unexists Listener -> Restored -> ListenAndServe -> Do not exit

## What happen after listener `Close()`?

```go {./internal/server/server.go#L43-L47}(ce936275b6c144d24364a95b788c01b320233031)
```

`s.listener.Accept()` is a blocking operation, it waits for new connections or error. 

When `s.listener.Close()` is called in `s.Close()`, it returns `net.ErrClosed`, and returns to `errch <- app.srv.ListenAndServe()`.

```go {./cmd/olivine/app.go#L50-L53}(ce936275b6c144d24364a95b788c01b320233031)
```

It's an unexpected behavior: user send signals to close server, but shows error message `failed to run app error="accept tcp [::]:16879: use of closed network connection"`.

```go {./cmd/olivine/main.go#L12-L15}(ce936275b6c144d24364a95b788c01b320233031)
```

### Handle "shutdowning" status

Add `inShutdown` into `simpleSrv{}` as a flag to check if it is "shutdowning". 

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

### Check `Accept()` error

```go {./internal/server/server.go#L48-L61}(8bd560796a4cd2b37b61022a13a369e4c052cf29)
```

When `s.listener.Accept()` returns `err`, check if it is "shutdowning" status, and return `ErrServerClosed`

```go {./cmd/olivine/app.go#L51-L57}(8bd560796a4cd2b37b61022a13a369e4c052cf29)
```

Check if `app.srv.ListenAndServe()` returns `server.ErrServerClosed`, and send `err` into `errch`.

> Note: it's ok to check if `net.ErrClosed` in most of services, `inShutdown` is a workaround of `http.Server` in built-in library implementation. 
> https://github.com/golang/go/blob/go1.26.4/src/net/http/server.go#L3434-L3438

## Incomplete Connections

It doesn't accept new connection after `s.listener.Close()` (returns `net.ErrClosed` immediately), but connected connections may not complete.

We need to wait active connections are closed, use `sync.WaitGroup` to track active connections. 

```diff

type simpleSrv struct {
	handler  Handler
	restorer Restorer

	listener   net.Listener
	inShutdown atomic.Bool

+	wg sync.WaitGroup
}
```

Use `s.wg.Go(func() { s.serve(conn) })` to handle connections by `sync.WaitGroup`. (Line 62)

```go {./internal/server/server.go#L46-L64}(fc24d619d90598910210177cc084339693a1d397)
```

And block it in `Close()`. (Line 96)

```go {./internal/server/server.go#L87-L99}(fc24d619d90598910210177cc084339693a1d397)
```

> Note: `s.wg.Go()` is added in Go 1.25, use `s.wg.Add(1)` before `s.serve(conn)` and `defer s.wg.Done()` in `s.serve()`.

### Close Idle Connections

Most of redis clients, including `redis-cli`, handle a TCP connection and send multiple commands. That's why using infinite loop to handle `s.handler.ServeRESP`: 

```go {./internal/server/server.go#L71-L84}(fc24d619d90598910210177cc084339693a1d397)
```

With `s.wg.Wait()` in `s.Close()`, it could block forever if idle connections alive. We need to close active connections when `s.Close()`.

> Note: close an active connection make `conn.Read()` and `conn.Write()` returns `net.ErrClosed` immediately, but it doesn't interrupt processing data (e.g. AOF writing). 

Add `conns map[net.Conn]struct{}` and `mu sync.Mutex` in `simpleSrv{}`

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

> Note: built-in map is not concurrency safe, it requires `sync.Mutex` to protect when reading and writing.

Tracking connections in `conns` when accepted:

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

Delete connections from map when done:

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

Add `closeConns()` for `simpleSrv{}`

```go {./internal/server/server.go#L130-L141}(11b3745981b6825c5a589ec280cfc00323d22689)
```

> Note: To avoid mutex lock racing, clone the map in lock and close outside.

Finally, close connection between `s.listener.Close()` and `s.wg.Wait()`.

```go {./internal/server/server.go#L111-L128}(11b3745981b6825c5a589ec280cfc00323d22689)
```

> Note: Is it safe to close connections after listener close too early?
>
> There's a little data racing problem if a connection accepted but haven't put into `conns` map, the connection cannot be closed and block `s.wg.Wait()`, but we ignored at this moment. 

Now, we can add a `time.Sleep()` into `SET` command, check AOF will be written even if in shutting down status.

## Timeout

We can not wait `sync.WaitGroup` forever if it is blocked. Services defines a timeout to force terminate process even if it doesn't shutdown gracefully. 

> Note: most of VM based cloud services (AWS EC2, GCP Cloud Computing, ...) or container management platform (K8s pod lifecycle) provides a little gime for graceful shutdown. 

### `Shutdown()` instead of `Close()`

Rename `Close()` to `Shutdown(context.Context)`, because we'll use `TimeoutContext` to handle timeout.

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

### Add Timeout Context

```go {./cmd/olivine/app.go#L61-L75}(41fc29cd477a486562b9d5c29b872fc28591cd03)
```

Timeout context is an useful context variant, it blocks `<-ctx.Done()` by given `time.Duration`.

Try in playground: https://go.dev/play/p/bnO8OIyXhS7

### Handle Timeout in `Shutdown()`

```go {./internal/server/server.go#L111-L138}(41fc29cd477a486562b9d5c29b872fc28591cd03)
```

We need to wait `<-ctx.Done()` and `s.wg.Wait()` parallelly, use `select` statement, but the `s.wg.Wait()` blocks process, we need to put it into goroutine.

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
