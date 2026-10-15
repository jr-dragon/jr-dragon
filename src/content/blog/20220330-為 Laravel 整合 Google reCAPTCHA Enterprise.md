---
slug: intergrate-google-recaptcha-enterprise-in-laravel
title: "為 Laravel 整合 Google reCAPTCHA Enterprise"
description: "以 Google 官方 SDK 將 reCAPTCHA Enterprise 整合至 Laravel，透過自訂 Validation Rule 與 Middleware 驗證 API 請求的 Token，並示範如何模擬 SDK 的單元測試。"
pubDate: 2022-03-30T14:15:42+08:00
heroImage: "../../assets/intergrate-google-recaptcha-enterprise-in-laravel.webp"
heroImageFrom: "https://www.pexels.com/zh-tw/photo/6069/"
tags: [php,laravel]
---

Google reCAPTCHA 是一個人類行為驗證機制，用於阻止爬蟲或類似的機器行為。

- v1 (2007)：基於驗證碼
- v2 (2014)：I'm not a robot 勾選框
- v3 (2018)：對當前用戶進行評分
- Enterprise (2020)：與 v3 類似，但加入更多功能（如密碼洩露檢測）

就目前為止，除了 Google 官方的 SDK 之外，幾乎找不到針對 reCAPTCHA enterprise 實作的 PHP 套件（大多都是 reCAPTCHA v2 及 v3）。

<!--truncate-->

## 目標

