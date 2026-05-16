package middleware

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
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
	cache := jwk.NewCache(ctx)

	if err := cache.Register(jwksURL, jwk.WithMinRefreshInterval(15*time.Minute)); err != nil {
		return nil, fmt.Errorf("registering jwks cache: %w", err)
	}

	// Eager-fetch on startup so the first request doesn't block.
	if _, err := cache.Refresh(ctx, jwksURL); err != nil {
		// Non-fatal: log and continue — cache will retry on first request.
		log.Printf("WARN: initial JWKS fetch failed: %v", err)
	}

	return &JWKSMiddleware{cache: cache, jwksURL: jwksURL}, nil
}

func (m *JWKSMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := m.extractAndValidate(r)
		if err != nil {
			log.Printf("auth: rejecting %s %s: %v", r.Method, r.URL.Path, err)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Store the WorkOS user ID (the JWT sub claim) in the request context.
		ctx := context.WithValue(r.Context(), WorkOSUserIDKey, token.Subject())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *JWKSMiddleware) extractAndValidate(r *http.Request) (jwt.Token, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return nil, fmt.Errorf("missing bearer token")
	}
	raw := strings.TrimPrefix(authHeader, "Bearer ")

	keySet, err := m.cache.Get(r.Context(), m.jwksURL)
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
