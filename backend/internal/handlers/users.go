package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode"

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
)

type UsersHandler struct {
	convex       *convexclient.Client
	workosAPIKey string
	httpClient   *http.Client
}

func NewUsersHandler(convex *convexclient.Client, workosAPIKey string) *UsersHandler {
	return &UsersHandler{
		convex:       convex,
		workosAPIKey: workosAPIKey,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}
}

// POST /api/v1/users/me — ensure the user exists in Convex, and optionally set their username.
// Body: { "email": "...", "username": "..." } — both fields are optional.
// Called on first login (email only) and when completing username setup (email + username).
func (h *UsersHandler) UpsertUser(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Email    string `json:"email"`
		Username string `json:"username"`
	}
	// Body is optional — ignore decode errors for empty bodies.
	_ = json.NewDecoder(r.Body).Decode(&body)

	var result struct {
		ID string `json:"id"`
	}

	// Step 1: ensure the user record exists (idempotent).
	if body.Email != "" {
		if err := h.convex.Mutation(r.Context(), "users:upsertUser", map[string]any{
			"workosUserId": workosUserID,
			"email":        body.Email,
		}, &result); err != nil {
			http.Error(w, "Failed to create user", http.StatusInternalServerError)
			return
		}
	}

	// Step 2: set the username if one was provided.
	username := strings.TrimSpace(body.Username)
	if username != "" {
		if !isValidUsername(username) {
			http.Error(w, "Invalid username: 3–20 characters, letters/numbers/underscores only", http.StatusBadRequest)
			return
		}
		if err := h.convex.Mutation(r.Context(), "users:updateUser", map[string]any{
			"workosUserId": workosUserID,
			"username":     username,
		}, &result); err != nil {
			if strings.Contains(err.Error(), "Username taken") {
				http.Error(w, "Username is already taken", http.StatusConflict)
				return
			}
			http.Error(w, "Failed to update user", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(result)
}

// DELETE /api/v1/users/me — cascade-delete the authenticated user from Convex and WorkOS.
func (h *UsersHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Step 1: delete all data from Convex.
	if err := h.convex.Mutation(r.Context(), "users:deleteUserCascade", map[string]any{
		"workosUserId": workosUserID,
	}, nil); err != nil {
		http.Error(w, "Failed to delete account", http.StatusInternalServerError)
		return
	}

	// Step 2: delete the user from WorkOS.
	url := fmt.Sprintf("https://api.workos.com/user_management/users/%s", workosUserID)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodDelete, url, nil)
	if err != nil {
		http.Error(w, "Failed to build WorkOS request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+h.workosAPIKey)
	resp, err := h.httpClient.Do(req)
	if err != nil {
		http.Error(w, "Failed to reach WorkOS", http.StatusInternalServerError)
		return
	}
	defer func() {
		io.Copy(io.Discard, resp.Body) //nolint:errcheck
		resp.Body.Close()
	}()
	if resp.StatusCode >= 400 {
		http.Error(w, fmt.Sprintf("WorkOS returned %d", resp.StatusCode), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func isValidUsername(s string) bool {
	if len(s) < 3 || len(s) > 20 {
		return false
	}
	for _, r := range s {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_' {
			return false
		}
	}
	return true
}
