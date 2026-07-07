package convex

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// Client calls Convex internal mutations via the HTTP API using the deploy key.
type Client struct {
	deployURL  string
	deployKey  string
	httpClient *http.Client
}

func NewClient() (*Client, error) {
	deployURL := os.Getenv("CONVEX_DEPLOY_URL")
	if deployURL == "" {
		return nil, fmt.Errorf("CONVEX_DEPLOY_URL is not set")
	}
	deployKey := os.Getenv("CONVEX_DEPLOY_KEY")
	if deployKey == "" {
		return nil, fmt.Errorf("CONVEX_DEPLOY_KEY is not set")
	}
	return &Client{
		deployURL: strings.TrimRight(deployURL, "/"),
		deployKey: deployKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			// Child span per outbound call (Phase 3): the waterfall shows
			// Convex time as its own bar. No-op when tracing is dormant.
			Transport: otelhttp.NewTransport(http.DefaultTransport),
		},
	}, nil
}

type mutationResponse struct {
	Value        json.RawMessage `json:"value"`
	Error        *convexError    `json:"error"`
	ErrorMessage string          `json:"errorMessage"` // function-level errors from Convex
}

type convexError struct {
	Message string `json:"message"`
}

// truncateBody bounds an upstream response body for logs and error messages:
// error payloads can echo request context, and unbounded fields bloat the
// structured log stream.
func truncateBody(b []byte) string {
	const maxLoggedBody = 1024
	if len(b) > maxLoggedBody {
		return string(b[:maxLoggedBody]) + "...(truncated)"
	}
	return string(b)
}

// Mutation calls a Convex internal mutation and unmarshals the return value into result.
func (c *Client) Mutation(ctx context.Context, path string, args any, result any) error {
	body, err := json.Marshal(map[string]any{
		"path": path,
		"args": args,
	})
	if err != nil {
		return fmt.Errorf("marshaling args: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.deployURL+"/api/mutation", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Convex "+c.deployKey)

	slog.Debug("convex call", "path", path, "url", c.deployURL+"/api/mutation")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		slog.Error("convex request failed", "path", path, "error", err)
		return fmt.Errorf("calling convex: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		body := truncateBody(raw)
		slog.Error("convex returned non-200", "path", path, "status", resp.StatusCode, "body", body)
		return fmt.Errorf("convex returned %d: %s", resp.StatusCode, body)
	}

	var out mutationResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return fmt.Errorf("unmarshaling response: %w", err)
	}
	if out.Error != nil {
		slog.Error("convex mutation error", "path", path, "error", out.Error.Message)
		return fmt.Errorf("convex mutation error: %s", out.Error.Message)
	}
	if out.ErrorMessage != "" {
		slog.Error("convex mutation error", "path", path, "error", out.ErrorMessage)
		return fmt.Errorf("convex mutation error: %s", out.ErrorMessage)
	}

	if result != nil && out.Value != nil {
		if err := json.Unmarshal(out.Value, result); err != nil {
			return fmt.Errorf("unmarshaling value: %w", err)
		}
	}
	return nil
}
