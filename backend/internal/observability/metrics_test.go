package observability

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestMiddlewareRecordsRequests(t *testing.T) {
	m := New("test", "abc123")

	r := chi.NewRouter()
	r.Use(m.Middleware)
	r.Get("/api/v1/assets/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/api/v1/assets/42", nil)
	r.ServeHTTP(httptest.NewRecorder(), req)

	// Scrape the registry and check the request was recorded against the
	// route PATTERN, not the raw URL.
	sw := httptest.NewRecorder()
	m.Handler().ServeHTTP(sw, httptest.NewRequest("GET", "/metrics", nil))

	if sw.Code != http.StatusOK {
		t.Fatalf("expected 200 from /metrics, got %d", sw.Code)
	}
	body, err := io.ReadAll(sw.Result().Body)
	if err != nil {
		t.Fatalf("failed to read /metrics body: %v", err)
	}

	want := `http_requests_total{method="GET",route="/api/v1/assets/{id}",status="200"} 1`
	if !strings.Contains(string(body), want) {
		t.Errorf("metrics output missing %q", want)
	}
	if strings.Contains(string(body), "/api/v1/assets/42") {
		t.Errorf("metrics output contains a raw URL — labels must use the route pattern")
	}
	if !strings.Contains(string(body), `collectiongeek_build_info{commit="abc123",version="test"} 1`) {
		t.Errorf("metrics output missing build info gauge")
	}
}

func TestMiddlewareCountsUnmatchedRoutes(t *testing.T) {
	m := New("test", "abc123")

	r := chi.NewRouter()
	r.Use(m.Middleware)
	r.Get("/exists", func(w http.ResponseWriter, r *http.Request) {})

	req := httptest.NewRequest("GET", "/definitely-not-a-route", nil)
	r.ServeHTTP(httptest.NewRecorder(), req)

	sw := httptest.NewRecorder()
	m.Handler().ServeHTTP(sw, httptest.NewRequest("GET", "/metrics", nil))
	body, _ := io.ReadAll(sw.Result().Body)

	// 404s must collapse into a single "unmatched" series, not one per URL.
	if !strings.Contains(string(body), `route="unmatched",status="404"`) {
		t.Errorf("metrics output missing the unmatched-route series")
	}
}
