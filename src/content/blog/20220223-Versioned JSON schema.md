---
slug: versioned-json-schema
title: "資料庫中的版本化 JSON"
description: "為資料庫中的 JSON 加入 version 與 payload，透過 Laravel Eloquent 的型別轉換、Castable Model 與版本解析器，處理資料格式演進及新舊版本並存的維護問題。"
pubDate: 2022-02-23T14:45:06+08:00
heroImage: '../../assets/versioned-json-schema.jpg'
heroImageFrom: 'https://www.pexels.com/zh-tw/photo/11035481/'
tags: [php,laravel]
---

隨著 MySQL 5.7 加入對 JSON 格式的原生支援，開始有許多開發團隊把 RDBMS 當 NoSQL 使用。本篇文章對於效能議題暫且擱置，顯而易見地，越自由的格式往往會帶來更沉重的維護成本。

舉例來說，目前資料庫中可能存在以下型式的資料

```json
{
    "age": 16,
    "avatar": "avatars/avatar.png"
}
```

然而可能因為系統改版，需要更精準地計算用戶年齡，所以將 `age` 欄位改為 `birth`

```json
{
    "birth": "2002-01-01",
    "avatar": "avatars/avatar.png"
}
```

此時資料庫中就會同時存在兩種不同格式的資料，無論是改版時一次變更所有記錄，或是在取得資料時針對資料格式重新設計，這都會花費較大的維運成本。

更好的做法應該是將 JSON Payload 連同版本資訊一起被加入：

```json
{
    "version": 1,
    "payload": {
        "age": 16,
        "avatar": "avatars/avatar.png"
    }
}

{
    "version": 2,
    "payload": {
        "birth": "2002-01-01",
        "avatar": "avatars/avatar.png"
    }
}
```

如此一來，只要確定 `version` 資訊就可以代入合適的 Parser 進行處理。

## Laravel 中的 JSON casting

在 Laravel 的 Eloquent Model 中，如果要定義一個欄位為 JSON 格式可以用 `$cast` 這個 property 來定義：

```php
protected $casts = [
    'profile' => 'array',
    // 'profile' => 'object',
];

$user = User::first();
$user->profile['birth']; // 2002-01-01
$user->profile['avatar']; // avatars/avatar.png
```

嚴厲一點地說，這種設計方法是不負責任的。因為我們無法從 Eloquent Model 的定義中，得知在 `profile` 這個欄位的格式。

在 Laravel 8 及之前的版本，可以藉由定義一個 Castable Model 來解釋 JSON 資料的定義：

```php
// app/Casts/UserProfileCast.php
class UserProfileCast
{
    public function get()
    {
        // ...
    }

    public function set()
    {
        // ... 
    }
}

// app/Models/UserProfile.php
class UserProfile implements Castable
{
    public function __construct(
        public Carbon $birth,
        public ?string $avatar,
    ) {
    }

    public static function castUsing(array $args)
    {
        return UserProfileCast::class;
    }
}

// app/Models/User.php
protected $casts = [
    'profile' => Profile::class,
];
```

這種寫法在 Laravel 9 被簡化，使 getter 及 setter 可以被以 Eloquent Model 被定義：

```php
// app/Models/UserProfile.php
class UserProfile
{
    public static function fromJson(string $json): static
    {
        return new UserProfile(json_decode($json));
    }
}

// app/Models/User.php
public function profile(): Attribute
{
    return new Attribute(
        get: fn(?string $value) => $value ? UserProfile::fromJson($value) : null,
        set: fn(?UserProfile $profile) => $value?->toJson(),
    );
}
```

## 在 Laravel 中實現 Versioned JSON

綜上所述，如果要在 Laravel 中實現 Versioned JSON，一般我會習慣用以下的方式實現：

### VersionedJson trait

用於讓有需要實現 Versioned JSON 的 Catable Model 有共通的存取介面

```php
trait VersionedJson
{
    abstract public function payload(): array

    public function jsonSerializable(): string
    {
        return $this->toArray();
    }

    public function toArray(): array
    {
        return [
            'version' => static::VERSION,
            'payload' => $this->payload(),
        ];
    }

    public function toJson($options = JSON_THROW_ON_ERROR): string
    {
        return json_encode($this, $options);
    }

    public static function fromJson(string $json): self
    {
        // For supporting multiple version of builder, it could be implemented as a "version function"
        // e.g. To make a version 1 builder, class should implement a static function call "v1":
        //     public static function v1(array $payload) { ... }
        // When "version function" hasn't been implemented or parse failed, it is an invalid version
        if (! method_exists(static::class, "v{$decoded['version']}")) {
            throw new RuntimeException("unsupported payload version: {$decoded['version']}");
        }

        return call_user_func("static::v{$decoded['version']}", $decoded['payload']);
    }
}
```

### Castable Model

所謂的 Castable Model 就是指 JSON 格式資料的詳細定義，例如 `UserProfile` 就是一個 Castable Model

```php
class UserProfile implements JsonSerializable, Jsonable, Arrayable
{
    use VersionedJson;

    public const VERSION = 1;

    public function __construct(
        public ?Carbon $birth,
        public ?string $avatar,
    ) {
    }

    public function payload(): array
    {
        return [
            'birth' => $this->birth,
            'avatar' => $this->avatar,
        ];
    }

    protected static function v1(array $payload): self
    {
        return new self(
            $payload['birth'] ? Carbon::createFromDateString($payload['birth']) : null,
            $payload['avatar'] ?? null,
        );
    }
}
```

註：如果有需要針對 Payload 做驗證，可以在 builder（`protected static function v1`）中加入 Validator。

### Model

最後，在 User Model 中引用這個 Castable Model

```php
class User extends Model
{
    // ...

    public function profile(): Attribute
    {
        return new Attribute(
            get: fn(?string $value) => $value ? UserProfile::fromJson($value) : null,
            set: fn(?UserProfile $profile) => $profile?->toJson(),
        );
    }

    // ...
}
```

### 版本更新

當 JSON Schema 有所更新時，只要更動 Castable Model 中的 `VERSION` 資訊，並且建構合適的 builder（如 `protected static function v2`）即可。對於之前版本的資料，因為 builder 仍然存在所以依然能夠解析（除非建構子的參數有變化）

值得注意的是，前端程式也可以利用 `VERSION` 資訊建構合適的解析器，這在使用 Typescript 這類技術的前端程式中更加方便。
