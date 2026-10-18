---
title: "Day 14：依既有 Key 條件執行 SET"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

Redis 的 `SET` 支援依既有資料決定是否更新的選項：

- `NX`：只有 key 不存在時才設定。
- `XX`：只有 key 存在時才設定。

```shell
# because key "foo" doesn't exist, SET successful.
(redis-cli) > SET foo bar NX
OK
(redis-cli) > GET foo
"bar"
# because key "foo" exists, SET failed.
(redis-cli) > SET foo baz NX
(nil)
(redis-cli) > GET foo
"bar"
```

- `IFEQ {val}`：只有目前值等於 `{val}` 才設定。
- `IFNE {val}`：只有目前值不等於 `{val}` 才設定。

```shell
(redis-cli) > SET foo bar
OK
# SET successful
(redis-cli) > SET foo baz IFEQ bar
OK
# SET failed
(redis-cli) > SET foo bax IFEQ bar
```

## Code Review 與重構

先前只完成部分雛形：

```go {./internal/service/cmd/set.go#L207-L233}(c9b00b0f11c08bf595bc5d2f335d8d97f80ca71c)
```

它解析 `NX`、`XX`、`IFEQ`、`IFNE` 等選項，卻還沒有套用條件；條件定義在 `cmd`，實際上應交由 `repo` 使用。

此外，`repo.SetParam` 原本打算處理 `object.String`、`object.Hash`，未來可能還有 `object.List`、`object.OrderedSet`，但目前直接以 `s.storage[param.Obj().Key()] = param.Obj()` 寫入，無法處理各型別的特殊行為。

因此需要重構。

### `SetStringParam` interface

定義組合 `SetParam` 的 `SetStringParam`：

```go {./internal/repo/storage.go#L32-L51}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

將 `cmd.parsedSet` 改名為 `cmd.setparams`，並讓它實作 `SetStringParam`：

```go {./internal/service/cmd/set.go#L223-L268}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

也要更新 `parse()` 回傳的型別。

### 讓 `mapStorage.Set()` 處理 `SetStringParam`

```go {./internal/repo/storage.go#L63-L78}(b358753df7f111e0aa4bb1d4455646ba3be8f823)
```

## `setString()` 實作

`setString()` 需要：

- 讀取目前值時刪除已到期的 key。
- 指定 `GET` 且目前值為 `*object.String` 時，帶回舊值。
- 寫入前檢查 `NX`、`XX`、`IFEQ`、`IFNE` 等條件。
- 指定 `KEEPTTL` 時，以目前值的到期時間呼叫 `object.SetExpiresAt()`。

```go {./internal/repo/storage.go#L73-L162}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

> 注意：目前的 `setString()` 是過渡方案。未來可以用 [factory method pattern](https://en.wikipedia.org/wiki/Factory_method_pattern) 處理 `SET`、`HSET`、`ZSET` 等操作。

### AOF 與 `KEEPTTL`

先前已將 `EX`、`PX` 改寫成適合 AOF 的指令，但 `KEEPTTL` 更難處理：解析指令時無法確定 storage 中現有的到期時間。

因此，目前同時使用 `KEEPTTL` 與 AOF 仍有非預期行為，留待未來解決。

## `IFDEQ` 與 `IFDNE`

儲存的字串可能很大，`IFEQ`、`IFNE` 的比較成本為 $O(n)$，其中 $n$ 為字串長度。

Redis 的 `IFDEQ`、`IFDNE` 透過 digest 比較，使用 [XXH3](https://github.com/cyan4973/xxhash)。

在 `*object.String` 加入 `digest uint64`：

```go {./internal/repo/object/string.go#L10-L15}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

```go {./internal/repo/object/string.go#L33-L40}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

寫入時產生 digest：

```go {./internal/repo/object/string.go#L17-L23}(d1458ebee97d80a051c3c0710f2c992f14c3fae1)
```

> 注意：這裡使用 `github.com/zeebo/xxh3` 計算字串的 XXH3 hash，透過 SIMD 提升速度。
