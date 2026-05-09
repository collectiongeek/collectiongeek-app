package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode"

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
)

type UsersHandler struct {
	convex *convexclient.Client
}

func NewUsersHandler(convex *convexclient.Client) *UsersHandler {
	return &UsersHandler{convex: convex}
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

	// Step 2: delete the user from WorkOS (best-effort — Convex data is already gone).
	if apiKey := os.Getenv("WORKOS_API_KEY"); apiKey != "" {
		url := fmt.Sprintf("https://api.workos.com/user_management/users/%s", workosUserID)
		req, err := http.NewRequestWithContext(r.Context(), http.MethodDelete, url, nil)
		if err == nil {
			req.Header.Set("Authorization", "Bearer "+apiKey)
			client := &http.Client{Timeout: 10 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				log.Printf("WorkOS delete user %s: request error: %v", workosUserID, err)
			} else {
				resp.Body.Close()
				if resp.StatusCode >= 400 {
					log.Printf("WorkOS delete user %s: HTTP %d", workosUserID, resp.StatusCode)
				}
			}
		}
	} else {
		log.Printf("WORKOS_API_KEY not set — WorkOS user %s not deleted", workosUserID)
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
