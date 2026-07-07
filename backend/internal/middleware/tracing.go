package middleware

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/otel/trace"
)

// SpanRouteName renames the request's span to "METHOD /route/{pattern}" once
// chi has resolved the route. otelhttp (which opens the span) runs outside the
// router and only knows the raw path — and raw paths contain IDs, which would
// mint one span name per asset. Span names must be low-cardinality for the
// same reason metric labels and log labels must be: grouping. The raw path
// stays available as a span attribute.
func SpanRouteName(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
		if span := trace.SpanFromContext(r.Context()); span.IsRecording() {
			if pattern := chi.RouteContext(r.Context()).RoutePattern(); pattern != "" {
				span.SetName(r.Method + " " + pattern)
			}
		}
	})
}
