import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import type { Doc, Id } from "@convex-gen/dataModel";
import { useAuth } from "@workos-inc/authkit-react";
import { deleteCollection } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BookOpen,
  FolderTree,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Tags,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const SHOW_VALUES_KEY = "cg.showCollectionValues";

function readShowValues(): boolean {
  try {
    return localStorage.getItem(SHOW_VALUES_KEY) === "true";
  } catch {
    return false;
  }
}

function CollectionAssetCount({
  collectionId,
}: {
  collectionId: Id<"collections">;
}) {
  const data = useQuery(api.collections.getCollectionValue, { collectionId });
  if (data === undefined || data === null) return null;
  return (
    <span className="text-xs text-muted-foreground font-normal whitespace-nowrap">
      {data.assetCount} asset{data.assetCount !== 1 ? "s" : ""}
    </span>
  );
}

function CollectionTotalValue({
  collectionId,
}: {
  collectionId: Id<"collections">;
}) {
  const data = useQuery(api.collections.getCollectionValue, { collectionId });
  if (data === undefined) return <Skeleton className="mt-2 h-4 w-24" />;
  if (data === null) return null;
  return (
    <p className="mt-2 text-sm font-medium">{formatCents(data.totalCents)}</p>
  );
}

export function DashboardPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const collections = useQuery(api.collections.listCollections);
  const collectionTypes = useQuery(api.collectionTypes.listCollectionTypes);
  const assetTypes = useQuery(api.assetTypes.listAssetTypes);
  const allAssets = useQuery(api.assets.listAllAssets);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(readShowValues);

  function toggleShowValues() {
    setShowValues((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_VALUES_KEY, String(next));
      } catch {
        // localStorage unavailable — toggle still works in-session.
      }
      return next;
    });
  }

  const typeNameById = new Map(
    (collectionTypes ?? []).map((ct: Doc<"collectionTypes">) => [ct._id, ct.name])
  );

  const sortedCollections = useMemo(
    () =>
      [...(collections ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [collections]
  );

  async function handleDelete(id: string) {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteCollection(token, id);
      toast.success("Collection deleted");
    } catch {
      toast.error("Failed to delete collection");
    }
  }

  if (collections === undefined) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          to="/assets"
          className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <Package className="size-5 text-muted-foreground" />
            <div>
              <p className="font-semibold text-sm">
                All assets
                {allAssets !== undefined && (
                  <span className="text-muted-foreground font-normal"> · {allAssets.length}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">Browse everything you've cataloged</p>
            </div>
          </div>
        </Link>
        <Link
          to="/asset-types"
          className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <Tags className="size-5 text-muted-foreground" />
            <div>
              <p className="font-semibold text-sm">
                Asset types
                {assetTypes !== undefined && (
                  <span className="text-muted-foreground font-normal"> · {assetTypes.length}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">Define the kinds of things you collect</p>
            </div>
          </div>
        </Link>
        <Link
          to="/collection-types"
          className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <FolderTree className="size-5 text-muted-foreground" />
            <div>
              <p className="font-semibold text-sm">
                Collection types
                {collectionTypes !== undefined && (
                  <span className="text-muted-foreground font-normal"> · {collectionTypes.length}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">Group collections by kind</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">My Collections</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
              Show total values
              <button
                type="button"
                role="switch"
                aria-checked={showValues}
                aria-label="Show total values"
                onClick={toggleShowValues}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  showValues ? "bg-primary" : "bg-muted-foreground/50"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform",
                    showValues ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
            </label>
            <Button asChild>
              <Link to="/collections/new">
                <Plus className="size-4" />
                New collection
              </Link>
            </Button>
          </div>
        </div>

        {collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
            <BookOpen className="size-10 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold">No collections yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first collection to start cataloging.
            </p>
            <Button className="mt-6" asChild>
              <Link to="/collections/new">
                <Plus className="size-4" />
                New collection
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedCollections.map((col: Doc<"collections">) => {
              const typeName = col.collectionTypeId
                ? typeNameById.get(col.collectionTypeId)
                : undefined;
              return (
              <div
                key={col._id}
                className="group relative rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/collections/${col._id}`}
                    className="flex-1 no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                  >
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-semibold leading-tight">{col.name}</h3>
                      <CollectionAssetCount collectionId={col._id} />
                    </div>
                    {col.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {col.description}
                      </p>
                    )}
                    {typeName && (
                      <Badge variant="secondary" className="mt-2">
                        {typeName}
                      </Badge>
                    )}
                    {showValues && <CollectionTotalValue collectionId={col._id} />}
                  </Link>

                  <AlertDialog
                    open={deletingId === col._id}
                    onOpenChange={(open) => !open && setDeletingId(null)}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={`Actions for ${col.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => navigate(`/collections/${col._id}/edit`)}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            onClick={() => setDeletingId(col._id)}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete collection?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete <strong>{col.name}</strong>.
                          Assets in this collection will not be deleted, but they will
                          be removed from this collection.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(col._id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
