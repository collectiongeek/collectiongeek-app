package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
)

type AssetsHandler struct {
	convex *convexclient.Client
}

func NewAssetsHandler(convex *convexclient.Client) *AssetsHandler {
	return &AssetsHandler{convex: convex}
}

type customFieldInput struct {
	FieldName  string `json:"fieldName"`
	FieldValue string `json:"fieldValue"`
	FieldType  string `json:"fieldType"`
}

type createAssetBody struct {
	CollectionID   string             `json:"collectionId"`
	Name           string             `json:"name"`
	Description    string             `json:"description"`
	DateAcquired   string             `json:"dateAcquired"`
	PurchasedValue *int64             `json:"purchasedValue"`
	MarketValue    *int64             `json:"marketValue"`
	Tags           []string           `json:"tags"`
	Category       string             `json:"category"`
	CustomFields   []customFieldInput `json:"customFields"`
}

// POST /api/v1/assets
func (h *AssetsHandler) CreateAsset(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body createAssetBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" || len(body.Name) > 200 {
		http.Error(w, "Name must be between 1 and 200 characters", http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId": workosUserID,
		"collectionId": body.CollectionID,
		"name":         body.Name,
	}
	if body.Description != "" {
		args["description"] = strings.TrimSpace(body.Description)
	}
	if body.DateAcquired != "" {
		args["dateAcquired"] = body.DateAcquired
	}
	if body.PurchasedValue != nil {
		args["purchasedValue"] = *body.PurchasedValue
	}
	if body.MarketValue != nil {
		args["marketValue"] = *body.MarketValue
	}
	if len(body.Tags) > 0 {
		args["tags"] = body.Tags
	}
	if body.Category != "" {
		args["category"] = strings.TrimSpace(body.Category)
	}
	if len(body.CustomFields) > 0 {
		args["customFields"] = body.CustomFields
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := h.convex.Mutation(r.Context(), "assets:createAsset", args, &result); err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Collection not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to create asset", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

// PUT /api/v1/assets/:id
func (h *AssetsHandler) UpdateAsset(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "id")

	var body struct {
		Name           *string            `json:"name"`
		Description    *string            `json:"description"`
		DateAcquired   *string            `json:"dateAcquired"`
		PurchasedValue *int64             `json:"purchasedValue"`
		MarketValue    *int64             `json:"marketValue"`
		Tags           []string           `json:"tags"`
		Category       *string            `json:"category"`
		CustomFields   []customFieldInput `json:"customFields"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId": workosUserID,
		"assetId":      assetID,
	}
	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		if name == "" || len(name) > 200 {
			http.Error(w, "Name must be between 1 and 200 characters", http.StatusBadRequest)
			return
		}
		args["name"] = name
	}
	if body.Description != nil {
		args["description"] = strings.TrimSpace(*body.Description)
	}
	if body.DateAcquired != nil {
		args["dateAcquired"] = *body.DateAcquired
	}
	if body.PurchasedValue != nil {
		args["purchasedValue"] = *body.PurchasedValue
	}
	if body.MarketValue != nil {
		args["marketValue"] = *body.MarketValue
	}
	if body.Tags != nil {
		args["tags"] = body.Tags
	}
	if body.Category != nil {
		args["category"] = strings.TrimSpace(*body.Category)
	}
	if body.CustomFields != nil {
		args["customFields"] = body.CustomFields
	}

	if err := h.convex.Mutation(r.Context(), "assets:updateAsset", args, nil); err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Asset not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to update asset", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/assets/:id
func (h *AssetsHandler) DeleteAsset(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "id")

	if err := h.convex.Mutation(r.Context(), "assets:deleteAsset", map[string]any{
		"workosUserId": workosUserID,
		"assetId":      assetID,
	}, nil); err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Asset not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete asset", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
