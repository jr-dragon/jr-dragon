---
title: "Day 13：Key 到期機制"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

目前使用 `map[string]string` 儲存資料：

```go {./internal/repo/storage.go#L26-L29}(02cdaa804a23a69b0efc958dd6dd15be4000ad40)
```

這個簡單結構無法直接處理資料到期。

## 如何實作？

根據 [Redis 的到期機制說明](https://redis.io/docs/latest/commands/expire/#how-redis-expires-keys)，key 會以被動與主動兩種方式到期：被動方式在 client 存取已到期的 key 時刪除；但有些 key 到期後不再被存取，因此還需要定期抽查帶有到期時間的 keys，刪除其中已到期的資料。

因此 value 除了字串，還需要記錄 expiration。

### `Object`

定義 `Object` 型別，取代原本儲存的 `string`，把資料與到期資訊放在一起：

```go {./internal/repo/object/object.go#L1-L21}(0e6741d06b6b449a61264240b644d866216abb0f)
```

String 是可儲存的 Object 型別之一：

```go {./internal/repo/object/string.go#L1-L20}(0e6741d06b6b449a61264240b644d866216abb0f)
```

更新 `mapStorage`：

```diff
// file: internal/repo/storage.go
func NewStorage() Storage {
	s := mapStorage{}
-	s.storage = make(map[string]string)
+	s.storage = make(map[string]object.Object)

	return &s
}

type mapStorage struct {
-	storage map[string]string
+	storage map[string]object.Object
	mu      sync.Mutex
}
```

```go {./internal/repo/storage.go#L34-L56}(0e6741d06b6b449a61264240b644d866216abb0f)
```

讀取時刪除已到期的 key，就是被動刪除。

### 讓 `SET` 支援到期時間

`SET` 可以使用以下選項：

- `EX {sec}`：在指定秒數後到期。
- `PX {msec}`：在指定毫秒數後到期。
- `EXAT {usec}`：在指定 Unix timestamp 到期，單位為秒。
- `PXAT {umsec}`：在指定 Unix timestamp 到期，單位為毫秒。

完整語法如下：

```
SET key value [NX | XX | IFEQ ifeq-value | IFNE ifne-value |
  IFDEQ ifdeq-digest | IFDNE ifdne-digest] [GET] [EX seconds |
  PX milliseconds | EXAT unix-time-seconds |
  PXAT unix-time-milliseconds | KEEPTTL]
```

為 `Set` 加入 `parse()`，回傳 `(parsedSet, error)`：

```go {./internal/service/cmd/set.go#L45-L227}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

> 注意：這裡以 [finite state machine](https://en.wikipedia.org/wiki/Finite-state_machine) 建立 parser。程式較長，但狀態轉移清楚。

### `SetParam` interface

`Set.parse()` 回傳 `parsedSet`，而不是直接將 `object.Object` 傳給 `repo.Storage.Set()`。因此讓 storage 接受 `repo.SetParam` interface，再由 `parsedSet` 實作它：

```go {./internal/repo/storage.go#L24-L26}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

```go {./internal/service/cmd/set.go#L221-L233}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

`var _ repo.SetParam = parsedSet{}` 能在編譯時確認型別符合介面。

更新 `repo.Storage.Set()`：

```go {./internal/repo/storage.go#L40-L46}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

這讓未來的 storage 除了 `object.String`，也能處理 `HSET` 所需的 `object.Hash` 等型別。

## 主動到期

前面完成的是存取時刪除已到期資料。主動方式則定期抽查並清除到期 keys。Redis 每 100 毫秒執行這類工作。

### 使用 `Worker` 重構

我們已經用 goroutine 實作過背景工作：依設定每秒同步 AOF。

建立 `service.Worker` 統一管理這些 goroutines，讓 `Application.Run()` 流程更清楚：

```go {./internal/service/worker.go#L1-L62}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

再於應用程式的 errgroup goroutine 呼叫 `Worker.Start()`。Worker 的實作如下：

```go {./internal/service/worker.go#L1-L55}(b998266427c1f42b0676007d0537cb5dc78ca75b)
```

### `Storage.Prune()` 與 Worker 註冊

```go {./internal/repo/storage.go#L64-L104}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

```diff
// file: internal/service/worker.go
func (w *worker) Start(ctx context.Context) error {
	g, ctx := errgroup.WithContext(ctx)

	if w.cfg.AOFEnabled && w.cfg.AOFFsync == data.AOFFsyncEverySec {
		g.Go(w.aofSyncer(ctx))
	}

+	g.Go(w.storagePruner(ctx))

	return g.Wait()
}

+func (w *worker) storagePruner(ctx context.Context) func() error {
+	return func() error {
+		ticker := time.NewTicker(time.Millisecond * 100)
+		defer ticker.Stop()
+
+		for {
+			select {
+			case <-ctx.Done():
+				return nil
+			case <-ticker.C:
+				if err := w.storage.Prune(ctx); err != nil {
+					if ctx.Err() != nil && errors.Is(err, ctx.Err()) {
+						return nil
+					}
+					return err
+				}
+			}
+		}
+	}
+}
```

## 到期資料與 AOF

直接把原始 `SET` 寫入 AOF，會在還原時產生意料外的結果：

1. 00:00:00：執行 `SET foo bar EX 10`，同時寫入 storage 與 AOF。
2. 00:00:05：`GET foo` 回傳 `bar`。
3. 00:00:11：key 到期，`GET foo` 回傳 `(nil)`。
4. 00:01:00：關閉服務。
5. 01:00:00：啟動服務，重播 AOF。
6. 01:00:05：`GET foo` 又回傳 `bar`，不符合預期。

解法是將 AOF 中的相對到期時間改為絕對 Unix timestamp。

### 在 `resp.Command` 加入 `aof`

帶有到期選項的 `SET` 需要寫入不同版本的指令，所以在 `resp.Command` 加入供 AOF writer 使用的 `aof`：

```diff
type Command struct {
	raw  Value
+	aof  Array
	cmd  BulkString
	args []BulkString
}
```

`aof` 是 `raw` 的 deep clone；`resp.ReadCommand()` 已確認 `raw` 為 `resp.Array`。

```go {./pkg/resp/cmd.go#L26-L60}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

加入 `UpdateAOF()`：

```go {./pkg/resp/cmd.go#L96-L98}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

### 在 `SET` 呼叫 `UpdateAOF()`

```go {./internal/service/cmd/set.go#L149-L152}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

將 `EX`、`PX` 改寫為 `PXAT` 後再寫入 AOF。

## `TTL` 指令

實作並註冊 `TTL`：

```go {./internal/service/cmd/ttl.go#L1-L71}(3cff9553b367baae58af0162878c3e52d76a14f4)
```

```diff
// file: internal/service/cmd/cmd.go
func NewCommands(storage repo.Storage) []Command {
	return []Command{
		&Ping{},

		NewSet(storage),
		NewGet(storage),

+		NewTTL(storage),
	}
}
```

## 補充

這個主題很難寫。到期機制涉及許多電腦科學知識，但全部展開會讓文章過長。

我想解釋為什麼 Redis 同時採用主動與被動到期，而不使用以 `expiration *time.Time` 排序的 min-heap（priority queue）。

也想說明 Redis 如何在 `redisObject` 使用 bit fields 儲存到期資訊，以及這裡為什麼自行建立 finite state machine，而放棄 regular expression。

這一階段包含不少其他修改，但無法在本章逐一說明。
