---
title: "Day 16：分析 Mutex Lock"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

未指定 `-r` 時，`redis-benchmark` 使用相同 key。並行 `SET`、`GET` 就會遇到 mutex 等待。

我以 `redis-benchmark -p 16379 -t SET -P 16` 取得以下 flame graph：

<img width="3844" height="1002" alt="Image" src="https://github.com/user-attachments/assets/1a498d11-1071-4faa-927c-2c88f4f47acc" />

約 40% CPU 時間花在爭取 mutex；即使改成 `redis-benchmark -p 16379 -t SET -P 16 -r 1000000`，仍有相同問題。

> 注意：指定 `-r <keyspacelen>` 時，key 會使用 `key:{12 位數字}` 的隨機格式，數值範圍為 $[0, <keyspacelen>]$。

Benchmark 後，可以從 `http://localhost:6060/debug/pprof/block` 取得阻塞資訊：

<img width="1918" height="398" alt="Image" src="https://github.com/user-attachments/assets/a4f9b29d-1450-46fd-b610-3fd5f9b180ea" />

該次報告記錄 mutex 等待累計 1464.62 秒。

## Lock Striping

Lock striping 是並行程式設計的模式：將資源分組，只鎖定要操作的部分，而不是鎖住全部資源。

先定義多個 slots，再以 key 的 hash 決定資料所在的 slot。

### 重構 `mapStorage`

```go {./internal/repo/storage.go#L56-L70}(aa1e4c94898c067d305232f71fbbe2693b2c86bb)
```

這裡使用 `const lockStripeCount = 16`，在 slot 數量與成本間取得平衡。

```go {./internal/repo/storage.go#L243-L245}(aa1e4c94898c067d305232f71fbbe2693b2c86bb)
```

`xxh3.HashString(k)` 回傳 `uint64`，以 `hashed % lockStripeCount` 選擇 16 個 slots 之一。

> 注意：`lockStripeCount` 為 $2^n$ 時，`hashed % lockStripeCount` 等於 `hashed & (lockStripeCount-1)`。

### 重構 `(*mapStorage).Set()` 與 `Get()`

讀寫前先找出對應 slot：

```go {./internal/repo/storage.go#L80-L87}(aa1e4c94898c067d305232f71fbbe2693b2c86bb)
```

```go {./internal/repo/storage.go#L172-L187}(aa1e4c94898c067d305232f71fbbe2693b2c86bb)
```

## 結果

重構後的 profiling flame graph：

<img width="3828" height="878" alt="Image" src="https://github.com/user-attachments/assets/acfea854-84ec-4acb-88c9-285b3aa9f25a" />

該次 mutex 相關 CPU 時間從 47.33 秒（37.7%）降到 8.58 秒（4.7%）。

<img width="3840" height="736" alt="Image" src="https://github.com/user-attachments/assets/f4403593-cb77-45e3-ab1f-c8830d008acb" />

阻塞累計時間則從 1464.62 秒降到 22.53 秒。
