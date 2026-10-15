---
slug: gnu-go-and-katago-on-sabaki
title: "在 Sabaki 上使用 GNU Go 及 Katago"
description: "在 Sabaki 上使用 GNU Go 及 Katago"
pubDate: 2022-04-08T13:04:36+08:00
heroImage: "../../assets/gnu-go-and-katago-on-sabaki.webp"
heroImageFrom: "https://www.pexels.com/zh-tw/photo/39974190/"
tags: [game]
---

作為休閒活動，我偶爾會在 [OGS](https://online-go.com/) 上跟人下棋。不過前陣子因為家裡網路不太穩定，所以索性就自己弄了一套單機的下棋環境。

儘管這幾年因為 AlphaGo 的關係，圍棋這項歷久不衰的競技又再一次被推向話題討論的浪尖，然而實際上它的 Open Source 資源是相對稀缺的。

> 註：圍棋其實有不少付費軟體，但實際用起來很多都效果不佳，有些 AI 對奕的實力甚至比數十年前的 GNU Go 還差。

<!--truncate-->

## 棋盤軟體

根據[中華棋院暨兒童圍棋道場](http://mindgo.com.tw/index.php?p=page&id=85)的推薦可以使用 [Multigo](http://www.ruijiang.com/multigo/download.php) 這款免費軟體，但是這款軟體在 2008 年後就停止更新，而且僅支援 Windows 算是不小的硬傷。

我一般會推薦 [Sabaki](https://sabaki.yichuanshen.de/) 這款開源的棋盤軟體。

- 開放原始碼：MIT License
- 跨平台：基於 Electron，Windows, macOS 及 Linux 都可以使用
- 多國語系：完整的繁體中文支援

![Sabaki Screen Shot](https://sabaki.yichuanshen.de/img/screenshot.png)

## AI 對奕

近年來圍棋 AI 飛躍性發展，有許多約定俗成的定式都被推翻，可以稱得上是一場 AI 帶來的圍棋革命。

> 想當年我學棋的時候，老師一直強調不要一開場就點三三，現在這些 AI 卻推薦各種點三三，甚至還衍生出[羋氏飛刀](https://zh.wikipedia.org/wiki/%E9%A3%9B%E5%88%80%E5%AE%9A%E5%BC%8F) 這種複雜到誇張的變化型式

### GNU Go

#### 環境安裝

相較於 AlphaGo, AlphaZero 這種現代 AI，於 2009 年便未再更新的 GNU Go 反倒成為新手學棋時很好的對奕練習對象。

- Windows：直接[下載](http://gnugo.baduk.org/gnugo2/gnugo-3.8.zip)並解壓後，即可找到 `gnugo.exe` 執行檔
- macOS：`brew install gnu-go`
- Linux：大部份發行版中的套件管理器都可以找得到

> 註：GNU Go 的平均棋力未達初段，對於新手及初學者不枉為好的練習對象

#### 設定 Sabaki

1. 選擇 「文件 -> 首選項」（「File -> Preferences」）開啟軟體設定
2. 在「引擎」的頁面中點選「新增」
3. 設定名稱為 `GNU Go`
    - 路徑可使用一旁的資料夾圖示進行選擇，找到 `gnugo.exe`
    - 運行參數 `--mode gtp --quiet`

如此一來，在建建立對局時就可以選擇玩家執黑或執白，並且另一方載入 GNU Go 的引擎。

### Katago

#### 環境安裝

Katago 是一款基於 AlphaGo 及 AlphaZero 論文實作的圍棋 AI，其實力大於（視訓練模型）等於人類高段位棋手。在實際測試中，Katago 能夠在讓九子的前提下勝過 GNU Go 的最高級難度。

然而 Katago 的實際操作方式較為麻煩，所需時間也取決於電腦硬體配置及算力，在 GTX 3070 的顯示卡下，大概花費約 10 分鐘可以完成。

1. 下載 Katago：[https://github.com/lightvector/KataGo/releases](https://github.com/lightvector/KataGo/releases) 直接選擇最新（目前是 1.11）並解壓縮
    - 如果有現代（近五年）顯示卡，建議選擇 `opencl` 版本（`cuda` 的配置非常麻煩，而且訓練效率也並沒有比較高，所以不建議使用）
    - 如果有現代（近十年）的 Intel CPU 或 Ryzen 系列的 AMD CPU，可以先選擇 `eigenavx2` 版本
    - 如果以上都不符合，只能選擇 `eigen` 版本，但這個版本的速度會非常慢
    - 不要選擇有 `bs29` 的版本，那個是針對 29x29 棋盤建構，實務上用不到這種棋盤
2. 下載資料集：[https://katagotraining.org/networks/kata1/](https://katagotraining.org/networks/kata1/)
    - 推薦選擇 `Strongest confidently-rated network` 的資料集，這是棋力與運算效率最高的組合
    - 下載後，放在與 katago 相同的資料夾，並且更名為 `default_model.bin.gz`
3. （Windows 用戶）下載 zlibwapi.dll
    - **絕對不要從來路不明的地方下載 DLL 檔**
    - [Topwiz Software](https://www.topwizprogramming.com/) 提供的 [zlibwapi](https://www.topwizprogramming.com/freecode/zlibwapi.zip)
    - [WinImage](http://www.winimage.com/zLibDll/) 提供的 [zlibwapi](http://www.winimage.com/zLibDll/zlib123dllx64.zip)
    - 將 `zlibwapi.dll` 放在與 katago 相同的資料夾下即可（注意 Topwiz Software 下載的需要使用位於 `x64/` 資料夾下的版本）

#### 模型訓練

以 CLI（例如 Windows 上的 PowerShell 或命令提示字元）執行

```
./katago.exe genconfig -model default_model.bin.gz -output default_gtp.cfg
```

此時軟體會詢問一些問題，大部份保持預設即可

#### 設定 Sabaki

1. 選擇 「文件 -> 首選項」（「File -> Preferences」）開啟軟體設定
2. 在「引擎」的頁面中點選「新增」
3. 設定名稱為 `Katago`
    - 路徑可使用一旁的資料夾圖示進行選擇，找到 `katago.exe`
    - 運行參數 `gtp -model default_model.bin.gz -output default_gtp.cfg`

另外，可以將 Katago 設為分析器，使其在 Sabaki 上即時顯示下棋位置的勝率分析。這是在研究一些棋譜時很方便的功能
