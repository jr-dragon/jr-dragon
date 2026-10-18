---
title: "Day 0：動機與概覽"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

Hello world，我是 jr-dragon，一位 Go 開發者。

最近讀到 [Build Your Own X](https://github.com/codecrafters-io/build-your-own-x)，覺得這是利用漫長假期開始 side project 的好機會。（去年十月被資遣，這陣子持續找工作，但結果並不順利。）

我試了 [Build Redis from Scratch](https://www.build-redis-from-scratch.dev/)，這是很適合我的起點：過去我在 HTTP server 上，使用 SQL（MySQL、PostgreSQL）和 NoSQL（Redis、MongoDB、Elasticsearch 等）建立過許多 API，卻還沒寫過 TCP server。

> 如果無法說明自己做出的東西，就表示還沒理解它；
> 如果無法自己做出來，就不應該直接使用它。

我想這段旅程會很有趣，也希望你能從中找到自己想學的東西。

## 概覽

Redis 是以 C 撰寫、支援 Redis serialization protocol（RESP）的 key-value 儲存服務。

可以想像下面的對話：

```
jr-dragon: Put "Sun. => Sunday"
redis: OK! I put "Sun." as a key, and "Sunday" as a value.

jr-dragon: I forgot what "Sun." means, can you tell me?
redis: Of course! I found "Sun." in my storage as key, and "Sunday" is the value.

jr-dragon: I want to know "Oct." means, can you tell me?
redis: Unfortunately, I cannot find any key "Oct." in my storage.

jr-dragon: Oh, "Oct." is means "October", remember this.
redis: Thanks, I'll remember it.
```

Redis 為 key-value 儲存服務提供了高效能的開源選項。

## Q & A

### 這個專案會取代 Redis 嗎？

不會。建立這個 repository 是出於興趣、學習，~~以及練習不太熟練的英文~~。

我不認為自己能做出適合正式環境的 key-value 服務。正式環境請使用 Redis、[Valkey](https://valkey.io/) 或 [Garnet](https://microsoft.github.io/garnet/docs)。

老實說，光是實作部分 Redis commands，就已經花了很多時間。

### 這個專案會使用 AI 嗎？

我會用 AI 閱讀及分析規格，尤其是 RESP specification、RDB format 等，也用來產生部分測試或取得靈感。但這是以學習為目的的 side project，我不認為讓 AI 產生完整功能是好主意。

我在 issues 寫文章是為了練習英文，因此會盡量避免直接使用 AI 產生文章。

### 效能如何？

除了示範用途外，我不會太早投入效能調校。我會優先維持程式碼可讀性、清楚的架構與良好的組織方式。
