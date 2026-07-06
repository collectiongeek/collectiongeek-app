package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/handlers"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/observability"
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

	// Structured JSON logging (observability Phase 2). One JSON object per
	// line on stdout; Loki stores it verbatim and LogQL parses it at query
	// time. LOG_LEVEL=DEBUG enables the chatty per-call lines.
	level := slog.LevelInfo
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		if err := level.UnmarshalText([]byte(v)); err != nil {
			level = slog.LevelInfo
		}
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})))

	ctx := context.Background()

	// Wire up the JWKS middleware (validates WorkOS JWTs).
	jwksMW, err := middleware.NewJWKSMiddleware(ctx)
	if err != nil {
		slog.Error("failed to initialize JWKS middleware", "error", err)
		os.Exit(1)
	}

	// Wire up the Convex HTTP client (calls internal mutations).
	convex, err := convexclient.NewClient()
	if err != nil {
		slog.Error("failed to initialize Convex client", "error", err)
		os.Exit(1)
	}

	workosAPIKey := os.Getenv("WORKOS_API_KEY")
	if workosAPIKey == "" {
		slog.Error("WORKOS_API_KEY is required")
		os.Exit(1)
	}

	// Route handlers.
	usersH := handlers.NewUsersHandler(convex, workosAPIKey)
	assetTypesH := handlers.NewAssetTypesHandler(convex)
	collectionTypesH := handlers.NewCollectionTypesHandler(convex)
	collectionsH := handlers.NewCollectionsHandler(convex)
	assetsH := handlers.NewAssetsHandler(convex)
	imagesH := handlers.NewImagesHandler(convex)

	r := chi.NewRouter()

	// Prometheus instrumentation. Registered before everything else so every
	// request is measured, including ones rejected by auth or CORS.
	buildInfo := version.Current()
	metrics := observability.New(buildInfo.Version, buildInfo.Commit)
	r.Use(metrics.Middleware)

	// Global middleware. RequestID must run before RequestLogger so the
	// logged request_id is populated.
	r.Use(chimiddleware.RequestID)
	r.Use(middleware.RequestLogger)
	r.Use(chimiddleware.Recoverer)

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

	// /metrics gets its own listener so Prometheus can scrape it in-cluster
	// while the public Service/Ingress only ever exposes the app port.
	metricsPort := os.Getenv("METRICS_PORT")
	if metricsPort == "" {
		metricsPort = "9090"
	}
	go func() {
		slog.Info("metrics listening", "port", metricsPort)
		if err := http.ListenAndServe(":"+metricsPort, metrics.Handler()); err != nil {
			slog.Error("metrics server stopped", "error", err)
		}
	}()

	slog.Info("backend starting", "port", port, "version", buildInfo.Version, "commit", buildInfo.Commit)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
