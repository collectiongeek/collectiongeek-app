package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/lestrrat-go/httprc/v3"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"
)

type contextKey string

const WorkOSUserIDKey contextKey = "workosUserId"

// JWKSMiddleware validates WorkOS JWTs using the public JWKS endpoint.
// It refreshes the key set on a background timer, so no key fetch happens per-request.
type JWKSMiddleware struct {
	cache   *jwk.Cache
	jwksURL string
}

func NewJWKSMiddleware(ctx context.Context) (*JWKSMiddleware, error) {
	clientID := os.Getenv("WORKOS_CLIENT_ID")
	if clientID == "" {
		return nil, fmt.Errorf("WORKOS_CLIENT_ID is not set")
	}

	jwksURL := fmt.Sprintf("https://api.workos.com/sso/jwks/%s", clientID)
	cache, err := jwk.NewCache(ctx, httprc.NewClient())
	if err != nil {
		return nil, fmt.Errorf("creating jwks cache: %w", err)
	}

	// WithWaitReady(false): by default Register blocks until the first
	// successful fetch, with no timeout of its own — a WorkOS outage at boot
	// would stall startup indefinitely (main.go passes context.Background()).
	// Instead, register without waiting and do a bounded eager fetch below.
	if err := cache.Register(ctx, jwksURL,
		jwk.WithMinInterval(15*time.Minute),
		jwk.WithWaitReady(false),
	); err != nil {
		return nil, fmt.Errorf("registering jwks cache: %w", err)
	}

	// Eager-fetch on startup so the first request doesn't block, bounded so
	// a JWKS outage degrades gracefully (401s until the background refresh
	// succeeds) instead of hanging boot.
	refreshCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if _, err := cache.Refresh(refreshCtx, jwksURL); err != nil {
		// Non-fatal: log and continue — the cache retries in the background.
		slog.Warn("initial JWKS fetch failed", "error", err)
	}

	return &JWKSMiddleware{cache: cache, jwksURL: jwksURL}, nil
}

func (m *JWKSMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := m.extractAndValidate(r)
		if err != nil {
			// The JSON handler escapes control characters in field values, so
			// the attacker-controlled path cannot forge log entries here.
			slog.Warn("rejecting request", "method", r.Method, "path", r.URL.Path, "error", err)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Store the WorkOS user ID (the JWT sub claim) in the request context.
		sub, ok := token.Subject()
		if !ok || sub == "" {
			slog.Warn("rejecting request: token has no sub claim", "method", r.Method, "path", r.URL.Path)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), WorkOSUserIDKey, sub)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *JWKSMiddleware) extractAndValidate(r *http.Request) (jwt.Token, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return nil, fmt.Errorf("missing bearer token")
	}
	raw := strings.TrimPrefix(authHeader, "Bearer ")

	keySet, err := m.cache.Lookup(r.Context(), m.jwksURL)
	if err != nil {
		return nil, fmt.Errorf("fetching key set: %w", err)
	}

	clientID := os.Getenv("WORKOS_CLIENT_ID")
	issuer := fmt.Sprintf("https://api.workos.com/user_management/%s", clientID)

	return jwt.Parse(
		[]byte(raw),
		jwt.WithKeySet(keySet),
		jwt.WithValidate(true),
		jwt.WithIssuer(issuer),
		// Accept up to 60s of clock skew between this server and WorkOS.
		// Without this, a backend clock running slightly behind WorkOS will
		// reject freshly-minted JWTs with `"iat" not satisfied`, which is
		// especially common inside dev containers whose host time drifts.
		// 60s is generous enough for realistic drift, tight enough not to
		// meaningfully extend a token's effective lifetime.
		jwt.WithAcceptableSkew(60*time.Second),
	)
}

// WorkOSUserID retrieves the validated WorkOS user ID from the request context.
func WorkOSUserID(r *http.Request) string {
	v, _ := r.Context().Value(WorkOSUserIDKey).(string)
	return v
}
