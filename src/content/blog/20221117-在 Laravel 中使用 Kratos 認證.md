---
title: "在 Laravel 中使用 Kratos 認證"
pubDate: 2022-11-17T23:36:11+08:00
slug: use-kratos-auth-in-laravel
authors: [chivincent]
tags: [php,laravel,kratos]
description: "示範透過 laravel-kratos 套件與 Docker 在 Laravel 整合 Ory Kratos，並解析其 Session Cookie 認證機制。"
heroImage: "../../assets/use-kratos-auth-in-laravel.webp"
heroImageFrom: "https://www.pexels.com/photo/stone-bridge-over-a-river-27007125/"
---

Laravel 有著優秀的預定義認證（Authentication）功能，讓開發者不必費心在重複製作用戶註冊、登入、登出等功能。

無論是早期的 [laravel/ui](https://github.com/laravel/ui) 還是 [laravel/fortify](https://github.com/laravel/fortify) 都提供了安全、完整且方便的解決方案。

[Kratos](https://www.ory.sh/kratos/) 是由 Ory Corp 所提供的開源認證解決方案，藉由設定檔的方式可以靈活設計認證模型（例如帳號密碼、第三方社群或 WebAuth 等 passwordless 的形式）


## 使用方式

為了在 Laravel 中更好使用 Kratos，我寫了一個 Laravel Package：[chivincent/laravel-kratos](https://packagist.org/packages/chivincent/laravel-kratos)


> 可以在 [chivincent/laravel-kratos-demo](https://github.com/chivincent/laravel-kratos-demo) 中找到完整版的程式碼

### 建立 Laravel Application

詳細可以在 [Installation](https://laravel.com/docs/9.x/installation) 中找到如何建立新的 Laravel 應用程式

```
$ laravel new laravel-kratos-demo
```

出於習慣，在開發純 API 的專案時，我會習慣性[移除一些檔案](https://github.com/chivincent/laravel-kratos-demo/commit/7ec2d249497d3e1dd5e6ff45986b3098913a34d4)

### 安裝套件

```
$ composer require chivincent/laravel-kratos
$ php artisan vendor:publish --provider="Chivincent\LaravelKratos\KratosServiceProvider"
```

在通常情況下，`config/kratos.php` 保持預設即可

---

在 `config/auth.php` 加入以下內容

```php
return [
    // ...
    'guards' => [
        'web' => [
            // ...
        ],

        'kratos' => [
            'driver' => 'kratos',
            'provider' => 'kratos', // or 'kratos-database'
        ],
    ],
    // ...
];
```

其中 `kratos` 跟 `kratos-database` 分別是對應不同的 UserProvider：

- `kratos` 會使用 Kratos API 的 [Identity](https://github.com/ory/kratos-client-php/blob/master/lib/Model/Identity.php)
- `kratos-database` 是使用 Eloquent ORM 直接以 ID 存取 Kratos 服務所使用的資料庫取得 Model

兩者沒有優劣，但若使用 `kratos-database` 需要在正式環境中設定好權限。

---

在 `config/cors.php` 更改以下內容：

```php
<?php

return [
    // ...
    
    'allowed_origins' => ['http://127.0.0.1:4455'],
    
    // ...
    
    'supports_credentials' => true,
    
    // ...
]; 
```

此處的 `allowed_origins` 使用 `:4455` 是因為 Kratos UI 會建立在 Port 4455 上，如果有自己的 UI 請自行設定合適的 Port。

> 註：此處無法使用 `'allowed_origins' => '*'`

> 註2：Kratos Cookie 將會使用 `127.0.0.1` 而不是 `localhost`，請務必注意要用 `127.0.0.1` 存取 API

#### Database 連線

如果使用 `kratos-databse` 作為 provider，需要額外設定資料庫連線

在 `config/database.php` 中的 `connection` 加入以下內容：

```php
return [
    // ...
    'connections' => [
        'kratos' => [ // connection name should as same as `config('kratos.user_providers.kratos-database.connection')` 
            'driver' => 'pgsql',
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '5432'),
            'database' => env('DB_KRATOS_DATABASE', 'kratos'),
            'username' => env('DB_USERNAME', 'forge'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => 'utf8',
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => 'prefer',
        ],    
    ]
    // ... 
];
```

此處使用的是 PostgreSQL，如果是 MySQL 的用戶請自行更改設定

### 以 Docker 啟動服務

建立 `docker/services/database/0-init-kratos-db.sh`

```shell
#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE kratos;
	GRANT ALL PRIVILEGES ON DATABASE kratos TO $POSTGRES_USER;
EOSQL

```

這是為了額外建立 Database 給 Kratos 服務

```yaml
# docker-compose.yaml
networks:
  kratos-demo:

services:
  database:
    image: 'postgres:alpine'
    ports:
      - '5432:5432'
    environment:
      - POSTGRES_USER=forge
      - POSTGRES_PASSWORD=password
      - PGPASSWORD=password
      - POSTGRES_DB=forge
    volumes:
      - type: bind
        source: ./docker/services/database
        target: /docker-entrypoint-initdb.d
    networks: ['kratos-demo']
```

設定 Database 為 PostgreSQL

---

建立 `docker/services/kratos`，並且將 https://github.com/ory/kratos/tree/master/contrib/quickstart/kratos/email-password 的兩個檔案複製進來。

> 註：其實可以試著更換成其它不同的設定檔，Kratos UI 上會有不同的變化

建立 `docker/compose/kratos-svc.yaml`

```yaml
services:
  kratos-migrate:
    depends_on: [ 'database' ]
    image: 'oryd/kratos:v0.10.1'
    environment:
      - DSN=postgres://forge:password@database:5432/kratos?sslmode=disable&max_conns=20&max_idle_conns=4
    volumes:
      - type: bind
        source: ./docker/services/kratos
        target: /etc/config/kratos
    command: -c /etc/config/kratos/kratos.yml migrate sql -e --yes
    restart: on-failure
    networks: ['kratos-demo']

  kratos-selfservice-ui-node:
    image: oryd/kratos-selfservice-ui-node:v0.10.1
    ports:
      - '4455:4455'
    environment:
      - PORT=4455
      - SECURITY_MODE=
      - KRATOS_PUBLIC_URL=http://kratos:4433/
      - KRATOS_BROWSER_URL=http://127.0.0.1:4433/
    restart: on-failure
    networks: [ 'kratos-demo' ]

  kratos:
    depends_on: [ 'kratos-migrate' ]
    image: 'oryd/kratos:v0.10.1'
    ports:
      - '4433:4433' # public
      - '4434:4434' # admin
    environment:
      - DSN=postgres://forge:password@database:5432/kratos?sslmode=disable&max_conns=20&max_idle_conns=4
      - LOG_LEVEL=trace
    volumes:
      - type: bind
        source: ./docker/services/kratos
        target: /etc/config/kratos
    command: serve -c /etc/config/kratos/kratos.yml --dev --watch-courier
    restart: unless-stopped
    networks: ['kratos-demo']

  mailslurper:
    image: 'oryd/mailslurper:latest-smtps'
    networks: ['kratos-demo']
    ports:
      - '4436:4436'
      - '4437:4437'
```

這個設定改寫自官方的 [quickstart.yml](https://github.com/ory/kratos/blob/master/quickstart.yml)、[quickstart-standalone.yml](https://github.com/ory/kratos/blob/master/quickstart-standalone.yml) 與 [quickstart-postgres.yml](https://github.com/ory/kratos/blob/master/quickstart-postgres.yml)

---

最後，即可利用 docker compose 啟動這些服務

```shell
$ docker compose -f docker-compose.yaml -f docker/compose/kratos-svc.yaml up -d
```

### 設計 Laravel API

此時，我們可以實際設計 Laravel API

將 `routes/api.php` 更改為以下內容

```php
<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:kratos')
    ->get('/user', fn (Request $request) => response()->json($request->user()));
```

### 使用服務

- 以瀏覽器打開 `http://127.0.0.1:4455`，這是官方提供的 Kratos UI，可以註冊、登入、登出、修改用戶資料跟 Email 認證
- 利用 Fetch API 實際操作 Laravel API

```javascript
const headers = new Headers({
    'accept': 'application/json',
    'content-type': 'application/json',
})

resp = await fetch('http://127.0.0.1:8000/api/user', { headers, credential: 'include' })
await resp.json()
```

## 關於 Kratos 的認證細節

Kratos 採用 Session Cookie 進行認證，其 cookie 名為 `ory_kratos_session`。

> 註：Kratos 不使用 OpenID Connect 或 JWT 進行認證，這是因為有其它的專案專門執行這些工作（[Hydra](https://www.ory.sh/hydra/) 及 [OathKeeper](https://www.ory.sh/oathkeeper/)）

一般而言，應用程式只需要負責把 cookie string 打到 `http://{kratos}/sessions/whoami` 就可以確認用戶的 Session 是否合法，[詳情可查閱文件](https://www.ory.sh/docs/kratos/reference/api#tag/v0alpha2/operation/toSession)

### Cookie 的格式

Kratos Session 的格式是一組 base64 encoded 字串，其實現來自於 [gorilla/session](https://github.com/gorilla/sessions)，而底層為 [gorilla/securecookie](https://github.com/gorilla/securecookie)

將 `ory_kratos_session` 解碼後，可以看到它由三個部份組成：

- date：核發時間
- value：實際值
- mac：HMAC 校驗碼

> 註：解碼時需要注意，它是使用 golang 的 `base64.URLEncoding.EncodeToString()`，它會將 `+` 替換為 `-`

預設上會使用 HMAC-SHA256 將 `ory_kratos_session|{date}|{value}` 與 `kratos.yaml` 中的 `secrets.cookie` 生成校驗碼

以下用 PHP 實現校驗流程（以下僅作為示範，出於安全性考量，**非常不建議**自行實作）：

```php
$cookie = 'MTY2ODY1OTI0M3w5UTkzSVpud2ZqZi11SlI4aDVkMG1PRGxQTWFuMjdmanNfdUJsZUtNRnRJOGIxSDNSR2tKbG5NYUllNXFoUDQ3bVQ4ZGNFWjdpNFctdWZoTXJwTjJVTGMtdi1TU0l0cHhSdWZ0dFZMLWFIaDVZSzBhQ1d3cFNIbWJzUEltR01kZU9OTlk2NmlWbGc9PXwonlgqIrSfRnDjbD6RbThrSZky2c-2MFkU2Q6V3E2f3w==';

$decoded = base64_decode(str_replace('-', '+', $cookie), true);

[$date, $value, $mac] = $decoded;

$result = hash_equals(
    $mac,
    hash_hmac('sha256', "ory_kratos_session|$date|$value", $key ?: 'PLEASE-CHANGE-ME-I-AM-VERY-INSECURE', true),
);

if (! $result) {
    throw new Exception('Invalid');
}
```
