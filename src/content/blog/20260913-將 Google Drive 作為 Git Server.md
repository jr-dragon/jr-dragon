---
title: "將 Google Drive 作為 Git Server"
pubDate: 2026-09-13T14:25:43+08:00
slug: use-google-drive-as-git-server
authors: [chivincent]
tags: [go,google-drive,git]
description: "分享以 Go 實作 Git remote helper 將 Google Drive 作為 Git Server，並延伸分支存檔、資產分發與本機同步功能。"
heroImage: "../../assets/use-google-drive-as-git-server.webp"
heroImageFrom: "https://www.pexels.com/photo/landscape-with-waterfall-12343661/"
---

在休息了近一年之後，我重新投入職場：這一次作為 Software Developer 加入了某個大型的 IT 服務公司，並且被派遣到第三方公司中作為駐點工程師。

本次的工作不同於以往的職涯，我選擇了一個先前未曾接觸過的領域，並且收獲甚多。然而，作為大型企業的駐點工程師其實權限上是相當受限的：絕大部份軟體都要經過審核才能使用，而且沒有常見的開發環境（例如 Git Server）

公司的前輩曾經撰寫了一些 Python 工具方便團隊成員簡化一些流程，然而無奈因為沒有相關的服務可供使用，因此僅能以 Google Drive 分發這些小工具－－作為新入職的成員，完全能夠理解這種分發方式的困境：先下載 v3.2.5 版，然後再一步步套用 v3.2.6, v3.2.7, ..., v3.3.0, ... 的各種版本的補丁，這個循環會直到有一天有人受不了，重新包裝了一個 v3.4.0（完整版）的壓縮檔上去。

因此，我認為如果存在一個工具能夠協助這些開發者將 Google Drive 作為 Git Server，將會略有裨益。


## gitremote-helpers

眾所周知，git 僅支援類似於 ssh, http 這類常見的通訊協助，如果希望讓它支援客製化的通訊協定就需要另外開發。

所幸，git 在開發時便留下了 [gitremtoe-helpers](https://git-scm.com/docs/gitremote-helpers) 這種擴充的方案：如果希望使用 `git clone gdrive://...` 這樣的指令從 Google Drive 上取得 git 儲存庫，只需要實作 `git-remote-gdrive` 並將其放在 `$PATH` 中即可。

而在 [anishathalye/git-remote-dropbox](https://github.com/anishathalye/git-remote-dropbox) 就有人開發過基於 dropbox 的解決方案，因此這顯然並不是件難事。

## 技術選型

誠然，只要把以上的需求丟給 Codex Astra 或 Claude Fable，應該不出意外馬上就能做出可行的方案，甚至直接拿上面的 git-remote-dropbox 用 AI 改一改似乎也是可行的。

然而正因為 AI 日新月異且越來越強大，對於技術抉擇才更加重要：

1. 公司內部的安全軟體偏好少量的、固定的執行檔，只需要通過一次認證即可使用
2. Google Drive 官方 SDK 所支援的程式語言有限
3. Google Drive 這類雲服務並不擅長處理零碎的小檔案，而更偏好單一的大檔案

### 單一執行檔

綜上所述，我使用 Go 撰寫 `git-gdrive` 與 `git-remote-gdrive`，前者用於認證、後者用於與 `gdrive://` 通訊。

我預期用戶可以使用 `git gdrive config`，它會開啟預設瀏覽器並且進行 OAuth 認證（這部份與大部份桌面應用程式類似），並在後續如果需要的話可以加入其它功能。

### 官方 SDK 支援

我原本想要使用 Rust，但是考慮到 Google Drive 有 Go 的官方 SDK `google.golang.org/api/drive/v3`，因此最後還是選了 Go。

> 後記：說來挺搞笑的，Codex Astra 在幫我撰寫的過程中直接不使用 Go SDK，它真的很討厭用現有的函式庫…

### 存檔

大部份的雲端儲存服務都偏好單一的大檔案（其實本地的硬碟也是，處理連續的資料讀寫要遠比不連續的要快上許多），但是 `.git/` 預設就是會產生一大堆零碎的小檔案，因此我們知道：不應該直接將 `.git/` 直接丟上 Google Drive（雖然它可以運作，但可能會撞到 Google Drive API 的 Rate Limit 等問題）。

比較好的做法是將 git 的資訊打包起來，讓這些變更成為一個單一的大檔。

## 實作

這種 hobby project 我一般是直接閉著眼睛丟給 Astra 處理，所以在實作上也沒什麼值得說的部份。

目前這個專案在 [jr-dragon/git-remote-gdrive](https://github.com/jr-dragon/git-remote-gdrive) 中以 MIT LICENSE 開源。

> 註：這個專案雖然是為了解決工作上的痛點，但是我完全是用私人時間與資源（我自己的 codex 帳號）開發，因此不受公司保密條款與著作權限制。

## 後續

在開發在過程中往往會誕生一些新的點子，或是有些想要解決的痛點：

### 分支存檔

目前的 git-remote-gdrive 實作僅是將 git 儲存庫的資訊放到 Google Drive 上，這意味著如果其它同事想要使用就必須學會怎麼使用 git 與 git-remote-gdrive 相關的指令：考量到團隊前輩中絕大多數都不是開發職，因此要重新說明何謂 Git，以及為什麼要使用 git-remote-gdrive 而言是個相對沉重的成本。

因此，我認為建立「分支存檔」（Branching Archive）是相對有用的功能：大家可以直接到 `branches/` 或 `tags/` 資料夾下找到指定的版本分支，並且下載來使用；這個分支或標籤將會包含完整的儲存庫內容。

註：目前團隊的小工具是由 Python 撰寫的一系列小功能，因此分支存檔能夠很好地幫助同事們直接下載對應的 python scripts 而不必擔心補丁問題。

### Asset 管理

另一方面，雖然目前團隊中尚未有編譯型應用程式，不需要分發執行檔；但我認為存在執行檔分發功能也挺重要的。

就像在 GitHub Release 頁面中可以藉由 GitHub Action 自動推送一些 assets 到 release page 中那樣，對於編譯型應用程式應該也要自動推送相應的 assets 到 Google Drive 上。

在參考了 [GitLFS](https://git-lfs.com/) 的做法之後（畢竟編譯後的二進位檔案不適合納入 Git 管理），我加入了 gdrive-assets 的功能：使用 `git gdrive install` 安裝相關功能，並且只要在 `.gitattributes` 中定義哪些檔案屬於 gdrive-assets，就可以在 push 時直接分發到 Google Drive 中。

### GDrive Local

對於一些限制比較嚴格的 Workspace，可能無法申請到 Google Drive API 相關權限（雖然還沒測試過，但我高度懷疑我們公司也無法申請 Google Drive API 相關的權限）。

因此我另外建立了一條 workaround：指定一個本機資料夾作為 git-remote-gdrive-local 的儲存位置，並且使用 `gdrive-local://` 作為通訊協定；如此一來，只要手動將該資料夾上傳到 Google Drive 或設定為 Google Drive Sync 的範圍，一樣可以將專案放到 Google Drive 上（其實這可以放到任何一個雲端服務上，不僅限於 Google Drive），有需要時再用 `git clone gdrive-local://{path}` 即可。
