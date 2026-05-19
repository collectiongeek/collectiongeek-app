// Package version exposes the build's version metadata. The three vars are
// overwritten at build time via -ldflags "-X ..." (see backend/Dockerfile).
// Defaults make `go run` / `go test` produce sensible values without ldflags.
package version

var (
	Version = "dev"
	Commit  = "unknown"
	BuiltAt = "unknown"
)

type Info struct {
	Version string `json:"version"`
	Commit  string `json:"commit"`
	BuiltAt string `json:"builtAt"`
}

func Current() Info {
	return Info{Version: Version, Commit: Commit, BuiltAt: BuiltAt}
}
