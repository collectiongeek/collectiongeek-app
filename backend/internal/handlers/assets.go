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

type descriptorValueInput struct {
	DescriptorID string `json:"descriptorId"`
	Value        string `json:"value"`
}

type createAssetBody struct {
	AssetTypeID      string                 `json:"assetTypeId"`
	Name             string                 `json:"name"`
	Description      string                 `json:"description"`
	DateAcquired     string                 `json:"dateAcquired"`
	PurchasedValue   *int64                 `json:"purchasedValue"`
	MarketValue      *int64                 `json:"marketValue"`
	Tags             []string               `json:"tags"`
	CollectionIDs    []string               `json:"collectionIds"`
	DescriptorValues []descriptorValueInput `json:"descriptorValues"`
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
		"name":         body.Name,
	}
	if body.AssetTypeID != "" {
		args["assetTypeId"] = body.AssetTypeID
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
	if len(body.CollectionIDs) > 0 {
		args["collectionIds"] = body.CollectionIDs
	}
	if len(body.DescriptorValues) > 0 {
		args["descriptorValues"] = body.DescriptorValues
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := h.convex.Mutation(r.Context(), "assets:createAsset", args, &result); err != nil {
		if strings.Contains(err.Error(), "Asset type not found") {
			http.Error(w, "Asset type not found", http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "Collection not found") {
			http.Error(w, "Collection not found", http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "Cannot set descriptor values without an asset type") {
			http.Error(w, "Cannot set descriptor values without an asset type", http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "Descriptor does not belong to asset type") {
			http.Error(w, "Descriptor does not belong to the chosen asset type", http.StatusBadRequest)
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
		AssetTypeID      *string                `json:"assetTypeId"`
		Name             *string                `json:"name"`
		Description      *string                `json:"description"`
		DateAcquired     *string                `json:"dateAcquired"`
		PurchasedValue   *int64                 `json:"purchasedValue"`
		MarketValue      *int64                 `json:"marketValue"`
		Tags             []string               `json:"tags"`
		CollectionIDs    []string               `json:"collectionIds"`
		DescriptorValues []descriptorValueInput `json:"descriptorValues"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId": workosUserID,
		"assetId":      assetID,
	}
	if body.AssetTypeID != nil {
		args["assetTypeId"] = *body.AssetTypeID
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
	if body.CollectionIDs != nil {
		args["collectionIds"] = body.CollectionIDs
	}
	if body.DescriptorValues != nil {
		args["descriptorValues"] = body.DescriptorValues
	}

	if err := h.convex.Mutation(r.Context(), "assets:updateAsset", args, nil); err != nil {
		if strings.Contains(err.Error(), "Asset type not found") {
			http.Error(w, "Asset type not found", http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "Collection not found") {
			http.Error(w, "Collection not found", http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "Asset not found") {
			http.Error(w, "Asset not found", http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "Cannot set descriptor values without an asset type") {
			http.Error(w, "Cannot set descriptor values without an asset type", http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "Descriptor does not belong to asset type") {
			http.Error(w, "Descriptor does not belong to the chosen asset type", http.StatusBadRequest)
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
		if strings.Contains(err.Error(), "Asset not found") {
			http.Error(w, "Asset not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete asset", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/assets/:id/collections — body: { collectionId: string }
func (h *AssetsHandler) AddToCollection(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "id")

	var body struct {
		CollectionID string `json:"collectionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CollectionID == "" {
		http.Error(w, "collectionId is required", http.StatusBadRequest)
		return
	}

	if err := h.convex.Mutation(r.Context(), "assets:addAssetToCollection", map[string]any{
		"workosUserId": workosUserID,
		"assetId":      assetID,
		"collectionId": body.CollectionID,
	}, nil); err != nil {
		if strings.Contains(err.Error(), "Asset not found") {
			http.Error(w, "Asset not found", http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "Collection not found") {
			http.Error(w, "Collection not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to add asset to collection", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/assets/:id/collections/:collectionId
func (h *AssetsHandler) RemoveFromCollection(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "id")
	collectionID := chi.URLParam(r, "collectionId")

	if err := h.convex.Mutation(r.Context(), "assets:removeAssetFromCollection", map[string]any{
		"workosUserId": workosUserID,
		"assetId":      assetID,
		"collectionId": collectionID,
	}, nil); err != nil {
		if strings.Contains(err.Error(), "Not authorized") {
			http.Error(w, "Not authorized", http.StatusForbidden)
			return
		}
		http.Error(w, "Failed to remove asset from collection", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
