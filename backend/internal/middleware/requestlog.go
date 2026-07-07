package middleware

import (
	"log/slog"
	"net/http"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/otel/trace"
)

// RequestLogger emits one structured log event per request — the individual
// requests the RED metrics aggregate away. Fields, not prose, so LogQL can
// filter on them at query time (`| json | status >= 500`).
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			// Probes fire every few seconds per pod; logging them is noise.
			next.ServeHTTP(w, r)
			return
		}
		ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()
		next.ServeHTTP(ww, r)
		attrs := []any{
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.Status(),
			"bytes", ww.BytesWritten(),
			"duration_ms", float64(time.Since(start).Microseconds())/1000.0,
			"request_id", chimiddleware.GetReqID(r.Context()),
		}
		// The log↔trace join (Phase 3): when tracing is live, every request
		// log carries the IDs Grafana links on. Dormant tracing → no fields.
		if sc := trace.SpanFromContext(r.Context()).SpanContext(); sc.HasTraceID() {
			attrs = append(attrs, "trace_id", sc.TraceID().String(), "span_id", sc.SpanID().String())
		}
		slog.Info("http request", attrs...)
	})
}
