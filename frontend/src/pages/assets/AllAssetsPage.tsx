import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import type { Doc } from "@convex-gen/dataModel";
import { formatCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Plus } from "lucide-react";

export function AllAssetsPage() {
  const assets = useQuery(api.assets.listAllAssets);

  if (assets === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">All assets</h1>
        <Button asChild>
          <Link to="/assets/new"><Plus className="size-4" />New asset</Link>
        </Button>
      </div>

      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Package className="size-10 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">No assets yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a standalone asset, or add one to a collection.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/assets/new"><Plus className="size-4" />New asset</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset: Doc<"assets">) => (
            <Link
              key={asset._id}
              to={`/assets/${asset._id}`}
              className="group relative block rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="font-medium leading-tight truncate">{asset.name}</p>
              {asset.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {asset.description}
                </p>
              )}
              {asset.marketValue !== undefined && (
                <p className="text-sm font-semibold mt-1">
                  {formatCents(asset.marketValue)}
                </p>
              )}
              {asset.tags && asset.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {asset.tags.slice(0, 3).map((tag: string) => (
                    <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
