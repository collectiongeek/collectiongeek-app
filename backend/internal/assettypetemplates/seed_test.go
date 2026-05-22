package assettypetemplates

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// seedDir anchors on this test file so `go test ./...` works no matter
// which directory it's invoked from.
func seedDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// backend/internal/assettypetemplates/seed_test.go -> repo root -> convex/seed
	repoRoot := filepath.Join(filepath.Dir(file), "..", "..", "..")
	return filepath.Join(repoRoot, "convex", "seed")
}

// Validates the real seed files. If anyone adds or edits a template that
// violates the contract (bad slug, unknown category, non-contiguous order,
// missing select options, etc.), CI fails here.
func TestSeedFilesAreValid(t *testing.T) {
	dir := seedDir(t)
	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("seed dir not found at %s: %v", dir, err)
	}
	errs := Validate(dir)
	if len(errs) > 0 {
		for _, e := range errs {
			t.Errorf("%v", e)
		}
	}
}

// Validate() runs against synthetic fixtures so we can prove each rule
// actually rejects what it should. Without this, the seed test could
// silently pass if Validate were a no-op.
func TestValidateCatchesBadFixtures(t *testing.T) {
	tests := []struct {
		name        string
		categories  string
		templates   map[string]string
		wantSubstr  string
	}{
		{
			name:       "duplicate slug",
			categories: `[{"slug":"trading-cards","name":"Trading Cards"}]`,
			templates: map[string]string{
				"a.json": validTpl("dup-slug", "trading-cards"),
				"b.json": validTpl("dup-slug", "trading-cards"),
			},
			wantSubstr: "duplicate slug",
		},
		{
			name:       "unknown category",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": validTpl("foo", "no-such-category"),
			},
			wantSubstr: "unknown category",
		},
		{
			name:       "bad dataType",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"foo","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[{"order":1,"key":"x","name":"x","dataType":"image","required":false}]}`,
			},
			wantSubstr: "bad dataType",
		},
		{
			name:       "select missing options",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"foo","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[{"order":1,"key":"x","name":"x","dataType":"select","required":false}]}`,
			},
			wantSubstr: "missing options",
		},
		{
			name:       "non-contiguous order",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"foo","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[
						{"order":1,"key":"x","name":"x","dataType":"text","required":false},
						{"order":3,"key":"y","name":"y","dataType":"text","required":false}]}`,
			},
			wantSubstr: "contiguous",
		},
		{
			name:       "missing descriptor key",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"foo","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[{"order":1,"name":"x","dataType":"text","required":false}]}`,
			},
			wantSubstr: "invalid key",
		},
		{
			name:       "non-kebab descriptor key",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"foo","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[{"order":1,"key":"FooBar","name":"x","dataType":"text","required":false}]}`,
			},
			wantSubstr: "kebab-case",
		},
		{
			name:       "slug with leading hyphen rejected",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"-foo","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[{"order":1,"key":"x","name":"x","dataType":"text","required":false}]}`,
			},
			wantSubstr: "kebab-case",
		},
		{
			name:       "slug with trailing hyphen rejected",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"foo-","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[{"order":1,"key":"x","name":"x","dataType":"text","required":false}]}`,
			},
			wantSubstr: "kebab-case",
		},
		{
			name:       "slug with consecutive hyphens rejected",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"foo--bar","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[{"order":1,"key":"x","name":"x","dataType":"text","required":false}]}`,
			},
			wantSubstr: "kebab-case",
		},
		{
			name:       "duplicate descriptor keys within template",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"foo","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[
						{"order":1,"key":"year","name":"Year","dataType":"text","required":false},
						{"order":2,"key":"year","name":"Mint Year","dataType":"text","required":false}]}`,
			},
			wantSubstr: "duplicate descriptor key",
		},
		{
			name:       "invalid semver",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"foo","name":"F","category":"coins","version":"v1",
					"descriptors":[{"order":1,"key":"x","name":"x","dataType":"text","required":false}]}`,
			},
			wantSubstr: "invalid version",
		},
		{
			name:       "non-kebab slug",
			categories: `[{"slug":"coins","name":"Coins"}]`,
			templates: map[string]string{
				"a.json": `{"slug":"FooBar","name":"F","category":"coins","version":"1.0.0",
					"descriptors":[{"order":1,"key":"x","name":"x","dataType":"text","required":false}]}`,
			},
			wantSubstr: "kebab-case",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := writeFixture(t, tc.categories, tc.templates)
			errs := Validate(dir)
			if !anyContains(errs, tc.wantSubstr) {
				t.Fatalf("expected an error containing %q, got: %v", tc.wantSubstr, errs)
			}
		})
	}
}

// validTpl is a known-good template body parameterized by slug + category.
func validTpl(slug, category string) string {
	return `{"slug":"` + slug + `","name":"X","category":"` + category + `","version":"1.0.0",
		"descriptors":[{"order":1,"key":"a","name":"a","dataType":"text","required":false}]}`
}

func writeFixture(t *testing.T, categoriesJSON string, templates map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "categories.json"), []byte(categoriesJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	tplDir := filepath.Join(dir, "templates")
	if err := os.MkdirAll(tplDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for name, body := range templates {
		if err := os.WriteFile(filepath.Join(tplDir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func anyContains(errs []error, substr string) bool {
	for _, e := range errs {
		if strings.Contains(e.Error(), substr) {
			return true
		}
	}
	return false
}
