---
title: "Day 7：資料持久化"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

目前的 TCP server 已支援 RESP2，以及 `PING`、`GET`、`SET` 指令。

但資料存在 `repo.mapStorage` 的記憶體中，服務重新啟動後就會全部消失。

## Redis 的資料持久化

Redis 有兩種持久化方式：

- Append Only File（AOF）：以 RESP 指令記錄所有會改變儲存內容的操作。
- RDB：記錄某個時間點的儲存快照。

我選擇先實作較簡單的 AOF，未來也許會以附錄補上 RDB。

### AOF 格式

AOF 的內容是經過 RESP marshal 的原始 bytes：

```shell
$ redis-cli -p 16879 SET foo bar
OK
$ cat database.aof
*3
$3
set
$3
foo
$3
bar
$ xxd database.aof
00000000: 2a33 0d0a 2433 0d0a 7365 740d 0a24 330d  *3..$3..set..$3.
00000010: 0a66 6f6f 0d0a 2433 0d0a 6261 720d 0a    .foo..$3..bar..
```

當改變資料的 Redis Command 成功執行後，就將它的 RESP bytes 附加到 AOF。

### AOF Reader 與 Writer

```go {./internal/service/aof.go#L1-L55}(d8d36351fce4811bd305e82ec2deb24555fc9486)
```

## 透過 Middleware 整合 AOF

[Middleware](https://en.wikipedia.org/wiki/Middleware) 適合 HTTP server 這類 request-response 模型。

Go 的 middleware 通常以接收 handler 的函式表示。在 `internal/server/handler.go` 加入 `HandlerFunc` 與 `Middleware`：

```go {./internal/server/handler.go#L22-L38}(8c47e4a97113f230f503a7ee694fdebcf45c1aaa)
```

### 加入 AOFMiddleware constructor

在 `internal/server/middleware.go` 加入 `NewAOFMiddleware()`：

```go {./internal/server/middleware.go#L1-L24}(369406d219d25205081734d89ea35df155064d0d)
```

### 在 `App` 註冊 Middleware

```go {./cmd/olivine/app.go#L16-L25}(369406d219d25205081734d89ea35df155064d0d)
```

## 啟動時從 AOF 還原

### `Restorer` interface 與 `aofRestorer` 實作

考量未來可能加入 RDB，先定義 `Restorer` interface，讓 `aofRestorer` 和未來的 `rdbRestorer` 共用介面。

```go {./internal/server/restorer.go#L1-L38}(462824f2596cbd444f71ac0b0179945d75029813)
```

目前 `NewRestorer` 需要 `service.AOF` 參數。理想上，它應該根據檔案 header 判斷使用 AOF 或 RDB，但目前先接受這個限制。

### 使用 `Restorer`

在 `Server` 套用 `Restorer`：

```go {./internal/server/server.go#L12-L33}(462824f2596cbd444f71ac0b0179945d75029813)
```

再於 `App` 建立 `Server` 時註冊：

```go {./cmd/olivine/app.go#L20-L34}(462824f2596cbd444f71ac0b0179945d75029813)
```

## 接下來呢？

恭喜，我們已實作能處理 RESP 與部分 Redis Commands 的 TCP server。

但仍有許多工作：

- 使用 connection context。
- Graceful shutdown。
- 測試（Gemini 提醒了這件事，我打算下一週補上）。
- RDB 與 AOF rewrite。
- Sentinel 與 cluster mode。
- 其他功能。

希望基礎篇對你我都有幫助，進階篇再見！
