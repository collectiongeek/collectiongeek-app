package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
)

type ImagesHandler struct {
	convex *convexclient.Client
}

func NewImagesHandler(convex *convexclient.Client) *ImagesHandler {
	return &ImagesHandler{convex: convex}
}

// POST /api/v1/assets/{assetId}/images/upload-url
func (h *ImagesHandler) RequestUploadURL(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "assetId")

	var result struct {
		UploadURL string `json:"uploadUrl"`
	}
	if err := h.convex.Mutation(r.Context(), "images:generateUploadUrl", map[string]any{
		"workosUserId": workosUserID,
		"assetId":      assetID,
	}, &result); err != nil {
		writeImagesConvexError(w, err, "Failed to start upload")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

type recordImageBody struct {
	StorageID          string `json:"storageId"`
	MetadataCiphertext string `json:"metadataCiphertext"`
	SetPrimary         bool   `json:"setPrimary"`
}

// POST /api/v1/assets/{assetId}/images
func (h *ImagesHandler) RecordImage(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "assetId")

	var body recordImageBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if body.StorageID == "" {
		http.Error(w, "storageId is required", http.StatusBadRequest)
		return
	}
	if body.MetadataCiphertext == "" {
		http.Error(w, "metadataCiphertext is required", http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId":       workosUserID,
		"assetId":            assetID,
		"storageId":          body.StorageID,
		"metadataCiphertext": body.MetadataCiphertext,
	}
	if body.SetPrimary {
		args["setPrimary"] = true
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := h.convex.Mutation(r.Context(), "images:recordImage", args, &result); err != nil {
		writeImagesConvexError(w, err, "Failed to record image")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

type updateImageBody struct {
	MetadataCiphertext *string `json:"metadataCiphertext"`
	SetPrimary         *bool   `json:"setPrimary"`
}

// PATCH /api/v1/assets/{assetId}/images/{imageId}
func (h *ImagesHandler) UpdateImage(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "assetId")
	imageID := chi.URLParam(r, "imageId")

	var body updateImageBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	args := map[string]any{
		"workosUserId": workosUserID,
		"assetId":      assetID,
		"imageId":      imageID,
	}
	if body.MetadataCiphertext != nil {
		args["metadataCiphertext"] = *body.MetadataCiphertext
	}
	if body.SetPrimary != nil {
		args["setPrimary"] = *body.SetPrimary
	}

	if err := h.convex.Mutation(r.Context(), "images:updateImage", args, nil); err != nil {
		writeImagesConvexError(w, err, "Failed to update image")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/assets/{assetId}/images/{imageId}
func (h *ImagesHandler) DeleteImage(w http.ResponseWriter, r *http.Request) {
	workosUserID := middleware.WorkOSUserID(r)
	if workosUserID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "assetId")
	imageID := chi.URLParam(r, "imageId")

	if err := h.convex.Mutation(r.Context(), "images:deleteImage", map[string]any{
		"workosUserId": workosUserID,
		"assetId":      assetID,
		"imageId":      imageID,
	}, nil); err != nil {
		writeImagesConvexError(w, err, "Failed to delete image")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Specific-substring matching per project convention — see
// backend/internal/handlers/assets.go for the rationale.
func writeImagesConvexError(w http.ResponseWriter, err error, fallback string) {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "ArgumentValidationError"):
		http.Error(w, "Invalid id in request", http.StatusBadRequest)
	// Shape-only ciphertext validator errors (assertCiphertextShape in
	// convex/ciphertext.ts) all carry ": ciphertext " in the message.
	// These are client-input failures — wrong base64, wrong length,
	// stale-client writing plaintext — so 400 is the honest code.
	case strings.Contains(msg, ": ciphertext "):
		http.Error(w, "Invalid encrypted payload", http.StatusBadRequest)
	case strings.Contains(msg, "Asset not found"):
		http.Error(w, "Asset not found", http.StatusNotFound)
	case strings.Contains(msg, "Image not found"):
		http.Error(w, "Image not found", http.StatusNotFound)
	case strings.Contains(msg, "Image limit reached"):
		http.Error(w, "Image limit reached", http.StatusConflict)
	case strings.Contains(msg, "Image already recorded"):
		http.Error(w, "Image already recorded", http.StatusConflict)
	default:
		http.Error(w, fallback, http.StatusInternalServerError)
	}
}
