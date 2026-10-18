---
title: "Day 17：記憶體效能分析"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

完成 [Day 15](https://github.com/jr-dragon/olivine/issues/15) 與 [Day 16](https://github.com/jr-dragon/olivine/issues/16) 後，我取得以下 flame graph：

<img width="3842" height="1042" alt="Image" src="https://github.com/user-attachments/assets/103c8740-0346-4cdc-b9c0-b33ae2ad9598" />

`runtime.gcDrain` 佔用 25.14 秒（13.9%）CPU 時間，因此我開始關注頻繁建立、回收的短生命週期物件。

## Memory Profiling

Benchmark 後，可以分別從 `localhost:6060/debug/pprof/allocs` 與 `localhost:6060/debug/pprof/heap` 取得 allocation 與 heap 資料。

> 注意：這章使用 `redis-benchmark -p 16379 -t SET -P 16 -n 10000000 -r 1000000`。

Allocation flame graph：

<img width="3840" height="744" alt="Image" src="https://github.com/user-attachments/assets/2bf3b183-fe43-4106-adfc-182d843a9c7e" />

Heap flame graph：

<img width="3850" height="780" alt="Image" src="https://github.com/user-attachments/assets/8df679a0-0778-483d-bd5e-034fd23e2065" />

兩者的差異如下：

- allocs：記憶體配置歷史，包含仍存活與已回收的物件。
- heap：目前仍存活、或尚未被 GC 回收的記憶體。

因為 `runtime.gcDrain` 佔用較多時間，先關注 allocs。

## 使用 `bufio.(*Reader).ReadSlice()`

原本的 `resp.(*Reader).readLine()`：

```go {./pkg/resp/io.go#L102-L121}(61e559535921a92aae63bf93424a6038baf1f4cd)
```

讀取過程可能多次擴充 `bytes.Buffer`。改用 `r.rd.ReadSlice('\n')`，重用 `bufio.Reader` 的 buffer：

```go {./pkg/resp/io.go#L150-L178}(99b5bdefac2a4a1907b4829978434400642c424e)
```

### 結果

使用 `go tool pprof -http=:8000 -base ./scripts/out_archive/1-original.allocs ./scripts/out_archive/2-readslice.allocs` 比較修改前後：

<img width="3848" height="776" alt="Image" src="https://github.com/user-attachments/assets/a5f752aa-4f39-437b-82cd-1bbf04790c93" />

## Interface 與型別轉換

Interface 有助於建立清楚易讀的程式碼，但這裡的 interface 與型別轉換也帶來部分 heap allocation。

`resp.ReadCommand()` 的流程如下：

- `rd.Read()` 回傳 `resp.Value` interface。
- `arr, ok := v.(Array)` 將其轉為 `resp.Array`。
- `cmd, ok := arr.data[0].(BulkString)` 將第一個元素轉為 `BulkString`。
- 其餘元素也逐一轉成 `BulkString`，形成 `args`。

```go {./pkg/resp/cmd.go#L26-L60}(61e559535921a92aae63bf93424a6038baf1f4cd)
```

我在 `resp.(*Reader).ReadCommand()` 建立 fast path，直接讀取由 Bulk Strings 組成的 Array：

```go {./pkg/resp/io.go#L39-L77}(e7e6badf2ea122b46677fb8201e9296e2891d329)
```

`resp.ReadCommand()` 改為直接呼叫它：

```go {./pkg/resp/cmd.go#L29-L44}(e7e6badf2ea122b46677fb8201e9296e2891d329)
```

### 結果

<img width="3844" height="610" alt="Image" src="https://github.com/user-attachments/assets/54c3d25d-b9b0-469c-9c6f-238161aa14e2" />

## AOF Copy-on-Write

原本 `Command.aof` 是 `Command.raw` 的副本，因為寫入 AOF 時，`SET ... EX ...` 可能改成 `SET ... PXAT ...`。但即使 AOF 關閉，也會建立這份副本。

`UpdateAOF()` 與 `MarshalAOF()` 只在啟用 AOF 時使用，因此可以將初始化延後到這些 methods，而不在 `resp.ReadCommand()` 先做：

```go {./pkg/resp/cmd.go#L66-L83}(99b5bdefac2a4a1907b4829978434400642c424e)
```

### 結果

<img width="3842" height="556" alt="Image" src="https://github.com/user-attachments/assets/7bc93c94-d413-4279-aa3a-d9d374fbcf84" />

## 重構 Command 欄位

原本的定義：

```go {./pkg/resp/cmd.go#L22-L27}(594c4e4b1de8c798559129b34f80e9ca9c92bc74)
```

重構 `resp.ReadCommand()` 後，不再需要獨立的 `cmd` 與 `args` 欄位：

```diff
type Command struct {
	raw  []BulkString
	aof  []BulkString
-	cmd  BulkString
-	args []BulkString
}
```

```go {./pkg/resp/cmd.go#L53-L59}(53bbefca0f1c848757a98b3ecaca50a32cf39595)
```

### 結果

<img width="1925" height="272" alt="Image" src="https://github.com/user-attachments/assets/32fdf3c5-2cf5-465e-909e-c7916c453689" />

## 共用 Buffer

多數 `BulkString` 都很短，但每次讀取前仍執行 `buf := make([]byte, sz)`：

```go {./pkg/resp/io.go#L103-L126}(53bbefca0f1c848757a98b3ecaca50a32cf39595)
```

可以在 `resp.Reader` 加入共用 buffer：

```diff
type Reader struct {
	rd       *bufio.Reader
+	bytesbuf [1 << 12]byte
}
```

```go {./pkg/resp/io.go#L111-L139}(0762d32056a4a7644ff9cfe0e5dbc7da1d7bf519)
```

這個 4096-byte 的 `bytesbuf` 在同一條連線的不同請求間重用。

但若 `BulkString.data` 直接參照它，下一個請求就會覆寫資料。因此將 `BulkString.data` 從 `[]byte` 改成 `string`，建立 BulkString 時複製字串。

### `valuebuf`

同樣可以在 `resp.Reader` 為 `ReadCommand()` 加入共用 `valuebuf`：

```diff
type Reader struct {
	rd       *bufio.Reader
+	valuebuf [8]BulkString
	bytesbuf [1 << 12]byte
}
```

```go {./pkg/resp/io.go#L41-L81}(0762d32056a4a7644ff9cfe0e5dbc7da1d7bf519)
```

`sz <= 8` 時使用 `r.valuebuf`，否則才配置新的 slice：

```go
	var values []BulkString
	if sz <= len(r.valuebuf) {
		clear(r.valuebuf[:])
		values = r.valuebuf[:sz:sz]
	} else {
		values = make([]BulkString, sz)
	}
```

重新指派前要清空 `r.valuebuf`，避免保留前一個請求的大字串參照。

> 注意：`ReadCommand()` 可能將共用 `valuebuf` 交給 `Command.raw`。這裡的 command pipeline 依序處理，所以我接受這個設計；若跨 goroutines 分享或保留資料，仍有風險。

### 結果

<img width="3842" height="604" alt="Image" src="https://github.com/user-attachments/assets/04c2a19a-a5c3-4582-8a99-5af3f22dbb2c" />

## 其他調整

### OK 回應

`SET` 成功時回傳 `+OK\r\n`，原本每次都建立新的 `resp.SimpleString`：

```go {./internal/service/cmd/set.go#L64-L64}(0762d32056a4a7644ff9cfe0e5dbc7da1d7bf519)
```

可以改用預先定義的 `resp.OKValue`：

```go {./pkg/resp/value.go#L58-L64}(99b5bdefac2a4a1907b4829978434400642c424e)
```

### Debug Logging

Debug logging 會建立 `slog.Any("error", err)`，消耗 CPU 與配置記憶體。可以移除或停用。

## 測量結果

我以以下參數比較 Redis、Day 14 的 Olivine 與 profiling 後的版本：

```shell
$ redis-benchmark -t SET -P 16 -n 10000000 -r 1000000
```

測試環境：

- MacBook Pro 2023，14 吋。
- CPU：Apple M2 Pro。
- RAM：32GB。
- SSD：512GB。

測試結果：

- Redis 8.8：1090512.50 req/s。
- Olivine Day 14：70773.91 req/s。
- Olivine profiling 後：1397038.25 req/s。

在上述環境與測試參數下，Olivine 的吞吐量提升接近 20 倍，並在這組測量中高於 Redis。
