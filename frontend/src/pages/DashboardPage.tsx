import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import type { Doc } from "@convex-gen/dataModel";
import { useAuth } from "@workos-inc/authkit-react";
import { deleteCollection } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export function DashboardPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const collections = useQuery(api.collections.listCollections);
  const collectionTypes = useQuery(api.collectionTypes.listCollectionTypes);
  const assetTypes = useQuery(api.assetTypes.listAssetTypes);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const typeNameById = new Map(
    (collectionTypes ?? []).map((ct: Doc<"collectionTypes">) => [ct._id, ct.name])
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
              <p className="font-semibold text-sm">All assets</p>
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Collections</h1>
          <Button asChild>
            <Link to="/collections/new">
              <Plus className="size-4" />
              New collection
            </Link>
          </Button>
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
            {collections.map((col: Doc<"collections">) => {
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
                    <h3 className="font-semibold leading-tight">{col.name}</h3>
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
                          className="size-7 opacity-0 group-hover:opacity-100"
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
                            className="text-destructive focus:text-destructive"
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
                          className="bg-destructive text-white hover:bg-destructive/90"
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
