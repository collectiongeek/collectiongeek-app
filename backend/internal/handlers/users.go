package handlers

import (
	"encoding/base64"
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

// Encryption endpoints carry only the wrapped DEK + salt, each well under
// 200 bytes base64 in practice. 4KB total is several multiples of the real
// payload — enough headroom for future versioning without giving a malicious
// client room to chew memory. Reads past this cap surface from the JSON
// decoder as "http: request body too large", which we translate to 413.
const maxEncryptionPayloadBytes int64 = 4 * 1024

// isValidBase64 returns true if s parses as either standard or raw base64.
// Used to reject obviously malformed wrappedDek / keySalt values before
// they get persisted — storing a malformed wrap would brick the user's
// recovery code. The check is on shape, not content, so it doesn't
// compromise the zero-knowledge model.
func isValidBase64(s string) bool {
	if _, err := base64.StdEncoding.DecodeString(s); err == nil {
		return true
	}
	_, err := base64.RawStdEncoding.DecodeString(s)
	return err == nil
}

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

// POST /api/v1/users/me/encryption — finalize zero-knowledge encryption
// setup for the user. Body: { wrappedDek: string, keySalt: string } — both
// base64-encoded. Refuses to overwrite if encryption has already been set
// up (which would orphan all previously-encrypted data).
func (h *UsersHandler) SetEncryptionKey(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Cap the read upstream of JSON decode so an oversized body is refused
	// before it's pulled into memory.
	r.Body = http.MaxBytesReader(w, r.Body, maxEncryptionPayloadBytes)

	var body struct {
		WrappedDek string `json:"wrappedDek"`
		KeySalt    string `json:"keySalt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		if strings.Contains(err.Error(), "http: request body too large") {
			http.Error(w, "Request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if body.WrappedDek == "" || body.KeySalt == "" {
		http.Error(w, "wrappedDek and keySalt are required", http.StatusBadRequest)
		return
	}
	// Per-field cap. The outer MaxBytesReader bounds the whole request; this
	// keeps each individual field within a tight bound even if JSON overhead
	// changes shape.
	if len(body.WrappedDek) > 1024 || len(body.KeySalt) > 1024 {
		http.Error(w, "wrappedDek or keySalt exceeds size limit", http.StatusBadRequest)
		return
	}
	// Storing a malformed wrap would render the user's recovery code useless,
	// so verify the values parse as base64 (shape, not content — still ZK).
	if !isValidBase64(body.WrappedDek) || !isValidBase64(body.KeySalt) {
		http.Error(w, "wrappedDek and keySalt must be valid base64", http.StatusBadRequest)
		return
	}

	if err := h.convex.Mutation(r.Context(), "users:setEncryptionKey", map[string]any{
		"workosUserId": workosUserID,
		"wrappedDek":   body.WrappedDek,
		"keySalt":      body.KeySalt,
	}, nil); err != nil {
		if strings.Contains(err.Error(), "already set") {
			http.Error(w, "Encryption already configured", http.StatusConflict)
			return
		}
		http.Error(w, "Failed to set encryption key", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/users/me/encryption/rotate — replace wrappedDek + keySalt
// during recovery-code rotation. The client has already verified the OLD
// recovery code locally by unwrapping + re-wrapping the same DEK; the server
// just accepts the swap. Refuses if no encryption has been set up yet.
func (h *UsersHandler) RotateEncryptionKey(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Cap the read upstream of JSON decode so an oversized body is refused
	// before it's pulled into memory.
	r.Body = http.MaxBytesReader(w, r.Body, maxEncryptionPayloadBytes)

	var body struct {
		WrappedDek string `json:"wrappedDek"`
		KeySalt    string `json:"keySalt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		if strings.Contains(err.Error(), "http: request body too large") {
			http.Error(w, "Request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if body.WrappedDek == "" || body.KeySalt == "" {
		http.Error(w, "wrappedDek and keySalt are required", http.StatusBadRequest)
		return
	}
	// Per-field cap. The outer MaxBytesReader bounds the whole request; this
	// keeps each individual field within a tight bound even if JSON overhead
	// changes shape.
	if len(body.WrappedDek) > 1024 || len(body.KeySalt) > 1024 {
		http.Error(w, "wrappedDek or keySalt exceeds size limit", http.StatusBadRequest)
		return
	}
	// Storing a malformed wrap would render the user's recovery code useless,
	// so verify the values parse as base64 (shape, not content — still ZK).
	if !isValidBase64(body.WrappedDek) || !isValidBase64(body.KeySalt) {
		http.Error(w, "wrappedDek and keySalt must be valid base64", http.StatusBadRequest)
		return
	}

	if err := h.convex.Mutation(r.Context(), "users:rotateEncryptionKey", map[string]any{
		"workosUserId": workosUserID,
		"wrappedDek":   body.WrappedDek,
		"keySalt":      body.KeySalt,
	}, nil); err != nil {
		if strings.Contains(err.Error(), "No encryption key to rotate") {
			http.Error(w, "Encryption is not set up yet", http.StatusConflict)
			return
		}
		http.Error(w, "Failed to rotate encryption key", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// PUT /api/v1/users/me/theme — persist the user's UI theme + mode.
// Body: { theme?: string, themeMode?: "light" | "dark" | "system" }
func (h *UsersHandler) UpdateTheme(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Theme     *string `json:"theme"`
		ThemeMode *string `json:"themeMode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.Theme == nil && body.ThemeMode == nil {
		http.Error(w, "At least one of theme or themeMode must be provided", http.StatusBadRequest)
		return
	}

	args := map[string]any{"workosUserId": workosUserID}
	if body.Theme != nil {
		theme := strings.TrimSpace(*body.Theme)
		if theme == "" || len(theme) > 64 {
			http.Error(w, "Invalid theme", http.StatusBadRequest)
			return
		}
		args["theme"] = theme
	}
	if body.ThemeMode != nil {
		switch *body.ThemeMode {
		case "light", "dark", "system":
			args["themeMode"] = *body.ThemeMode
		default:
			http.Error(w, "themeMode must be light, dark, or system", http.StatusBadRequest)
			return
		}
	}

	if err := h.convex.Mutation(r.Context(), "users:updateTheme", args, nil); err != nil {
		http.Error(w, "Failed to update theme", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
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
