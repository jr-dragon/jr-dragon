---
slug: laravel-sanctum-spa-authenticate-analysis
title: "Laravel Sanctum 單頁應用程式認證分析"
description: "Laravel Sanctum 單頁應用程式認證分析"
pubDate: 2020-10-24T16:15:52+08:00
heroImage: '../../assets/laravel-sanctum-spa-authenticate-analysis.webp'
heroImageFrom: 'https://pixabay.com/zh/photos/durdle-door-the-rock-ocean-the-sky-809459/'
tags: [php,laravel]
---

[Laravel Sanctum](https://laravel.com/docs/8.x/sanctum) 是 Laravel 提供的輕量化 API 服務認證（Authenticate）解決方案。

## Laravel Auth Guard Driver 概覽

| Driver   | 套件 | Bearer Token | Session Cookie | Token Scope |
| :--:     | :-- | :--: | :--: | :--: |
| Session  | 內建 | ❌ | ✅ | ❌ | 
| Token    | 內建 | ✅ | ❌ | ❌ | 
| Sanctum  | `laravel/sanctum`  | ✅ | ✅ | ✅ | 
| Passport | `laravel/passport` | ✅ | ❌ | ✅ |

<!--truncate-->

### 應用情境

- Session
    - Laravel 預設的認證方式
    - 常用於 Server Side Rendering 應用程式
- Token
    - Laravel API 預設的認證方式，罕用
    - 每個用戶僅能有一組 Token
    - 無法設定 Token 過期時間
    - 無法設定 Token 應用範圍（Scope）
- Sanctum
    - 每個用戶能有多組 Token
    - 可以設定 Token 過期時間與應用範圍
    - **可用於 SPA 的服務，且不需要 Token 作為溝通媒介**
    - **可核發單獨的 Token 用於其它服務（例如手機 APP）**
        - 這部份類似於 GitHub 提供的 Personal Access Token，也可以做成開發者服務
- Passport
    - Laravel 官方提供的 OAuth2 服務
    - 每個用戶能有多組 Token
    - 可以設定 Token 過期時間與應用範圍
    - [可以為 Token 做詳細的分類，以應用在各種不同的情境](https://oauth2.thephpleague.com/authorization-server/which-grant/)

## 剖析

從 Laravel Sacntum 的 [EnsureFrontendRequestsAreStateful](https://github.com/laravel/sanctum/blob/2.x/src/Http/Middleware/EnsureFrontendRequestsAreStateful.php#L18) 這個 Middleware 中可以瞭解到：

- 如果請求來自第一方前端介面（SPA），套件會自動載入與 Session 相關的幾個 Middlewares
- 否則套件就依然沿用原本的設定（預設上，API Middleware 並不會啟用 Session 相關的功能）

套件會從 HTTP Header 中的 `refer` 或 `origin` 判斷請求的來源，並且用 `config/sanctum.php` 中設定的 `stateful` 作為依據

```php
    public static function fromFrontend($request)
    {
        $domain = $request->headers->get('referer') ?: $request->headers->get('origin');

        // ...

        $stateful = array_filter(config('sanctum.stateful', []));

        // ...
    }
```

### 模擬 SPA 請求

如果希望用 `curl` 之類的指令模擬來自 SPA 的請求，需要加上 `-H "origin: $SPA_DOMAIN"` 或 `-H "referer: $SPA_DOMAIN` 才能夠達成

```bash
export SPA_DOMAIN=http://localhost:3000

curl -H "origin: $SPA_DOMAIN" localhost:8000/api/sacntum-apis
curl -H "referer: $SPA_DOMAIN" localhost:8000/api/sanctum-apis
```

## 結論

Laravel Sanctum 無疑是因應前後端分離而誕生的產物。儘管認證過程簡化，但也造成 API 與 Web 兩個 Middleware Group 的模糊化。

> 註：Laravel 預設有兩個 Middleware Group：`API` 及 `Web`，其中最主要差別在於 `API` 不會啟動與 Session 相關的 Middlewares

另外，Sanctum 的野心也相當大，光這一個套件負責的工作有：

- SPA 的 Session 認證
- API 的 Access Token 認證
- 簽發、管理、撤銷 Access Tokens
- 各 Access Tokens 中的權限（abilities）授權

看似 Sanctum 簡化認證機制、增加更多功能，實際上卻帶來更多變因與複雜度。
