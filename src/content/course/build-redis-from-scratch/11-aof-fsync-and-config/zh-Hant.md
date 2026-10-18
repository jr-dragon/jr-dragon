---
title: "Day 11：AOF Fsync 與設定"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

> 關閉時，AOF 尚未真正寫入磁碟，有可能遺失資料嗎？

會。

呼叫檔案的 `Write()` 後，作業系統可能先將資料放在 page buffer，而不立即寫入磁碟。若在 flush 前發生斷電等非預期終止，資料就可能遺失。

MySQL、Redis 等資料庫會使用 `fsync()` syscall，要求將緩衝資料寫入磁碟。

## AOF Sync

Redis 提供三種 AOF sync 策略，可透過 `redis.conf` 設定：

- `no`：不主動 sync，交給作業系統。
- `always`：每次 AOF 寫入都 sync。
- `everysec`：背景工作每秒 sync 一次。

## Redis configuration

Redis 使用文字檔 `redis.conf` 設定服務，見 [Redis configuration](https://redis.io/docs/latest/operate/oss_and_stack/management/config/)。

先建立簡單的 parser：

```go {./internal/data/config.go#L1-L74}(e722f4ad06b89c57bbba359e8bc40e5f7b6cd87a)
```

> 注意：這不是完整的 Redis configuration parser。

### 套用設定

在 `main.go` 初始化：

```go {./cmd/olivine/main.go#L8-L13}(e722f4ad06b89c57bbba359e8bc40e5f7b6cd87a)
```

在 `app.go` 使用：

```go {./cmd/olivine/app.go#L28-L47}(e722f4ad06b89c57bbba359e8bc40e5f7b6cd87a)
```

`restorer` 為 `nil` 時略過還原：

```go {./internal/server/server.go#L48-L54}(e722f4ad06b89c57bbba359e8bc40e5f7b6cd87a)
```

### 每次寫入都 Sync

設定 `appendfsync always` 時，寫入後執行 sync：

```go {./internal/service/aof.go#L39-L61}(95a9c4ed8156480c582f9f0ef73aee89a63f9aac)
```

```diff
	n, err := aof.f.Write(marshaled)
	if err != nil {
		return err
	}
	if n != len(marshaled) {
		return fmt.Errorf("wrote length mismatch: got %d want %d", n, len(marshaled))
	}

+	if aof.cfg.AOFFsync == data.AOFFsyncAlways {
+		return aof.f.Sync()
+	}

	return nil
```

### 每秒 Sync

設定 `appendfsync everysec` 時，在 `cmd/olivine/app.go` 加入 goroutine，每秒呼叫 sync：

```go {./cmd/olivine/app.go#L65-L74}(edc720e293d6535b7a5d3a08abb666af5a189fe2)
```

別忘了在 `service.AOF` 加入 `Sync()`：

```diff
// file: internal/service/aof.go
type AOF interface {
	Read() (*resp.Command, error)
	Write(*resp.Command) error
+	Sync() error
	Close() error
}

+func (aof *file) Sync() error {
+	aof.mu.Lock()
+	defer aof.mu.Unlock()
+
+	return aof.f.Sync()
+}
```

## Redis Config Parser

前面的簡易 parser 有幾個問題：

1. 檔案沒有結尾的 `\n` 時，`rd.ReadString('\n')` 會回傳 EOF。
2. `strings.Trim(line, " \n")` 與 `strings.SplitN(line, " ", 2)` 的處理不容易閱讀。

我請 Codex（GPT-5.5 medium）修正，得到以下結果：

```go {./internal/data/config.go#L27-L88}(d26cd864ef27c5080d37ea615b46926086759b3a)
```

結果到處都在檢查 `io.EOF`，反而更難閱讀。

這裡有個重要前提：Redis 設定由 server 管理者提供，通常不會很大。

因此可以先將整個檔案讀入記憶體，再直接解析。結尾的 `\n` 也能在讀入後補上，不必每個迴圈都處理。

這是我的版本：

```go {./internal/data/config.go#L42-L60}(ec983943b393ddbea842eccd65834baff58b8bed)
```

### 常數 Enum

`AOFFsync` enum 有一個重要設計：

```go {./internal/data/config.go#L16-L20}(ec983943b393ddbea842eccd65834baff58b8bed)
```

使用 `iota+1`，讓零值保留給「尚未設定」。若直接以 `iota` 開始，就無法區分 `AOFFsyncNo` 與預設零值。

## Ticker

原本在 `cmd/olivine/app.go` 使用 `time.Sleep(time.Second)` 做 AOF sync：

```go {./cmd/olivine/app.go#L66-L73}(edc720e293d6535b7a5d3a08abb666af5a189fe2)
```

這個 goroutine 不會在 sleep 時回應關閉訊號。雖然程式即將退出，暫時可以接受這個做法，但寫法不夠理想。

改用 `time.Ticker`：

```go {./cmd/olivine/app.go#L66-L80}(ec983943b393ddbea842eccd65834baff58b8bed)
```
