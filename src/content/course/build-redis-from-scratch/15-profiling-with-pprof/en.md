---
title: "[Day 15] Profiling with pprof"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

Go provides profiling tools [pprof](https://go.dev/blog/pprof), it is an useful tools for developers to check performance issues.

There're 2 types of pprof tool:
1. Use `pprof.StartCPUProfile(*os.File)` and `pprof.StopCPUProfile()` directly.
2. Import `_ "net/http/pprof"` directly, it registers some profiling routes of HTTP Server.

For most of daemon service, use `"net/http/pprof"` is a greate choice.

## Benchmarking and Profiling

### Initialize HTTP Server

There's no http server in this service, we need to create one.

```diff
// file: cmd/olivine/app.go
type App struct {
	cfg *data.Config

	worker  service.Worker
	server  server.Server
+	httpsrv *http.Server
}
```

Start a web server, and don't forget to handle shutdowning:

```go {./cmd/olivine/app.go#L58-L64}(0897445aad6e99606b4a194eb347b457a7048b78)
```

```go {./cmd/olivine/app.go#L79-L81}(0897445aad6e99606b4a194eb347b457a7048b78)
```

Create `*http.Server`, and import `_ "net/http/pprof"` to register pprof routes:

```go {./cmd/olivine/kessoku.go#L59-L61}(0897445aad6e99606b4a194eb347b457a7048b78)
```

```go {./cmd/olivine/kessoku.go#L5-L5}(0897445aad6e99606b4a194eb347b457a7048b78)
```

> Note 1: pprof includes a lots of debug info, **DO NOT** expose to public, that's why use `Addr: "localhost:6060"`

> Note 2: `"net/http/pprof"` uses `func init()` to register routes automatically, it provides `/debug/pprof/*` routes.

### Benchmark

To profile service performance, we need to make some pressure by `redis-benchmark`. It is a tool provided by Redis.

There're some arguments for `redis-benchmark`, let's take examples:
```shell
$ redis-benchmark -t GET,SET # Olny test with GET/SET RESP commands
$ redis-benchmark -n 1000000 # Request 1M totally
$ redis-benchmark -c 500     # Create 500 parallel clients 
$ redis-benchmark -P 16      # Send 16 RESP commands in single TCP connection
```

It generates a report after benchmarking:
```shell
$ redis-benchmark -p 16379 -t GET
WARNING: Could not fetch server CONFIG
====== GET ======
  100000 requests completed in 1.00 seconds
  50 parallel clients
  3 bytes payload
  keep alive: 1
  multi-thread: no

Latency by percentile distribution:
0.000% <= 0.039 milliseconds (cumulative count 2)
50.000% <= 0.263 milliseconds (cumulative count 51164)
75.000% <= 0.279 milliseconds (cumulative count 76752)
87.500% <= 0.295 milliseconds (cumulative count 88450)
93.750% <= 0.319 milliseconds (cumulative count 94498)
96.875% <= 0.351 milliseconds (cumulative count 96963)
98.438% <= 0.455 milliseconds (cumulative count 98444)
99.219% <= 1.167 milliseconds (cumulative count 99221)
99.609% <= 1.759 milliseconds (cumulative count 99612)
99.805% <= 1.895 milliseconds (cumulative count 99805)
99.902% <= 1.959 milliseconds (cumulative count 99911)
99.951% <= 2.039 milliseconds (cumulative count 99957)
99.976% <= 2.063 milliseconds (cumulative count 99978)
99.988% <= 2.087 milliseconds (cumulative count 99988)
99.994% <= 2.127 milliseconds (cumulative count 99994)
99.997% <= 2.183 milliseconds (cumulative count 99997)
99.998% <= 2.367 milliseconds (cumulative count 99999)
99.999% <= 2.415 milliseconds (cumulative count 100000)
100.000% <= 2.415 milliseconds (cumulative count 100000)

Cumulative distribution of latencies:
0.060% <= 0.103 milliseconds (cumulative count 60)
1.352% <= 0.207 milliseconds (cumulative count 1352)
91.288% <= 0.303 milliseconds (cumulative count 91288)
98.120% <= 0.407 milliseconds (cumulative count 98120)
98.586% <= 0.503 milliseconds (cumulative count 98586)
98.848% <= 0.607 milliseconds (cumulative count 98848)
99.020% <= 0.703 milliseconds (cumulative count 99020)
99.121% <= 0.807 milliseconds (cumulative count 99121)
99.161% <= 0.903 milliseconds (cumulative count 99161)
99.181% <= 1.007 milliseconds (cumulative count 99181)
99.200% <= 1.103 milliseconds (cumulative count 99200)
99.248% <= 1.207 milliseconds (cumulative count 99248)
99.324% <= 1.303 milliseconds (cumulative count 99324)
99.368% <= 1.407 milliseconds (cumulative count 99368)
99.402% <= 1.503 milliseconds (cumulative count 99402)
99.430% <= 1.607 milliseconds (cumulative count 99430)
99.506% <= 1.703 milliseconds (cumulative count 99506)
99.688% <= 1.807 milliseconds (cumulative count 99688)
99.816% <= 1.903 milliseconds (cumulative count 99816)
99.934% <= 2.007 milliseconds (cumulative count 99934)
99.992% <= 2.103 milliseconds (cumulative count 99992)
100.000% <= 3.103 milliseconds (cumulative count 100000)

Summary:
  throughput summary: 99601.60 requests per second
  latency summary (msec):
          avg       min       p50       p95       p99       max
        0.280     0.032     0.263     0.327     0.695     2.415
```

### Profiling 

We want to profile when server is working, to start a benchmarking by first. (Use `-n 1000000000` to avoid finish benchmarking too early.)

```shell
$ redis-benchmark -p 16379 -t SET -P 16 -n 1000000000
```

Access `GET http://localhost:6060/debug/pprof/profile` to get profiling, it takes 30 seconds by default.

To analyze profile, use `go tool pprof`:
```shell
$ curl -o profile http://localhost:6060/debug/pprof/profile
$ go tool pprof -http=:8000 profile
```

> Note: it works by `go tool pprof http://localhost:6060/debug/pprof/profile`, but I prefer to save a file.

## Understand Profiling

We can get a [flame graph](https://en.wikipedia.org/wiki/Flame_graph) after benchmarking and profiling:

<img width="3840" height="1012" alt="Image" src="https://github.com/user-attachments/assets/c31031cc-62ab-4884-a861-03c0a382d7ae" />

Obviously, server tooks about 80% CPU time on `conn.Write()`, it's not acceptable.

### Fixing

Click `server.(*simpleSrv).serve` on flame graph, and checkout a "Source" view on top navigator. 

<img width="2276" height="1232" alt="Image" src="https://github.com/user-attachments/assets/c4afd56c-e38c-4af7-9957-04a9cb98c91f" />

The `conn.Write(ret.Marshal())` tooks 151.55s, it waste a lot with syscall when `conn.Write()`. We can use buffered writer instead.

```diff
// file: internal/server/server.go
func (s *simpleSrv) serve(conn net.Conn) {
	defer conn.Close()
	defer func() {
		s.mu.Lock()
		defer s.mu.Unlock()

		delete(s.conns, conn)
	}()

	rd := resp.NewReader(conn)
+	wr := bufio.NewWriter(conn)
+	defer wr.Flush()

	for {
		// ...
	}
```

When there's no buffered input on `resp.Reader`, flush to write.

Add  `resp.(*Reader).Buffered`:
```go {./pkg/resp/io.go#L40-L42}(6059bae8895fe0e276a85bc31e70f9e8e0e715f7)
```

Flush buffered writer when `resp.(*Reader).Buffered == 0`:
```go {./internal/server/server.go#L130-L140}(6059bae8895fe0e276a85bc31e70f9e8e0e715f7)
```

### Verifiy

Benchmarking and profiling again, we can get another flame graph.

<img width="3840" height="1082" alt="Image" src="https://github.com/user-attachments/assets/91b08e42-be55-4942-a0be-faee24bdfc3b" />

The `net.(*conn).Write` decreased from 151.53s to 21.37s, it's a big step!

## One more thing

I wrote a shell script that can help us to profile servcie, but it works in progress:

```sh {./scripts/pprof.sh}(6059bae8895fe0e276a85bc31e70f9e8e0e715f7)
```
