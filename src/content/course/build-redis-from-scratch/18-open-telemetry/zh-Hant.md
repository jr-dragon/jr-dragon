---
title: "Day 18：OpenTelemetry"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

[OpenTelemetry](https://opentelemetry.io/) 是雲端原生生態系的 observability 標準，涵蓋：

- Tracing：追蹤請求如何處理，以及呼叫了哪些函式。
- Metrics：收集 CPU、記憶體、平均回應時間等指標。
- Logging。

> 注意：對目前的 Olivine 而言，這個主題還有些早。本章提供範例，但不深入解釋所有設計原因。

## OpenTelemetry SDK

OpenTelemetry 提供一組 SDK：

```shell
$ go get go.opentelemetry.io/otel go.opentelemetry.io/otel/sdk go.opentelemetry.io/otel/sdk/log go.opentelemetry.io/otel/sdk/metric go.opentelemetry.io/contrib/bridges/otelslog go.opentelemetry.io/contrib/exporters/autoexport go.opentelemetry.io/contrib/instrumentation/runtime
```

在 `internal/service/otel.go` 初始化：

```go {./internal/service/otel.go#L1-L170}(856ee33040dfd4e2815476eaaa582222e6ee2947)
```

這段程式以 [OpenTelemetry Getting Started](https://opentelemetry.io/docs/languages/go/getting-started/#initialize-the-opentelemetry-sdk) 為基礎。

在 `cmd/olivine/app.go` 啟用 SDK：

```diff
// file: cmd/olivine/app.go
func (app *App) Run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

+	if service.OTelEnabled() {
+		otelShutdown, err := service.SetupOTelSDK(ctx)
+		if err != nil {
+			return err
+		}
+		defer func() {
+			if err := otelShutdown(context.Background()); err != nil {
+				slog.Error("failed to shutdown otel", slog.Any("error", err))
+			}
+		}()
+	}

	slog.Info("restoring data from disk")
	// ...
}
```

### Metrics

`go.opentelemetry.io/contrib/instrumentation/runtime` 提供 Go runtime 的 metrics instrumentation：

```diff
if service.OTelEnabled() {
	otelShutdown, err := service.SetupOTelSDK(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if err := otelShutdown(context.Background()); err != nil {
			slog.Error("failed to shutdown otel", slog.Any("error", err))
		}
	}()
+	if err := runtime.Start(runtime.WithMinimumReadMemStatsInterval(time.Second)); err != nil {
+		return err
+	}
}
```

試著啟動 Olivine：

```shell
$ OTEL_ENABLED=1 OTEL_METRICS_EXPORTER=console go run ./cmd/olivine
```

> 注意：`OTEL_METRICS_EXPORTER` 由 `go.opentelemetry.io/contrib/exporters/autoexport` 處理，可參考它的 godoc。

也能自行設計 instrumentation，例如 storage 的 key 數量、記憶體用量等。

### Tracing

Client-server 應用程式需要追蹤請求流程。使用 OpenTelemetry tracer 建立 span：

```diff
// file: internal/server/handler.go
func (h *simpleHandler) ServeRESP(ctx context.Context, rd *resp.Reader) (ret resp.Value, err error) {
+	ctx, span := otel.Tracer("olivine").Start(ctx, "server.(*simpleHandler).ServeRESP")
+	defer span.End()

	command, err := resp.ReadCommand(rd)
```

```diff
// file: internal/service/cmd/ping.go
func (c *Ping) Exec(ctx context.Context, cmd *resp.Command) (ret resp.Value, err error) {
+	_, span := otel.Tracer("olivine").Start(ctx, "cmd.(*Ping).Exec")
+	defer span.End()

	if err := c.parse(cmd); err != nil {
		return nil, err
	}
```

#### 錯誤處理

只回傳 `err != nil` 不會自動讓 span 記錄為失敗。可以主動記錄錯誤與設定狀態：

```go
if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
}
```

在 `internal/util/otel.go` 建立 `EndSpan()`：

```go {./internal/util/otel.go#L47-L53}(856ee33040dfd4e2815476eaaa582222e6ee2947)
```

以 `defer func() { util.EndSpan(span, err) }()` 取代 `defer span.End()`。

### Logging

因為已初始化 `slog` logger bridge，不需要額外修改每個 logging 呼叫。

## Jaeger、Prometheus 與 Loki

只將 telemetry 印到 console 不便分析，輸出太多時也容易淹沒資訊。可以使用：

- [Jaeger](https://www.jaegertracing.io/)：Tracing。
- [Prometheus](https://prometheus.io/)：Metrics。
- [Loki](https://grafana.com/oss/loki/)：Logging。

以下列環境變數啟動 Olivine：

```shell
$ OTEL_ENABLED=1 OTEL_SERVICE_NAME=olivine OTEL_TRACES_EXPORTER=otlp OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces OTEL_METRICS_EXPORTER=otlp OTEL_EXPORTER_OTLP_METRICS_PROTOCOL=http/protobuf OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:9090/api/v1/otlp/v1/metrics OTEL_LOGS_EXPORTER=otlp OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/protobuf OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:3100/otlp/v1/logs go run ./cmd/olivine
```

### OpenTelemetry Collector

Collector 能統一接收 traces、metrics、logs，讓每個服務不必各自設定所有後端 endpoints。我建議正式部署時使用 Collector。

### Grafana

Grafana 提供整合觀測資料的 dashboard 與 alert。

> 注意：我另外實作了 `docker-compose.dev.yml` 與 `deployments/` 整合服務，但不在本章範圍。

## 目前狀態

我認為 `d18/otel` 的整合仍缺少許多正式環境所需的 instrumentation 與 tracing，因此尚不足以合併進 main。目前先以這個分支進行實驗。
