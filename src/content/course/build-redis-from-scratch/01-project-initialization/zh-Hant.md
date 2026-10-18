---
title: "Day 1：專案初始化"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

## 建立 Go module

Go module 是 Go 的依賴管理機制，也是 Go 1.13 之後的內建功能。

Go 團隊提供了教學：[Tutorial: Create a Go module](https://go.dev/doc/tutorial/create-module)。

在專案根目錄執行 `go mod init olivine`，會自動產生 `go.mod`。

> 注意：許多專案以 `github.com/{username}/{repo_name}` 作為 module 名稱，這適合大部分專案，也讓其他人更容易找到 GitHub repository。

## `main` 函式

`main` 是代表程式進入點的特殊函式。我建立了 `cmd/olivine/main.go`。

```go {./cmd/olivine/main.go#L1-L7}(35f2394e44d6e315df64d9b1732747e9dafb99c4)
```

直接執行 `go run ./cmd/olivine`，就會在 stdout 看到「Hello World」。

```shell
$ go run ./cmd/olivine
Hello World
```

> 提示：只要使用 `package main`，就能將 `main` 放在 module 下的任何目錄，包含專案根目錄。我偏好將執行檔原始碼放在 `cmd/{binary_name}`，透過目錄結構管理專案。

## `Makefile`

`make` 是軟體開發的建置工具，可以透過 `Makefile` 定義指令，協助開發者設定、編譯與執行其他工作。

先在專案根目錄建立 `Makefile`：

```makefile {./Makefile#L1-L11}(e7e5ffe3069916717e587dee2cbb4ea4fd6409c4)
```

這裡定義兩個指令：

- `build`：若執行檔目錄不存在就建立它，再將 Go 程式編譯成執行檔。
- `clean`：清除執行檔目錄。

接著執行 `make build`：

```shell
$ make build
$ ./bin/olivine # run the olivine binary
Hello World
```

> 注意：別忘了將 `bin/` 加入 `.gitignore`。

## TCP Server

開始建立 TCP server！可以參考 [Go by Example: TCP Server](https://gobyexample.com/tcp-server)。

```go {./cmd/olivine/main.go#L1-L43}(0d3ea3b7058ae13a989b4df217cbfa8d470d9e44)
```

使用 `nc` 測試：

```shell
$ echo "hello" | nc 127.0.0.1 16879
> ACK: HELLO
$ echo "hello from netcat" | nc 127.0.0.1 16879
> ACK: HELLO FROM NETCAT
```

恭喜，這就是以 Go 撰寫的第一個 TCP server。
