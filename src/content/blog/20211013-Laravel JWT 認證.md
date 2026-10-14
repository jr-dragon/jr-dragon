---
slug: laravel-jwt-authentication
title: "Laravel JWT 認證"
description: "Laravel JWT 認證"
pubDate: 2021-10-13T11:15:03+08:00
heroImage: '../../assets/laravel-jwt-authentication.webp'
heroImageFrom: 'https://www.pexels.com/zh-tw/photo/15177504/'
tags: [php,laravel]
---

## 現有的解決方案

就目前而言，在 Laravel 上實現 JWT 主要有兩種解決方案：

- [Laravel Passport](https://laravel.com/docs/8.x/passport)
- [tymondesigns/jwt-auth](https://github.com/tymondesigns/jwt-auth)

<!--truncate-->

### Laravel Passport

眾所周知，Laravel Passport 是個相對比較沉重的解決方案，它包含了 OAuth2 的認證協定實作，這也使它會複雜化認證服務的實作。

另一方面，Laravel Passport 預設所產生的 JWT 是難以被其它服務直接重新利用的，這是因為其 Payload 與大部份套件的實作並不相容：

```json
{
  "aud": "1",
  "jti": "8c0f82c98f5d382bdc6921024ea3480e798f5273c0e4ac9288362cc521a5bcdbbb12f8f162386f7f",
  "iat": 1619328160.832198,
  "nbf": 1619328160.832202,
  "exp": 1650864160.828512,
  "sub": "1"
}
```

在 `iat`, `nbf`, `exp` 的 timestamp 中它使用了浮點數，這在與 Golang 的 [dgrijalva/jwt-go](https://github.com/dgrijalva/jwt-go) 串接上會有些困擾。

以 Golang 的 dgrijalva/jwt-go 來說，需要進行以下改寫才能夠使用 Laravel Passport 所簽發的 JWT

```go
package main

import (
    "github.com/dgrijalva/jwt-go"
)

type LaravelPassportClaim struct {
    Scopes    []string `json:"scopes,omitempty"`
    ExpiresAt float64  `json:"exp,omitempty"`
    IssuedAt  float64  `json:"iat,omitempty"`
    NotBefore float64  `json:"nbf,omitempty"`
}

func main() {
    tokenString := "" // example jwt

    token, err := jwt.ParseWithClaims(tokenString, &LaravelPassportClaim{}, func (token *jwt.Token) (interface{}, error) {
        publicKey, err := jwt.ParseRSAPublicKeyFromPEM([]byte(os.Getenv("PASSPORT_PUBLIC_KEY")))
        if err != nil {
            panic(err)
        }
        
        return publicKey, nil
    })

    if claims, ok := token.Claims.(*LaravelPassportClaim); ok && token.Valid {
        fmt.printf("%#v", claims)
    } else {
        panic(err)
    }
}
```

### tymondesigns/jwt-auth

這個應該是 Laravel 最普遍的解決方案，它算是第一批支援 JWT Guard Authentication 的 Laravel 套件。

然而它的缺點也很明顯：

- 對 Auth Guard Contract 的誤用
    - 為了符合 Laravel Auth 的應用習慣，套件中把許多函式的行為、參數與回傳值進行變更，但這已經不符合 Laravel Auth Guard Contract 的定義
- 更新緩慢
    - 2020 年 9 月 1.0.1：為了支援 Laravel 8
    - 2020 年 11 月 1.0.2：限制底層函式庫 `lcobucci/jwt` 不得大於 3.4 版
    - 自 1.0.2 之後就再也沒有發佈過新版
    - 目前 GitHub 上的 Opened Issues 已經累積到 514 個，且社群間[已在溝通將此 Library 另外 Fork 並維護](https://github.com/tymondesigns/jwt-auth/issues/2152)

## 實作

綜上所述，就目前而言若要讓 Laravel 應用程式支援 JWT，或許自行實作會是比較好的選擇。

### 建立設定檔

建立 `config/jwt.php` 以設定 JWT：

```php
<?php

return [
    // 讓用戶可以自行選擇 JWT 的簽章演算法：
    //   - Lcobucci\JWT\Signer\Rsa\Sha256
    //   - Lcobucci\JWT\Signer\Rsa\Sha384
    //   - Lcobucci\JWT\Signer\Rsa\Sha512
    //   - Lcobucci\JWT\Signer\Hmac\Sha256
    //   - Lcobucci\JWT\Signer\Hmac\Sha384
    //   - Lcobucci\JWT\Signer\Hmac\Sha512
    //   - Lcobucci\JWT\Signer\Ecdsa\Sha256
    //   - Lcobucci\JWT\Signer\Ecdsa\Sha384
    //   - Lcobucci\JWT\Signer\Ecdsa\Sha512
    'signer' => Lcobucci\JWT\Signer\Rsa\Sha256::class,

    'key' => [
        // 對於對稱性的演算法（HMAC），使用 JWT_SECRET 作為其密鑰
        'secret' => env('JWT_SECRET', ''),
        
        // 對於非對稱性的演算法（RSA、ECDSA），使用 JWT_PUBLIC_KEY 與 JWT_PRIVATE_KEY 作為其密鑰
        'public' => env('JWT_PUBLIC_KEY', ''),
        'private' => env('JWT_PRIVATE_KEY', ''),
    ],
];
```

### 建立 JwtServiceProvider

建立 Laravel 套件時，可以建立 Service Provider 註冊或設定元件。在這個案例中我們需要在 JwtServiceProvider 中實作兩件事：

- 註冊 JwtConfig `Lcobucci\JWT\Configuration`
- 設定 JwtAuthGuard

我們先建立一個樣板：

```php
<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class JwtServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->registerJwtConfig();
    }

    public function boot()
    {
        $this->configureJwtGuard();
    }
}
```

#### registerJwtConfig

在註冊 `Lcobucci\JWT\Configuration` 時需要做到三件事：

- 確認 JWT 簽章演算法，並建立不同的 Signer Config
- 設定 ValidationConstraints：可以理解成要不要驗證 `exp`, `nbf` 之類的 JWT Spec
- 設定 BuildFactory：設定在簽發 JWT 時，是否需要加入什麼額外的設定

```php
<?php

namespace App\Providers;

use DateTimeZone;
use LogicException;
use Lcobucci\JWT\Signer;
use Illuminate\Http\Request;
use Lcobucci\Clock\SystemClock;
use Lcobucci\JWT\Token\Builder;
use Lcobucci\JWT\Encoding\JoseEncoder;
use Lcobucci\JWT\Encoding\ChainedFormatter;
use Lcobucci\JWT\Configuration as JwtConfig;
use Lcobucci\JWT\Signer\Rsa\Sha256 as RS256;
use Lcobucci\JWT\Signer\Rsa\Sha384 as RS384;
use Lcobucci\JWT\Signer\Rsa\Sha512 as RS512;
use Lcobucci\JWT\Signer\Hmac\Sha256 as HS256;
use Lcobucci\JWT\Signer\Hmac\Sha384 as HS384;
use Lcobucci\JWT\Signer\Hmac\Sha512 as HS512;
use Lcobucci\JWT\Signer\Ecdsa\Sha256 as ES256;
use Lcobucci\JWT\Signer\Ecdsa\Sha384 as ES384;
use Lcobucci\JWT\Signer\Ecdsa\Sha512 as ES512;
use Lcobucci\JWT\Validation\Constraint\SignedWith;
use Lcobucci\JWT\Validation\Constraint\StrictValidAt;

class JwtServiceProvider extends ServiceProvider
{
    private const SIGNER_ALGOS_IS_ASYMMETRIC = [
            RS256::class => true,
            RS384::class => true,
            RS512::class => true,
            ES256::class => true,
            ES384::class => true,
            ES512::class => true,
            HS256::class => false,
            HS384::class => false,
            HS512::class => false,
    ];
    
    public function register()
    {
        $this->registerJwtConfig();
    }

    public function boot()
    {
        $this->configureJwtGuard();
    }

    private function registerJwtConfig()
    {
        $this->app->singleton(JwtConfig::class, function () {
            // 確認簽章演算法，並建立不同的 Signer Config
            $config = $this->isAsymmetricSigner()
                ? JwtConfig::forAsymmetricSigner($this->getSigner(), $this->getKey(config('jwt.key.private')), $this->getKey('jwt.key.public'))
                : JwtConfig::forSymmetricSigner($this->getSigner(), $this->getKey(config('jwt.key.secret')));
            
            // 設定 ValidationConstraints
            $config->setValidationConstraints(
                ... $this->validateConstraints(),
            );

            // 設定 Build Facotry
            $config->setBuilderFactory(
                // 使用 ChainedFormatter::withUnixTimestampDates() 的原因是這樣才不會讓 iat, nbf, exp 變為浮點數
                // Laravel Passport 就是使用了預設值才會產生浮點數
                static fn () => new Builder(new JoseEncoder(), ChainedFormatter::withUnixTimestampDates()),
            );

            return $config;
        });
    }

    private function isAsymmetricSigner(): bool
    {
        return self::SIGNER_ALGOS_IS_ASYMMETRIC[config('jwt.signer')];
    }

    private function getSigner(): Signer
    {
        $signer = config('jwt.signer');
        if (! class_exists($signer)) {
            throw new LogicException("Signer [$signer] is not a valid JWT signer.");
        }

        return new $signer();
    }

    private function getKey(string $key, string $passphrase = ''): Signer\Key
    {
        return Signer\Key\InMemory::plainText($key, $passphrase);
    }

    private function validateConstraints(bool $checkValidAt): array
    {
        $constraints[] = new SignedWith(
            $this->getSigner(),
            $this->isAsymmetricSigner() ? $this->getKey(config('jwt.key.public')) : $this->getKey(config('jwt.key.secret'))
        );

        $constraints[] = new StrictValidAt(new SystemClock(new DateTimeZone(config('app.timezone'))));

        return $constraints;
    }
}
```

#### configureJwtGuard

我們需要為 Laravel Auth Guard 註冊一個新的 JwtGuard，在這裡我們會使用到一個還尚未實作的 `JwtGuard`，請先忽視即可。

我們利用 RequestGuard 去包裏這個 `JwtGuard`，使其能夠應用附帶於 HTTP Request Header 中的 Bearer Token。

> 註：這個部份借鑑了 [Laravel Sanctum](https://github.com/laravel/sanctum/blob/2.x/src/SanctumServiceProvider.php#L112) 的實作

```php
<?php

namespace App\Providers;

use Closure;
use Illuminate\Auth\AuthManager;
use Illuminate\Auth\RequestGuard;
use Illuminate\Support\Facades\Auth;
use Illuminate\Foundation\Application;
use Lcobucci\JWT\Configuration as JwtConfig;

class JwtServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->registerJwtConfig();
    }

    public function boot()
    {
        $this->configureJwtGuard();
    }

    private function configureJwtGuard()
    {
        Auth::resolve($this->resolveAuth());
    }

    private function resolveAuth(): Closure
    {
        return fn (AuthManager $auth) => $auth->extend('jwt', $this->jwtDriver($auth));
    }

    private function jwtDriver(AuthManager $auth): Closure
    {
        return fn (Application $app, string $name, array $config)
            => tap($this->createGuard($auth, $config), fn (RequestGuard $guard) => $app->refresh('request', $guard, 'setRequest'));
    }

    private function createGuard(AuthManager $auth, array $config): RequestGuard
    {
        return new RequestGuard(
            new JwtGuard(app(JwtConfig::class)),
            request(),
            $auth->createUserProvider($config['provider'] ?? null),
        );
    }
}
```

### 建立 JwtGuard

為了給 `Illuminate\Auth\RequestGuard` 使用，我們的 `JwtGuard` 必須是一個 Invokable Guard。

其主要工作有兩項

- 解析並驗證 Request Header 中的 Bearer Token
- 以 Token 中的資訊向 UserProvider 取得資料

```php
<?php

namespace App\Auth;

use Illuminate\Http\Request;
use Lcobucci\JWT\Token\Plain;
use Illuminate\Contracts\Auth\UserProvider;
use Illuminate\Auth\AuthenticationException;
use Lcobucci\JWT\Configuration as JwtConfig;
use Lcobucci\JWT\Token\InvalidTokenStructure;
use Illuminate\Contracts\Auth\Authenticatable;
use Lcobucci\JWT\Encoding\CannotDecodeContent;
use Lcobucci\JWT\Token\UnsupportedHeaderFound;
use Lcobucci\JWT\Validation\NoConstraintsGiven;
use Lcobucci\JWT\Validation\RequiredConstraintsViolated;

class JwtGuard
{
    public function __construct(
        private JwtConfig $jwt,
    ) {
    }

    public function __invoke(Request $request, UserProvider $provider): ?Authenticatable
    {
        if (! $token = $request->bearerToken()) {
            return null;
        }

        return $provider->retrieveById($this->parseToken($token)->claims()->get('sub'));
    }

    private function parseToken(string $token): Plain
    {
        try {
            $this->jwt->validator()->assert(
                $token = $this->jwt->parser()->parse($token),
                ...$this->jwt->validationConstraints()
            );

            return $token;
        } catch (CannotDecodeContent|InvalidTokenStructure|UnsupportedHeaderFound|RequiredConstraintsViolated|NoConstraintsGiven $exception) {
            throw new AuthenticationException("Invalid Token: {$exception->getMessage()}");
        }
    }
}
```

### 建立 TokenController

至此，對於 JWT 的支援準備工作幾乎都已經完成，只剩下最後一項工作：簽發 Token

> 註：在這個案例中，我們不考慮 Refresh 或 Revoke Token 的流程，這會大幅增加整個系統的複雜度，有興趣的話可以自己試著實作看看。

```php
<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Token;
use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Lcobucci\JWT\Token\Plain;
use Illuminate\Support\Facades\Hash;
use Lcobucci\JWT\Configuration as JwtConfig;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\Resources\Json\JsonResource;

class TokenController extends Controller
{
    public function issue(Request $request): JsonResource
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = $this->validateUser($request->only('username', 'password'));
        $token = $this->issueJwt($user);

        return new JsonResource([
            'token' => $token->toString(),
        ]);
    }

    private function validateUser(array $credentials): User
    {
        $user = User::where('email', $credentials['username'])->first();

        if (! Hash::check($credentials['password'], $user?->getAuthPassword())) {
            throw ValidationException::withMessages(['username' => ['auth.failed']]);
        }

        return $user;
    }

    private function issueJwt(Authenticatable $user): Plain
    {
        $now = now()->toDateTimeImmutable();

        return $this->jwt->builder()
            ->identifiedBy((string) Str::orderedUuid())
            ->issuedAt($now)
            ->canOnlyBeUsedAfter($now)
            ->expiresAt($now->modify('+2 week'))
            ->relatedTo((string) $user->getAuthIdentifier())
            ->getToken($this->jwt->signer(), $this->jwt->signingKey());
    }
}

```

## 結論

事實上，Laravel 對於認證系統的封裝已經是相當完整的，只需要整合 `Lcobucci\JWT` 這個套件幾乎就可以直接無痛應用。

對於大部份情況（沒有打算以 JWT 做跨服務認證時）下，Sanctum 及 Passport 已經是足夠使用的，這篇文章中的實作主要是為了應對以下的情況：

- 以 Laravel 實作認證伺服器，簽發 JWT 給其它服務使用
- 存在其它的認證伺服器，讓 Laravel 應用程式能夠使用其簽發的 JWT

另一方面，這篇文章中省略掉了 Token Refresh 及 Revoke 的流程，實際上的實作可以參考 Laravel Sanctum 的想法，應該就可以應對大部份的情境。