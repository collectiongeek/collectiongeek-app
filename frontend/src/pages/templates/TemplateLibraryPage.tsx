import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import type { Doc } from "@convex-gen/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, Library, Search, X } from "lucide-react";

// Browse ready-made asset types contributed by CollectionGeek (and, later,
// the community). Templates are plaintext — no decryption needed here.
export function TemplateLibraryPage() {
  const [query, setQuery] = useState("");
  const templates = useQuery(api.assetTypeTemplates.listTemplates, {});

  const trimmedQuery = query.trim().toLowerCase();
  // Filter client-side. Cheap even at thousands of templates — no debounce
  // needed. If the catalog ever outgrows that, swap to a server-side search
  // index without changing this UI.
  const filtered = useMemo(() => {
    if (!templates) return undefined;
    if (!trimmedQuery) return templates;
    return templates.filter((t) => {
      if (t.name.toLowerCase().includes(trimmedQuery)) return true;
      if (t.description?.toLowerCase().includes(trimmedQuery)) return true;
      if (t.tags.some((tag) => tag.toLowerCase().includes(trimmedQuery)))
        return true;
      return false;
    });
  }, [templates, trimmedQuery]);

  const loading = templates === undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Template library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ready-made asset types for common collectibles. Install one to
          create a personal asset type pre-filled with relevant fields —
          you can edit it after install just like any other.
        </p>
      </div>

      <SearchInput value={query} onChange={setQuery} />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : filtered && filtered.length === 0 ? (
        <EmptyState
          query={trimmedQuery}
          catalogIsEmpty={templates.length === 0}
          onClearQuery={() => setQuery("")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered?.map((t) => (
            <TemplateCard key={t._id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search templates…"
        aria-label="Search templates"
        className="pl-9 pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function TemplateCard({ template }: { template: Doc<"assetTypeTemplates"> }) {
  return (
    <Link
      to={`/templates/${template.slug}`}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-5 no-underline text-inherit transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="space-y-1">
        <h3 className="font-semibold leading-tight">{template.name}</h3>
        {template.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {template.description}
          </p>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Download className="size-3.5" />
          <span>
            {template.installCount.toLocaleString()}{" "}
            {template.installCount === 1 ? "install" : "installs"}
          </span>
        </div>
        <Badge variant="secondary" className="font-mono">
          v{template.version}
        </Badge>
      </div>
    </Link>
  );
}

function EmptyState({
  query,
  catalogIsEmpty,
  onClearQuery,
}: {
  query: string;
  catalogIsEmpty: boolean;
  onClearQuery: () => void;
}) {
  if (query && !catalogIsEmpty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
        <Search className="size-10 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">No templates match "{query}"</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a different search term.
        </p>
        <Button variant="outline" className="mt-6" onClick={onClearQuery}>
          Clear search
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
      <Library className="size-10 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold">No templates yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        More templates are on the way. In the meantime, you can{" "}
        <Link
          to="/asset-types/new"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          create your own asset type
        </Link>
        .
      </p>
    </div>
  );
}
