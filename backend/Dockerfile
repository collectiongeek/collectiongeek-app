# -- Build stage --
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Cache dependency downloads
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Version metadata, supplied by CI (see .github/workflows/build-and-push.yml).
# Defaults let a local `docker build` produce a runnable image without args.
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILT_AT=unknown

# -ldflags "-X path.Var=value" overrides the package-level vars in
# internal/version at link time. -s -w strips the symbol table and DWARF
# debug info, shaving a few MB off the binary.
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags "-s -w \
      -X github.com/collectiongeek/collectiongeek-app/backend/internal/version.Version=${VERSION} \
      -X github.com/collectiongeek/collectiongeek-app/backend/internal/version.Commit=${COMMIT} \
      -X github.com/collectiongeek/collectiongeek-app/backend/internal/version.BuiltAt=${BUILT_AT}" \
    -o /server ./cmd/server

# -- Runtime stage --
FROM gcr.io/distroless/static-debian12

COPY --from=builder /server /server

EXPOSE 8080

ENTRYPOINT ["/server"]