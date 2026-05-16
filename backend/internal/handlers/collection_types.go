package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
)

type CollectionTypesHandler struct {
	convex *convexclient.Client
}

func NewCollectionTypesHandler(convex *convexclient.Client) *CollectionTypesHandler {
	return &CollectionTypesHandler{convex: convex}
}

// POST /api/v1/collection-types
func (h *CollectionTypesHandler) CreateCollectionType(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Name         string   `json:"name"`
		Description  string   `json:"description"`
		AssetTypeIDs []string `json:"assetTypeIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId": workosUserID,
		"name":         body.Name,
	}
	if body.Description != "" {
		args["description"] = body.Description
	}
	if len(body.AssetTypeIDs) > 0 {
		args["assetTypeIds"] = body.AssetTypeIDs
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := h.convex.Mutation(r.Context(), "collectionTypes:createCollectionType", args, &result); err != nil {
		if strings.Contains(err.Error(), "ArgumentValidationError") {
			http.Error(w, "Invalid asset type id", http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "Asset type not found") {
			http.Error(w, "One or more asset types not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to create collection type", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

// PUT /api/v1/collection-types/:id
func (h *CollectionTypesHandler) UpdateCollectionType(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	collectionTypeID := chi.URLParam(r, "id")

	var body struct {
		Name         *string  `json:"name"`
		Description  *string  `json:"description"`
		AssetTypeIDs []string `json:"assetTypeIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId":     workosUserID,
		"collectionTypeId": collectionTypeID,
	}
	if body.Name != nil {
		if *body.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		args["name"] = *body.Name
	}
	if body.Description != nil {
		args["description"] = *body.Description
	}
	if body.AssetTypeIDs != nil {
		args["assetTypeIds"] = body.AssetTypeIDs
	}

	if err := h.convex.Mutation(r.Context(), "collectionTypes:updateCollectionType", args, nil); err != nil {
		if strings.Contains(err.Error(), "ArgumentValidationError") {
			http.Error(w, "Invalid id in request", http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "Collection type not found") {
			http.Error(w, "Collection type not found", http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "Asset type not found") {
			http.Error(w, "One or more asset types not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to update collection type", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/collection-types/:id
func (h *CollectionTypesHandler) DeleteCollectionType(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	collectionTypeID := chi.URLParam(r, "id")

	if err := h.convex.Mutation(r.Context(), "collectionTypes:deleteCollectionType", map[string]any{
		"workosUserId":     workosUserID,
		"collectionTypeId": collectionTypeID,
	}, nil); err != nil {
		if strings.Contains(err.Error(), "ArgumentValidationError") {
			http.Error(w, "Invalid collection type id", http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "in use") {
			http.Error(w, "Collection type is in use by one or more collections", http.StatusConflict)
			return
		}
		if strings.Contains(err.Error(), "Collection type not found") {
			http.Error(w, "Collection type not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete collection type", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
