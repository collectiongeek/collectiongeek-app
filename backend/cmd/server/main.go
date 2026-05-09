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

	convexclient "github.com/collectiongeek/collectiongeek-app/backend/internal/convex"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/handlers"
	"github.com/collectiongeek/collectiongeek-app/backend/internal/middleware"
)

func main() {
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

	// Route handlers.
	usersH := handlers.NewUsersHandler(convex)
	collectionsH := handlers.NewCollectionsHandler(convex)
	assetsH := handlers.NewAssetsHandler(convex)

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
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
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

	// API routes — all require a valid WorkOS JWT.
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(jwksMW.Authenticate)

		// Users
		r.Post("/users/me", usersH.UpsertUser)
		r.Delete("/users/me", usersH.DeleteUser)

		// Collections
		r.Post("/collections", collectionsH.CreateCollection)
		r.Put("/collections/{id}", collectionsH.UpdateCollection)
		r.Delete("/collections/{id}", collectionsH.DeleteCollection)

		// Assets
		r.Post("/assets", assetsH.CreateAsset)
		r.Put("/assets/{id}", assetsH.UpdateAsset)
		r.Delete("/assets/{id}", assetsH.DeleteAsset)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Backend starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
