package middleware

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// captureLogs redirects the default slog output to a buffer for the duration
// of the test and restores it afterwards.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func TestRequestLoggerEmitsJSONFields(t *testing.T) {
	buf := captureLogs(t)

	h := chimiddleware.RequestID(RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("short and stout"))
	})))

	req := httptest.NewRequest("GET", "/api/v1/collections", nil)
	h.ServeHTTP(httptest.NewRecorder(), req)

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("log output is not one JSON object: %q (%v)", buf.String(), err)
	}
	if entry["msg"] != "http request" {
		t.Errorf("msg = %v, want %q", entry["msg"], "http request")
	}
	if entry["method"] != "GET" || entry["path"] != "/api/v1/collections" {
		t.Errorf("method/path = %v/%v", entry["method"], entry["path"])
	}
	if entry["status"] != float64(http.StatusTeapot) {
		t.Errorf("status = %v, want 418", entry["status"])
	}
	if entry["bytes"] != float64(len("short and stout")) {
		t.Errorf("bytes = %v, want %d", entry["bytes"], len("short and stout"))
	}
	if _, ok := entry["duration_ms"].(float64); !ok {
		t.Errorf("duration_ms missing or not a number: %v", entry["duration_ms"])
	}
	if id, ok := entry["request_id"].(string); !ok || id == "" {
		t.Errorf("request_id missing or empty: %v", entry["request_id"])
	}
}

func TestRequestLoggerEscapesHostilePath(t *testing.T) {
	buf := captureLogs(t)

	h := RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	// A path with an embedded newline must not split the log entry in two.
	req := httptest.NewRequest("GET", "/api/v1/x", nil)
	req.URL.Path = "/api/v1/x\nFORGED log line"
	h.ServeHTTP(httptest.NewRecorder(), req)

	if lines := bytes.Count(bytes.TrimSpace(buf.Bytes()), []byte("\n")) + 1; lines != 1 {
		t.Fatalf("hostile path produced %d log lines, want 1: %q", lines, buf.String())
	}
	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("output not valid JSON: %v", err)
	}
	if entry["path"] != "/api/v1/x\nFORGED log line" {
		t.Errorf("path not preserved verbatim inside JSON: %v", entry["path"])
	}
}

func TestRequestLoggerSkipsHealthz(t *testing.T) {
	buf := captureLogs(t)

	h := RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/healthz", nil))

	if buf.Len() != 0 {
		t.Errorf("healthz request was logged: %q", buf.String())
	}
}
