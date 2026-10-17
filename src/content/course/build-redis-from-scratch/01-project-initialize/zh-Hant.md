---
title: 專案初始化
codebase: '../olivine'
---

## 設定 Go module

Go module 是 Go 語言自 1.13 版之後內建的相依性管理系統。

對於 Go module 用法，我推薦可以參考由 Go 開發團隊撰寫的 [Tutorial: Create a Go module](https://go.dev/doc/tutorial/create-module)。

我們可以在專案的根目錄使用 `go mod init github.com/jr-dragon/olivine`，它會建立一個 `go.mod` 檔案，這是相依性管理的核心。

```txt {./go.mod}(a89f8da)
```

> 註：使用 `github.com/{user_name}/{repo_name}` 這樣的 Go module 名稱是很普遍的做法，如果你建立了一個專案或函式庫，其它開發者可以循著這個網址找到你的專案，這有利於開源生態的構建與降低使用門檻。

## 程式的進入點

`main` 函式是一個特殊的函式，意味著「程式的進入點」，我們在專案根目錄下建立了 `main.go`。

```go {./main.go}(39865ae)
```

不免俗地，我們當然要以經典的 `Hello, world` 作為開場。使用 `go run .`，你應該可以看到如下的輸出：

```sh
$ go run .
Hello World
```

> 註：我們可以把 `main` 函式放在任何資料夾，只要這個資料夾位於 Go modules 底下即可。如果是只有單一執行檔的專案推薦可以直接放在專案根目錄，但如果一個專案內有多個執行檔，更推薦把它們放在 `./cmd/{binary_name}` 底下，這有助於管理與組織專案。

## 使用 just

傳統上，會使用 `make` 與 `Makefile` 來更好地管理指令與程式，這幾乎已經成為軟體開發的事實標準。

不過在這邊我想向你介紹 `just`－－這是一款由 Rust 打造的工具，其目的與 `make` 幾乎一致，但是它更加現代、友善且易於使用。你可以在 https://just.systems/man/en/packages.html 找到它的安裝方式，它支援絕大多數的作業系統與套件管理器。

`just` 的使用非常簡單：建立一個 `justfile`，然後在裡面寫下指令

```makefile {./justfile}(8646684)
```

在上述的範例中，我們定義了三個指令：`run`、`build` 與 `clean`，接著我們只要使用 `just run`, `just build` 與 `just clean` 就可以執行相應的指令。

另外，`just build` 會在 `./bin/` 底下產出可執行檔，不要忘記在 `.gitignore` 上加入 `bin/` 以排除它們進 Git。

## TCP 伺服器

Go 官方提供了一個很優秀的範例：[Go by Example: TCP Server](https://gobyexample.com/tcp-server)。

基於這個範例，我這邊稍微根據自己的習慣改寫了一下：

```go {./main.go}(9c7cbca)
```

現在，我們可以用 `nc` 指令來確認一下這個 TCP 伺服器了：

```sh
$ echo "hello" | nc 127.0.0.1 16379
ACK: HELLO
$ echo "hello from netcat" | nc 127.0.0.1 16379
ACK: HELLO FROM NETCAT
```

### 重構：App

目前，我們把所有的程式碼都寫在 `main.go` 裡，這並不是個好習慣：當專案規模擴張，開發者們會在這裡放入很多的程式碼、邏輯或註解，然後最終逼瘋所有人。

我通常會建立一個 `app.App{}`，由它來控制整個應用程式的生命邏輯（包括但不限於啟動、關閉、清理等）。

```go {./internal/app/app.go}(52d883c)
```

你可能已經注意到了，我把檔案放在 `./internal/` 底下，這是一個 Go module 的特性：在 `internal/` 底下的套件僅有自己的父套件可以調用。詳見：[Organize a Go module: Package or command with supporting packages](https://go.dev/doc/modules/layout#package-or-command-with-supporting-packages)。

### 重構：Server

雖然我們把邏輯從 `main.go` 移到 `internal/app/app.go`，但問題並沒有解決：它只是換了一個檔案。

標準庫的 `http.Server` 提供 `ListenAndServe()` _接收器（Receiver）_，你可以從 [Go by Example: HTTP Servers](https://gobyexample.com/http-servers) 看到相關範例；然而 `net.Listener` 並沒有提供這個，現在是時候自己做一個！

```go {./internal/server/tcpack.go}(a140209)
```