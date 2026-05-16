package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
)

type CollectionsHandler struct {
	convex *convexclient.Client
}

func NewCollectionsHandler(convex *convexclient.Client) *CollectionsHandler {
	return &CollectionsHandler{convex: convex}
}

// POST /api/v1/collections
func (h *CollectionsHandler) CreateCollection(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Name             string `json:"name"`
		Description      string `json:"description"`
		CollectionTypeID string `json:"collectionTypeId"`
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
	if body.CollectionTypeID != "" {
		args["collectionTypeId"] = body.CollectionTypeID
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := h.convex.Mutation(r.Context(), "collections:createCollection", args, &result); err != nil {
		if strings.Contains(err.Error(), "ArgumentValidationError") {
			http.Error(w, "Invalid collection type id", http.StatusBadRequest)
			return
		}
		// Match the specific resource so "User not found" (unexpected post-JWKS) doesn't
		// surface as a misleading 404 about the collection type.
		if strings.Contains(err.Error(), "Collection type not found") {
			http.Error(w, "Collection type not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to create collection", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

// PUT /api/v1/collections/:id
func (h *CollectionsHandler) UpdateCollection(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	collectionID := chi.URLParam(r, "id")

	var body struct {
		Name             *string `json:"name"`
		Description      *string `json:"description"`
		CollectionTypeID *string `json:"collectionTypeId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId": workosUserID,
		"collectionId": collectionID,
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
	if body.CollectionTypeID != nil {
		args["collectionTypeId"] = *body.CollectionTypeID
	}

	if err := h.convex.Mutation(r.Context(), "collections:updateCollection", args, nil); err != nil {
		if strings.Contains(err.Error(), "ArgumentValidationError") {
			http.Error(w, "Invalid id in request", http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "Collection type not found") {
			http.Error(w, "Collection type not found", http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "Collection not found") {
			http.Error(w, "Collection not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to update collection", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/collections/:id
func (h *CollectionsHandler) DeleteCollection(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	collectionID := chi.URLParam(r, "id")

	if err := h.convex.Mutation(r.Context(), "collections:deleteCollection", map[string]any{
		"workosUserId": workosUserID,
		"collectionId": collectionID,
	}, nil); err != nil {
		if strings.Contains(err.Error(), "ArgumentValidationError") {
			http.Error(w, "Invalid collection id", http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "Collection not found") {
			http.Error(w, "Collection not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete collection", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
