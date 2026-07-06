// Package observability wires the backend's Prometheus instrumentation: a
// request-metrics middleware for the chi router and a /metrics handler that
// is served on its own port, kept off the public one.
package observability

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
	registry         *prometheus.Registry
	requestsTotal    *prometheus.CounterVec
	requestDuration  *prometheus.HistogramVec
	requestsInFlight prometheus.Gauge
}

func New(appVersion, commit string) *Metrics {
	reg := prometheus.NewRegistry()

	// Runtime metrics every Go service should expose (GC, goroutines, memory).
	reg.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)

	// Constant 1; the labels carry the build metadata. Joining against it in
	// PromQL shows which version served any given traffic.
	buildInfo := prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "collectiongeek_build_info",
		Help: "Build metadata; value is always 1, labels carry version and commit.",
	}, []string{"version", "commit"})
	buildInfo.WithLabelValues(appVersion, commit).Set(1)

	m := &Metrics{
		registry: reg,
		requestsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "HTTP requests processed, by method, matched chi route and status code.",
		}, []string{"method", "route", "status"}),
		requestDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency in seconds, by method and matched chi route.",
			Buckets: prometheus.DefBuckets,
		}, []string{"method", "route"}),
		requestsInFlight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "http_requests_in_flight",
			Help: "HTTP requests currently being served.",
		}),
	}
	reg.MustRegister(buildInfo, m.requestsTotal, m.requestDuration, m.requestsInFlight)
	return m
}

// Middleware records count, latency and in-flight for every request. Register
// it before all other middleware so requests that fail auth, hit CORS, or
// panic (Recoverer turns those into 500s further down the chain) still count.
func (m *Metrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		m.requestsInFlight.Inc()
		defer m.requestsInFlight.Dec()

		ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		// Label with the matched route PATTERN (/api/v1/assets/{id}), never
		// the raw URL — every distinct label value becomes its own series in
		// Prometheus, so labels must stay low-cardinality.
		route := "unmatched"
		if rc := chi.RouteContext(r.Context()); rc != nil && rc.RoutePattern() != "" {
			route = rc.RoutePattern()
		}
		status := ww.Status()
		if status == 0 {
			// Handler returned without writing anything; net/http sends 200.
			status = http.StatusOK
		}
		m.requestsTotal.WithLabelValues(r.Method, route, strconv.Itoa(status)).Inc()
		m.requestDuration.WithLabelValues(r.Method, route).Observe(time.Since(start).Seconds())
	})
}

// Handler serves the registry. It is mounted on its own listener (see
// cmd/server) so /metrics is reachable by Prometheus inside the cluster but
// never through the public Service/Ingress.
func (m *Metrics) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{}))
	return mux
}
