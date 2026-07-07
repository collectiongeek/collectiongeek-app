package observability

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel"
)

// restoreGlobals undoes SetupTracing's global registrations after the test.
func restoreGlobals(t *testing.T) {
	t.Helper()
	prevTP := otel.GetTracerProvider()
	prevProp := otel.GetTextMapPropagator()
	t.Cleanup(func() {
		otel.SetTracerProvider(prevTP)
		otel.SetTextMapPropagator(prevProp)
	})
}

func TestSetupTracingDormantWithoutEndpoint(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	shutdown, err := SetupTracing(context.Background(), "test", "abc123")
	if err != nil {
		t.Fatalf("dormant setup errored: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Errorf("dormant shutdown errored: %v", err)
	}
}

// The enabled path must construct cleanly — in particular resource.New errors
// if the schema URL we set conflicts with the one the SDK's own detectors
// (WithTelemetrySDK etc.) emit under, and that error would abort boot.
// Nothing connects to the endpoint here; the exporter dials lazily.
func TestSetupTracingBootsWithEndpoint(t *testing.T) {
	restoreGlobals(t)
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:1") // never dialed

	shutdown, err := SetupTracing(context.Background(), "test", "abc123")
	if err != nil {
		t.Fatalf("enabled setup errored: %v", err)
	}
	// Shutdown flushes an empty batcher; must not block or error.
	if err := shutdown(context.Background()); err != nil {
		t.Errorf("shutdown errored: %v", err)
	}
}
