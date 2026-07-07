package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

// withTestTracer installs a recording tracer provider as the global for the
// duration of the test and returns the recorder.
func withTestTracer(t *testing.T) *tracetest.SpanRecorder {
	t.Helper()
	sr := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(sr))
	prev := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)
	t.Cleanup(func() { otel.SetTracerProvider(prev) })
	return sr
}

func TestSpanRouteNameUsesRoutePattern(t *testing.T) {
	sr := withTestTracer(t)

	r := chi.NewRouter()
	r.Use(SpanRouteName)
	r.Get("/api/v1/assets/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := otelhttp.NewHandler(r, "http.server")

	// The raw path contains an ID; the span name must not.
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/v1/assets/8kd93j", nil))

	spans := sr.Ended()
	if len(spans) != 1 {
		t.Fatalf("got %d spans, want 1", len(spans))
	}
	if got, want := spans[0].Name(), "GET /api/v1/assets/{id}"; got != want {
		t.Errorf("span name = %q, want %q", got, want)
	}
}

func TestSpanRouteNameBoundsUnmatchedRoutes(t *testing.T) {
	sr := withTestTracer(t)

	r := chi.NewRouter()
	r.Use(SpanRouteName)
	r.Get("/api/v1/collections", func(w http.ResponseWriter, r *http.Request) {})
	h := otelhttp.NewHandler(r, "http.server")

	// Bot-probe paths must all collapse into one span name — scanning
	// traffic must not be able to mint names.
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/wp-admin.php", nil))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/.env", nil))

	spans := sr.Ended()
	if len(spans) != 2 {
		t.Fatalf("got %d spans, want 2", len(spans))
	}
	for _, s := range spans {
		if got, want := s.Name(), "GET unmatched"; got != want {
			t.Errorf("span name = %q, want %q", got, want)
		}
	}
}

func TestRequestLoggerCarriesTraceID(t *testing.T) {
	sr := withTestTracer(t)
	buf := captureLogs(t)

	r := chi.NewRouter()
	r.Use(RequestLogger)
	r.Get("/api/v1/collections", func(w http.ResponseWriter, r *http.Request) {})
	h := otelhttp.NewHandler(r, "http.server")

	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/v1/collections", nil))

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("log output is not one JSON object: %q (%v)", buf.String(), err)
	}
	spans := sr.Ended()
	if len(spans) != 1 {
		t.Fatalf("got %d spans, want 1", len(spans))
	}
	if got, want := entry["trace_id"], spans[0].SpanContext().TraceID().String(); got != want {
		t.Errorf("logged trace_id = %v, want %v (the span's)", got, want)
	}
	if id, ok := entry["span_id"].(string); !ok || id == "" {
		t.Errorf("span_id missing or empty: %v", entry["span_id"])
	}
}

func TestRequestLoggerOmitsTraceIDWhenDormant(t *testing.T) {
	buf := captureLogs(t)

	// No otelhttp wrapper, no tracer — the pre-Phase-3 shape must not change.
	h := RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/v1/collections", nil))

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("log output is not one JSON object: %v", err)
	}
	if _, present := entry["trace_id"]; present {
		t.Errorf("trace_id present without tracing: %v", entry["trace_id"])
	}
}
