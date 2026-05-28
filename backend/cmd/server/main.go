package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/handlers"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/version"
)

func main() {
	// Auto-load .env.local for local development. godotenv.Load is a no-op
	// when the file is absent and does not override vars already in the
	// environment, so this is safe in production.
	for _, p := range []string{".env.local", "../.env.local"} {
		if err := godotenv.Load(p); err == nil {
			break
		}
	}

	ctx := context.Background()

	// Wire up the JWKS middleware (validates WorkOS JWTs).
	jwksMW, err := middleware.NewJWKSMiddleware(ctx)
	if err != nil {
		log.Fatalf("Failed to initialize JWKS middleware: %v", err)
	}

	// Wire up the Convex HTTP client (calls internal mutations).
	convex, err := convexclient.NewClient()
	if err != nil {
		log.Fatalf("Failed to initialize Convex client: %v", err)
	}

	workosAPIKey := os.Getenv("WORKOS_API_KEY")
	if workosAPIKey == "" {
		log.Fatal("WORKOS_API_KEY is required")
	}

	// Route handlers.
	usersH := handlers.NewUsersHandler(convex, workosAPIKey)
	assetTypesH := handlers.NewAssetTypesHandler(convex)
	collectionTypesH := handlers.NewCollectionTypesHandler(convex)
	collectionsH := handlers.NewCollectionsHandler(convex)
	assetsH := handlers.NewAssetsHandler(convex)
	imagesH := handlers.NewImagesHandler(convex)

	r := chi.NewRouter()

	// Global middleware.
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RequestID)

	// CORS — allow the frontend origin.
	allowedOrigins := []string{"http://localhost:3000"}
	if origins := os.Getenv("CORS_ALLOWED_ORIGINS"); origins != "" {
		allowedOrigins = append(allowedOrigins, origins)
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check — used by Kubernetes probes.
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	// Version — unauthenticated so support / probes / a hidden "About" panel
	// can read it without a token. The values are baked in at build time
	// (see internal/version and the Dockerfile ldflags), so there's no
	// per-request cost and nothing sensitive to leak.
	r.Get("/api/v1/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(version.Current())
	})

	// API routes — all require a valid WorkOS JWT.
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(jwksMW.Authenticate)

		// Users
		r.Post("/users/me", usersH.UpsertUser)
		r.Put("/users/me/theme", usersH.UpdateTheme)
		r.Post("/users/me/encryption", usersH.SetEncryptionKey)
		r.Post("/users/me/encryption/rotate", usersH.RotateEncryptionKey)
		r.Delete("/users/me", usersH.DeleteUser)

		// Asset Types
		r.Post("/asset-types", assetTypesH.CreateAssetType)
		r.Put("/asset-types/{id}", assetTypesH.UpdateAssetType)
		r.Delete("/asset-types/{id}", assetTypesH.DeleteAssetType)

		// Collection Types
		r.Post("/collection-types", collectionTypesH.CreateCollectionType)
		r.Put("/collection-types/{id}", collectionTypesH.UpdateCollectionType)
		r.Delete("/collection-types/{id}", collectionTypesH.DeleteCollectionType)

		// Collections
		r.Post("/collections", collectionsH.CreateCollection)
		r.Put("/collections/{id}", collectionsH.UpdateCollection)
		r.Delete("/collections/{id}", collectionsH.DeleteCollection)

		// Collection cover image. Same upload handshake as asset images
		// (bytes go straight to Convex File Storage); these endpoints
		// mediate the URL handshake, persist the metadata row, and gate
		// ownership. recordCover is upsert — one cover per collection.
		r.Post("/collections/{id}/cover/upload-url", collectionsH.RequestCoverUploadURL)
		r.Post("/collections/{id}/cover", collectionsH.RecordCover)
		r.Patch("/collections/{id}/cover", collectionsH.UpdateCoverMetadata)
		r.Delete("/collections/{id}/cover", collectionsH.DeleteCover)

		// Assets
		r.Post("/assets", assetsH.CreateAsset)
		r.Put("/assets/{id}", assetsH.UpdateAsset)
		r.Delete("/assets/{id}", assetsH.DeleteAsset)
		r.Post("/assets/{id}/collections", assetsH.AddToCollection)
		r.Delete("/assets/{id}/collections/{collectionId}", assetsH.RemoveFromCollection)

		// Asset images. Bytes go directly to Convex File Storage; these
		// endpoints mediate the URL handshake, persist metadata rows, and
		// gate ownership / 6-image cap.
		r.Post("/assets/{assetId}/images/upload-url", imagesH.RequestUploadURL)
		r.Post("/assets/{assetId}/images", imagesH.RecordImage)
		r.Patch("/assets/{assetId}/images/{imageId}", imagesH.UpdateImage)
		r.Delete("/assets/{assetId}/images/{imageId}", imagesH.DeleteImage)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Backend starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
