---
title: "Day 15：使用 pprof 分析效能"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

Go 的 [pprof](https://go.dev/blog/pprof) 能協助找出效能問題。

有兩種使用方式：

1. 直接呼叫 `pprof.StartCPUProfile(*os.File)` 與 `pprof.StopCPUProfile()`。
2. 匯入 `_ "net/http/pprof"`，在 HTTP server 註冊 profiling routes。

對長時間執行的服務而言，`net/http/pprof` 很方便。

## Benchmarking 與 Profiling

### 初始化 HTTP Server

目前服務沒有 HTTP server，先加入一個：

```diff
// file: cmd/olivine/app.go
type App struct {
	cfg *data.Config

	worker  service.Worker
	server  server.Server
+	httpsrv *http.Server
}
```

啟動時也要處理 shutdown：

```go {./cmd/olivine/app.go#L58-L64}(0897445aad6e99606b4a194eb347b457a7048b78)
```

```go {./cmd/olivine/app.go#L79-L81}(0897445aad6e99606b4a194eb347b457a7048b78)
```

建立 `*http.Server`，並匯入 `_ "net/http/pprof"`：

```go {./cmd/olivine/kessoku.go#L59-L61}(0897445aad6e99606b4a194eb347b457a7048b78)
```

```go {./cmd/olivine/kessoku.go#L5-L5}(0897445aad6e99606b4a194eb347b457a7048b78)
```

> 注意：pprof 包含大量除錯資訊，**不要暴露到公開網路**，因此使用 `Addr: "localhost:6060"`。

> 注意：`net/http/pprof` 透過 `init()` 自動註冊 `/debug/pprof/*` routes。

### Benchmark

Profiling 需要服務正在處理負載，可以使用 Redis 提供的 `redis-benchmark`。

以下是參數示範：

```shell
$ redis-benchmark -t GET,SET # Olny test with GET/SET RESP commands
$ redis-benchmark -n 1000000 # Request 1M totally
$ redis-benchmark -c 500     # Create 500 parallel clients 
$ redis-benchmark -P 16      # Send 16 RESP commands in single TCP connection
```

測試完成後會產生報告。以下是我這次測試的執行結果：

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

先執行 benchmark。以 `-n 1000000000` 避免負載太早結束：

```shell
$ redis-benchmark -p 16379 -t SET -P 16 -n 1000000000
```

存取 `GET http://localhost:6060/debug/pprof/profile` 取得 CPU profile，預設收集 30 秒。

再使用 `go tool pprof` 分析：

```shell
$ curl -o profile http://localhost:6060/debug/pprof/profile
$ go tool pprof -http=:8000 profile
```

> 注意：也可以直接執行 `go tool pprof http://localhost:6060/debug/pprof/profile`，但我偏好先存成檔案。

## 理解 Profiling

收集後能查看 [flame graph](https://en.wikipedia.org/wiki/Flame_graph)：

<img width="3840" height="1012" alt="Image" src="https://github.com/user-attachments/assets/c31031cc-62ab-4884-a861-03c0a382d7ae" />

我觀察到約 80% CPU 時間花在 `conn.Write()`，希望改善這個成本。

### 改善

點選 flame graph 的 `server.(*simpleSrv).serve`，再切換到上方的 Source view：

<img width="2276" height="1232" alt="Image" src="https://github.com/user-attachments/assets/c4afd56c-e38c-4af7-9957-04a9cb98c91f" />

該次結果顯示 `conn.Write(ret.Marshal())` 花費 151.55 秒，頻繁 syscall 成本很高，可以改用 buffered writer。

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

當 `resp.Reader` 沒有緩衝輸入時，flush 輸出。

加入 `resp.(*Reader).Buffered`：

```go {./pkg/resp/io.go#L40-L42}(6059bae8895fe0e276a85bc31e70f9e8e0e715f7)
```

當 `Buffered() == 0` 時 flush：

```go {./internal/server/server.go#L130-L140}(6059bae8895fe0e276a85bc31e70f9e8e0e715f7)
```

### 驗證

再次執行 benchmark 與 profiling，得到以下 flame graph：

<img width="3840" height="1082" alt="Image" src="https://github.com/user-attachments/assets/91b08e42-be55-4942-a0be-faee24bdfc3b" />

`net.(*conn).Write` 從 151.53 秒降到 21.37 秒。

## 其他工具

我也寫了協助 profiling 的 shell script，但仍在開發中：

```sh {./scripts/pprof.sh}(6059bae8895fe0e276a85bc31e70f9e8e0e715f7)
```
