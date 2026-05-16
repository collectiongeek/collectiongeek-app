package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
)

type AssetTypesHandler struct {
	convex *convexclient.Client
}

func NewAssetTypesHandler(convex *convexclient.Client) *AssetTypesHandler {
	return &AssetTypesHandler{convex: convex}
}

// Name and options are ciphertext blobs from the client (see crypto module).
// Options is a single ciphertext string containing the JSON-encoded array,
// not an array of strings — we encrypt once per descriptor.
type descriptorInput struct {
	Name     string `json:"name"`
	DataType string `json:"dataType"`
	Options  string `json:"options,omitempty"`
	Required bool   `json:"required"`
	Order    int    `json:"order"`
}

var allowedDataTypes = map[string]bool{
	"text":    true,
	"number":  true,
	"date":    true,
	"year":    true,
	"boolean": true,
	"select":  true,
}

// Validates only the structural parts (dataType + required + order). Content
// fields (name, options) are ciphertext and validated on the client.
func validateDescriptors(ds []descriptorInput) (string, bool) {
	for _, d := range ds {
		if d.Name == "" {
			return "Descriptor name is required", false
		}
		if !allowedDataTypes[d.DataType] {
			return "Invalid descriptor data type", false
		}
		if d.DataType == "select" && d.Options == "" {
			return "Select descriptor requires options", false
		}
	}
	return "", true
}

// POST /api/v1/asset-types
func (h *AssetTypesHandler) CreateAssetType(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Name        string            `json:"name"`
		Description string            `json:"description"`
		Descriptors []descriptorInput `json:"descriptors"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if msg, ok := validateDescriptors(body.Descriptors); !ok {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId": workosUserID,
		"name":         body.Name,
	}
	if body.Description != "" {
		args["description"] = body.Description
	}
	if len(body.Descriptors) > 0 {
		args["descriptors"] = body.Descriptors
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := h.convex.Mutation(r.Context(), "assetTypes:createAssetType", args, &result); err != nil {
		http.Error(w, "Failed to create asset type", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

// PUT /api/v1/asset-types/:id
func (h *AssetTypesHandler) UpdateAssetType(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetTypeID := chi.URLParam(r, "id")

	var body struct {
		Name        *string           `json:"name"`
		Description *string           `json:"description"`
		Descriptors []descriptorInput `json:"descriptors"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId": workosUserID,
		"assetTypeId":  assetTypeID,
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
	if body.Descriptors != nil {
		if msg, ok := validateDescriptors(body.Descriptors); !ok {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		args["descriptors"] = body.Descriptors
	}

	if err := h.convex.Mutation(r.Context(), "assetTypes:updateAssetType", args, nil); err != nil {
		if strings.Contains(err.Error(), "ArgumentValidationError") {
			http.Error(w, "Invalid asset type id", http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "Asset type not found") {
			http.Error(w, "Asset type not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to update asset type", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/asset-types/:id
func (h *AssetTypesHandler) DeleteAssetType(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetTypeID := chi.URLParam(r, "id")

	if err := h.convex.Mutation(r.Context(), "assetTypes:deleteAssetType", map[string]any{
		"workosUserId": workosUserID,
		"assetTypeId":  assetTypeID,
	}, nil); err != nil {
		if strings.Contains(err.Error(), "ArgumentValidationError") {
			http.Error(w, "Invalid asset type id", http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "in use") {
			http.Error(w, "Asset type is in use by one or more assets", http.StatusConflict)
			return
		}
		if strings.Contains(err.Error(), "Asset type not found") {
			http.Error(w, "Asset type not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete asset type", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
