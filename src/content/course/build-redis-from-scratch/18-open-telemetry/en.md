---
title: "[Day 18] Open Telemetry"
codebase: '../codebase'
pubDate: 2026-10-18T18:54:32+08:00
---

[Open Telemetry](https://opentelemetry.io/) is a standard of cloud native ecosystem for observability which includes:
- Tracing: trace how request be processed, which functions are invoked.
- Metrics: collect service metrics, such as CPU/memory usage, average response time.
- Logging

> Note: this topic is too early to Olivine, I'll take some example, but I'll not explain why -- it's out of scope.

## Opentelemetry SDK

Opentelemetry provides a set of SDKs.

```shell
$ go get go.opentelemetry.io/otel go.opentelemetry.io/otel/sdk go.opentelemetry.io/otel/sdk/log go.opentelemetry.io/otel/sdk/metric go.opentelemetry.io/contrib/bridges/otelslog go.opentelemetry.io/contrib/exporters/autoexport go.opentelemetry.io/contrib/instrumentation/runtime
```

Initialize SDKs in `internal/service/otel.go`

```go {./internal/service/otel.go#L1-L170}(856ee33040dfd4e2815476eaaa582222e6ee2947)
```

This code is based on [Getting Start | OpenTelemetry](https://opentelemetry.io/docs/languages/go/getting-started/#initialize-the-opentelemetry-sdk)

Initialize SDKs in `cmd/olivine/app.go`:
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

Opentelemetry SDK provides a metrics instrumentation of go runtime in `go.opentelemetry.io/contrib/instrumentation/runtime`


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

Try to start olivine:
```shell
$ OTEL_ENABLED=1 OTEL_METRICS_EXPORTER=console go run ./cmd/olivine
```

> Note: `OTEL_METRICS_EXPORTER` is handled by `go.opentelemetry.io/contrib/exporters/autoexport`, read godoc for more information.

We can customize instrumentation of metrics:
- How many keys in `data.(*mapStorage)`?
- How's the memory usage?
- etc...

### Tracing

It's important to trace how request be handled for a client-server application, and it is easier by `trace.Start()` than before in open telemetry SDK.

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

#### Error Handling

Open telemetry SDK assume every requests are success by default, even if returns `err != nil`.

We can mark status as failed and record error by using:
```go
if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
}
```

I created a `internal/util/otel.go` with `EndSpan()` to handle it.

```go {./internal/util/otel.go#L47-L53}(856ee33040dfd4e2815476eaaa582222e6ee2947)
```

Use `defer func() { util.EndSpan(span, err) }()` instead of `defer span.End()`.

### Logging

It's no need to configure, becuase we initialized logger bridge for `slog`. 

## Jaeger, Proemetheus and Loki

Open telemetry in console is unusable: we cannot analyze it and it could be flush if too long.

- [Jaeger](https://www.jaegertracing.io/): for tracing
- [Prometheus](https://prometheus.io/): for metrics
- [Loki](https://grafana.com/oss/loki/): for logging

Start Olivine with environments below:
```shell
$ OTEL_ENABLED=1 OTEL_SERVICE_NAME=olivine OTEL_TRACES_EXPORTER=otlp OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces OTEL_METRICS_EXPORTER=otlp OTEL_EXPORTER_OTLP_METRICS_PROTOCOL=http/protobuf OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:9090/api/v1/otlp/v1/metrics OTEL_LOGS_EXPORTER=otlp OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/protobuf OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:3100/otlp/v1/logs go run ./cmd/olivine
```

### Open Telemetry Collector

Open Telemetry provides a collector to handle tracing, metrics and logging, it's no need to setup endpoints by each service. 

As production deployment, it suggests to use otel collector. 

### Grafana

Grafana is a dashboard to integrate a view or alert of open telemetry tracing, metrics and logging.

> Note: I have implemented a `docker-compose.dev.yml` and `deployments/` for open telemetry services integration, but they are out of scope.

## Conclusion

I don't think open telemetry integration (d18/otel) is good enough to merge into main branch, it misses a lot of production instrumentation or tracing.