- 使用 [Google reCAPTCHA Enterprise](https://cloud.google.com/recaptcha-enterprise?hl=zh-tw)
    - 採用 [google/cloud-recaptcha-enterprise](https://packagist.org/packages/google/cloud-recaptcha-enterprise) SDK
- 使 Laravel APIs 能夠受到保護
    - 在所有的請求中加入 `g-recaptcha-token` 的 HTTP Header，並以 Middleware 驗證

## 實作

### 申請 reCAPTCHA Enterprise

> 註：如果完全沒有使用過 Google Cloud Platform，需要建立一個 Google 帳號並且建立一個 GCP Project 才能進行以下步驟

1. 在 Google Cloud Platform 上選擇 [安全性 > reCAPTCHA Enterprise](https://console.cloud.google.com/security/recaptcha)
2. 選擇「建立金鑰」
    - 名稱可自行決定
    - 如果是測試用，可選擇「停用網域驗證」及「這是測試金鑰」
3. 複製「金鑰 ID」，這個就是後續步驟中的 sitekey

### 建立前端頁面

```html
<html>
<head>
    <script src="https://www.google.com/recaptcha/enterprise.js?render={SITE_KEY}"></script>
    <script src="https://unpkg.com/axios/dist/axios.min.js"></script>
    <script>
        grecaptcha.enterprise.ready(async function () {
            let token = await grecaptcha.enterprise.execute('{SITE_KEY}', {action: 'testpage'});
            axios.defaults.headers.common['g-recaptcha-token'] = token;
        });
    </script>
</head>
</html>
```

需特別注意以上範例中的 `{SITE_KEY}`，請填入上個步驟提供的「金鑰 ID」。

這邊另外使用 [axios](https://github.com/axios/axios) 函式庫，將每一個請求都代入 `g-recaptcha-token` HTTP Header。

### Laravel 實作

#### config 設計

在 `config/services.php` 中加入以下內容

```php
return [
    // ...

    'google' => [
        'projectId' => env('GOOGLE_CLOUD_PROJECT'),
        'credentials' => env('GOOGLE_APPLICATION_CREDENTIALS'),

        'recaptcha_enterprise' => [
            'enabled' => env('GOOGLE_CLOUD_RECAPTCHA_ENTERPRISE_ENABLED', true),
            'site_key' => env('GOOGLE_CLOUD_RECAPTCHA_ENTERPRISE_SITE_KEY'),
        ],

    ]
];
```

這時就可以利用 `.env` 或環境變數操作這些值，甚至還可以整合多種不同的 GCP 服務（例如 Google Cloud Storage）。

> 註：`GOOGLE_APPLICATION_CREDENTIALS` 的值是 [GCP Service Account](https://cloud.google.com/iam/docs/service-accounts) 的憑證（通常是一個 JSON 檔），可以是路徑也可以是檔案內容。

#### Service Provider

以 `php artisan make:provider GoogleServiceProvider` 建立一個 Laravel Service Provider

```php
<?php

namespace App\Providers;

use Illuminate\Support\Arr;
use Illuminate\Foundation\Application;
use Illuminate\Support\ServiceProvider;
use Google\Cloud\RecaptchaEnterprise\V1\Event;
use Google\Cloud\RecaptchaEnterprise\V1\RecaptchaEnterpriseServiceClient;

class GoogleServiceProvider extends ServiceProvider
{
    public function register()
    {
        if (config('services.google.recaptcha_enterprise.enabled')) {
            $this->registerRecaptchaEnterprise();
        }
    }

    public function boot()
    {
        //
    }

    protected function registerRecaptchaEnterprise()
    {
        $this->app->singleton(
            RecaptchaEnterpriseServiceClient::class,
            fn (Application $app) => new RecaptchaEnterpriseServiceClient(Arr::only($app['config']->get('services.google'), ['credentials', 'projectId']))
        );
        $this->app->singleton(
            Event::class,
            fn (Application $app) => (new Event())->setSiteKey($app['config']->get('services.google.recaptcha_enterprise.site_key')),
        );
    }
}
```

利用 `$this->app->singleton()` 註冊 `RecaptchaEnterpriseServiceClient` 及 `Event`，方便讓 Laravel 的 Dependency Injection 取用。

> 註：其實可以在這個 Service Provider 中註冊多個不同的 GCP 服務，只要用各種 Feature Toggle 就可以決定這些服務是否啟動。

#### 建構 Validation Rule

為了驗證 reCAPTCHA token，採用 Laravel Validator 的 [Custom Validation Rule](https://laravel.com/docs/9.x/validation#custom-validation-rules)

以 `php artisan make:rule GoogleRecaptcha` 建立 Custom Validation Rule：

```php
<?php

namespace App\Rules;

use Illuminate\Contracts\Validation\Rule;
use Google\Cloud\RecaptchaEnterprise\V1\Event;
use Google\Cloud\RecaptchaEnterprise\V1\Assessment;
use Google\Cloud\RecaptchaEnterprise\V1\TokenProperties\InvalidReason;
use Google\Cloud\RecaptchaEnterprise\V1\RecaptchaEnterpriseServiceClient;

class GoogleRecaptcha implements Rule
{
    public string $errorMessage = '';
    protected RecaptchaEnterpriseServiceClient $client;
    protected string $project;

    /**
     * Create a new rule instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->client = app(RecaptchaEnterpriseServiceClient::class);
        $this->project = $this->client->projectName(config('services.google.projectId'));
    }

    /**
     * Determine if the validation rule passes.
     */
    public function passes($attribute, $token)
    {
        $result = $this->client->createAssessment(
            $this->project,
            new Assessment(['event' => app(Event::class)->setToken($token)]),
        );

        if (!$result->getTokenProperties()->getValid()) {
            $this->errorMessage = sprintf(
                'The :attribute is invalid, because of "%s".',
                InvalidReason::name($result->getTokenProperties()->getInvalidReason())
            );
            return false;
        }

        return true;
    }

    /**
     * Get the validation error message.
     *
     * @return string
     */
    public function message()
    {
        return $this->errorMessage;
    }
}
```

> 註：這段程式改寫自 [Create Assessment](https://cloud.google.com/recaptcha-enterprise/docs/create-assessment)

如此一來，便可以利用 `Validator::make(['g-recaptcha-token' => 'foo-bar'], ['g-recaptcha-token' => 'required', 'string', new GoogleRecaptcha()])` 驗證用戶傳過來的 token 是否合法。

#### 建立 Middleware

有別與大部份的套件，我希望可以在每一次的 API 請求中都驗證用戶是否合法（reCAPTCHA Enterprise 的免費額度是 100 萬次創建評估操作，應該根據自己的實際需求進行設計），於是採用 Laravel Middleware 驗證。

以 `php artisan make:middleware VerifyGoogleRecaptcha` 建立驗證用的 Middleware：

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Rules\GoogleRecaptcha;
use Illuminate\Support\Facades\Validator;

class VerifyGoogleRecaptcha
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next)
    {
        $this->validateGoogleRecaptcha($request);

        return $next($request);
    }

    protected function validateGoogleRecaptcha(Request $request)
    {
        if (! config('services.google.recaptcha_enterprise.enabled')) {
            return;
        }

        Validator::validate($request->header(), [
            'g-recaptcha-token.0' => ['bail', 'required', 'string', new GoogleRecaptcha()],
        ]);
    }
}
```

### 撰寫測試

正如同我們所熟知的，自動化測試是現代軟體開發中必不可少的一環。

在這個案例中，應該被測試的標的有兩個：`GoogleRecaptcha` Validation Rule 及 `VerifyGoogleRecaptcha` Middleware。

另外，我們一般不希望自動化測試時會去存取 API，所以還需要 mock 這個 Google reCAPTCHA Enterprise SDK，得益於 Laravel 的測試，我們可以很輕鬆地做到這些事。

#### 測試 Validation Rule

```php
public function test_passes()
{
    $this->mock(RecaptchaEnterpriseServiceClient::class, function (MockInterface $m) {
        $assessment = Mockery::mock(Assessment::class);
        $assessment->shouldReceive('getTokenProperties->getValid')->andReturnTrue();

        $m->shouldReceive('projectName')
            ->with(config('services.google.projectId'))
            ->once()
            ->andReturn('projects/foo-bar');
        $m->shouldReceive('createAssessment')
            ->once()
            ->andReturn($assessment);
    });

    $this->assertTrue((new GoogleRecaptcha())->passes('g-recaptcha-token', 'foobar'));
}

public function test_failed_because_of_expired()
{
    $this->mock(RecaptchaEnterpriseSerivceClient::class, function (MockInterface $m) {
        $assessment = Mockery::mock(Assessment::class);
        $assessment->shouldReceive('getTokenProperties->getValid')->andReturnFalse();
        $assessment->shouldReceive('getTokenProperties->getInvalidReason')->andReturn(InvalidReason::EXPIRED);

        $m->shouldReceive('projectName')
            ->with(config('services.google.projectId'))
            ->once()
            ->andReturn('projects/foo-bar');
        $m->shouldReceive('createAssessment')
            ->once()
            ->andReturn($assessment);
    });

    $rule = new GoogleRecaptcha();

    $this->assertTrue($rule->passes('g-recaptcha-token', ''));
    $this->assertSame($rule->message(), 'The :attribute is invalid, because of "EXPIRED".');
}
```

#### 測試 Middleware

```php
public function test_missing_recaptcha_header()
{
    $this->expectExcpetion(ValidatoinException::class);
    
    $middleware = new VerifyGoogleRecaptcha();
    $middleware->handle(
        Request::create('/'),
        fn() => null, // do nothing
    );
}
```

Laravel Middleware 其實只是一個單純的 Class，其中含有 `handle(Request $request, Closure $next)` 的 method，只要知道它的特性就能夠很容易地去測試。

## 結論

嚴格來說，在基本上使用上 reCAPTCHA v3 與 Enterprise 版的差異並不大，這篇筆記主要是記錄一些在實作上的思路與 Custom Validation Rule 及 Middleware 在 Unit Test 上的實作手段。

另一方面，以這個設計為基礎還能有以下的實作手段：

- 在 Laravel 之前（如 Nginx）驗證 reCAPTCHA token，這可以降低 Laravel 的實作複雜度與處理效率
- 抽樣分析，不是每一個請求都會建立評估，這可以有效降低 reCAPTCHA 的應用成本
    - 如何平衡抽樣數與風險
    - 如何建立合適的抽樣模型
- 搭配 Cloudflare 或類似的 CDN 服務，在進入應用程式之前先過濾一輪