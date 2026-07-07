package observability

import (
	"context"
	"log/slog"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.34.0"
)

// SetupTracing wires the global OpenTelemetry tracer provider (observability
// Phase 3). It keys off the standard env var: when OTEL_EXPORTER_OTLP_ENDPOINT
// is unset, tracing stays dormant — no exporter, no goroutines — so local dev
// and any environment without a collector behave exactly as before.
//
// The returned shutdown func flushes the span batcher; call it on the way out.
func SetupTracing(ctx context.Context, version, commit string) (func(context.Context) error, error) {
	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" {
		slog.Info("tracing disabled: OTEL_EXPORTER_OTLP_ENDPOINT not set")
		return func(context.Context) error { return nil }, nil
	}

	// Endpoint, protocol and headers all come from the standard OTEL_* env
	// vars — the deployment decides where spans go, the code doesn't care.
	exp, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, err
	}

	res, err := resource.New(ctx,
		// Merge OTEL_RESOURCE_ATTRIBUTES (e.g. deployment.environment.name,
		// set per env in the backend chart values).
		resource.WithFromEnv(),
		resource.WithAttributes(
			semconv.ServiceName("backend"),
			semconv.ServiceVersion(version),
			attribute.String("service.commit", commit),
		),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
		// 100% sampling, knowingly: at our volume the trace you want should
		// always exist. This is the dial to turn when traffic makes
		// "everything" expensive — see Phase 3 doc §3.1.
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.AlwaysSample())),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{}, propagation.Baggage{},
	))
	slog.Info("tracing enabled", "endpoint", os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	return tp.Shutdown, nil
}
