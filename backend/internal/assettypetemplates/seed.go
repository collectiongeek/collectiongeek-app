// Package assettypetemplates validates the public asset-type template seed
// files that live in /convex/seed/. Validate() is mirrored in Node
// (scripts/seed-asset-templates.mjs --check) so a maintainer can run it
// either way; the Go side is what `go test ./...` runs in CI.
package assettypetemplates

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type Category struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
	Icon string `json:"icon,omitempty"`
}

type Descriptor struct {
	Order    int      `json:"order"`
	// Stable, kebab-case identity for this descriptor across template
	// versions. NEVER renamed once published — renames break the upgrade-diff
	// story this field exists to support. The display Name can change freely.
	Key      string   `json:"key"`
	Name     string   `json:"name"`
	DataType string   `json:"dataType"`
	Options  []string `json:"options,omitempty"`
	Required bool     `json:"required,omitempty"`
}

type Template struct {
	Slug        string       `json:"slug"`
	Name        string       `json:"name"`
	Description string       `json:"description,omitempty"`
	Category    string       `json:"category"`
	Tags        []string     `json:"tags,omitempty"`
	Version     string       `json:"version"`
	Descriptors []Descriptor `json:"descriptors"`
}

var (
	slugRE   = regexp.MustCompile(`^[a-z0-9-]+$`)
	semverRE = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

	allowedDataTypes = map[string]bool{
		"text":    true,
		"number":  true,
		"date":    true,
		"year":    true,
		"boolean": true,
		"select":  true,
	}
)

// Validate parses every seed file under seedDir and returns one error per
// problem found. A nil return means the catalog is publishable as-is.
func Validate(seedDir string) []error {
	var errs []error

	cats, catErrs := loadCategories(filepath.Join(seedDir, "categories.json"))
	errs = append(errs, catErrs...)

	catSlugs := make(map[string]struct{}, len(cats))
	for _, c := range cats {
		catSlugs[c.Slug] = struct{}{}
	}

	tplDir := filepath.Join(seedDir, "templates")
	entries, err := os.ReadDir(tplDir)
	if err != nil {
		return append(errs, fmt.Errorf("read templates dir: %w", err))
	}

	seenSlugs := make(map[string]string) // slug -> file (for dup reporting)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		path := filepath.Join(tplDir, e.Name())
		if tplErrs := validateTemplateFile(path, e.Name(), catSlugs, seenSlugs); len(tplErrs) > 0 {
			errs = append(errs, tplErrs...)
		}
	}

	return errs
}

func loadCategories(path string) ([]Category, []error) {
	var errs []error
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, []error{fmt.Errorf("read categories.json: %w", err)}
	}
	var cats []Category
	if err := json.Unmarshal(data, &cats); err != nil {
		return nil, []error{fmt.Errorf("parse categories.json: %w", err)}
	}

	seen := make(map[string]struct{})
	for _, c := range cats {
		if !slugRE.MatchString(c.Slug) {
			errs = append(errs, fmt.Errorf("categories.json: invalid slug %q", c.Slug))
		}
		if _, dup := seen[c.Slug]; dup {
			errs = append(errs, fmt.Errorf("categories.json: duplicate slug %q", c.Slug))
		}
		seen[c.Slug] = struct{}{}
		if c.Name == "" {
			errs = append(errs, fmt.Errorf("categories.json: category %q missing name", c.Slug))
		}
	}
	return cats, errs
}

func validateTemplateFile(path, name string, catSlugs map[string]struct{}, seenSlugs map[string]string) []error {
	var errs []error
	data, err := os.ReadFile(path)
	if err != nil {
		return []error{fmt.Errorf("%s: read: %w", name, err)}
	}
	var t Template
	if err := json.Unmarshal(data, &t); err != nil {
		return []error{fmt.Errorf("%s: parse: %w", name, err)}
	}

	prefix := func(msg string) error { return fmt.Errorf("%s: %s", name, msg) }

	if !slugRE.MatchString(t.Slug) {
		errs = append(errs, prefix(fmt.Sprintf("invalid slug %q (must be kebab-case)", t.Slug)))
	}
	if prev, dup := seenSlugs[t.Slug]; dup {
		errs = append(errs, prefix(fmt.Sprintf("duplicate slug %q also used by %s", t.Slug, prev)))
	}
	seenSlugs[t.Slug] = name

	if t.Name == "" {
		errs = append(errs, prefix("missing name"))
	}
	if _, ok := catSlugs[t.Category]; !ok {
		errs = append(errs, prefix(fmt.Sprintf("unknown category %q", t.Category)))
	}
	if !semverRE.MatchString(t.Version) {
		errs = append(errs, prefix(fmt.Sprintf("invalid version %q (must be semver MAJOR.MINOR.PATCH)", t.Version)))
	}
	if len(t.Descriptors) == 0 {
		errs = append(errs, prefix("descriptors[] is empty"))
		return errs
	}

	orders := make([]int, 0, len(t.Descriptors))
	seenKeys := make(map[string]struct{}, len(t.Descriptors))
	for _, d := range t.Descriptors {
		if d.Name == "" {
			errs = append(errs, prefix("descriptor missing name"))
		}
		if !slugRE.MatchString(d.Key) {
			errs = append(errs, prefix(fmt.Sprintf("descriptor %q has invalid key %q (must be kebab-case)", d.Name, d.Key)))
		}
		if _, dup := seenKeys[d.Key]; dup && d.Key != "" {
			errs = append(errs, prefix(fmt.Sprintf("duplicate descriptor key %q", d.Key)))
		}
		seenKeys[d.Key] = struct{}{}
		if !allowedDataTypes[d.DataType] {
			errs = append(errs, prefix(fmt.Sprintf("descriptor %q has bad dataType %q", d.Name, d.DataType)))
		}
		if d.DataType == "select" && len(d.Options) == 0 {
			errs = append(errs, prefix(fmt.Sprintf("select descriptor %q missing options", d.Name)))
		}
		if d.DataType == "select" {
			seen := make(map[string]struct{}, len(d.Options))
			for _, opt := range d.Options {
				if opt == "" {
					errs = append(errs, prefix(fmt.Sprintf("select descriptor %q has an empty option", d.Name)))
				}
				if _, dup := seen[opt]; dup {
					errs = append(errs, prefix(fmt.Sprintf("select descriptor %q has duplicate option %q", d.Name, opt)))
				}
				seen[opt] = struct{}{}
			}
		}
		orders = append(orders, d.Order)
	}

	sort.Ints(orders)
	for i, o := range orders {
		if o != i+1 {
			errs = append(errs, prefix(fmt.Sprintf("descriptor order values must be 1..N contiguous, got %v", orders)))
			break
		}
	}

	return errs
}
