import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc, Id } from "@convex-gen/dataModel";
import { formatCents } from "@/lib/utils";
import { deleteAsset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, MoreHorizontal, Pencil, Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";

export function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const collectionId = id as Id<"collections">;
  const collection = useQuery(api.collections.getCollection, { collectionId });
  const assets = useQuery(api.assets.listAssets, { collectionId });
  const valueData = useQuery(api.collections.getCollectionValue, { collectionId });

  async function handleDeleteAsset(assetId: string) {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteAsset(token, assetId);
      toast.success("Asset deleted");
    } catch {
      toast.error("Failed to delete asset");
    }
  }

  if (collection === undefined || assets === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (collection === null) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Collection not found.</p>
        <Button asChild className="mt-4"><Link to="/dashboard">Back to dashboard</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/dashboard"><ChevronLeft className="size-4" />Dashboard</Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{collection.name}</h1>
            {collection.description && (
              <p className="text-muted-foreground mt-1">{collection.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {collection.collectionType && (
                <Badge variant="secondary">{collection.collectionType}</Badge>
              )}
              {valueData && (
                <span className="text-sm text-muted-foreground">
                  {valueData.assetCount} asset{valueData.assetCount !== 1 ? "s" : ""} ·{" "}
                  <span className="font-medium text-foreground">
                    {formatCents(valueData.totalCents)} total value
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/collections/${id}/edit`}><Pencil className="size-4" />Edit</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={`/collections/${id}/assets/new`}><Plus className="size-4" />Add asset</Link>
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Package className="size-10 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">No assets yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add your first asset to this collection.</p>
          <Button className="mt-6" asChild>
            <Link to={`/collections/${id}/assets/new`}><Plus className="size-4" />Add asset</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset: Doc<"assets">) => (
            <div key={asset._id} className="group relative rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div
                  className="flex-1 cursor-pointer min-w-0"
                  onClick={() => navigate(`/assets/${asset._id}`)}
                >
                  <p className="font-medium leading-tight truncate">{asset.name}</p>
                  {asset.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{asset.description}</p>
                  )}
                  {asset.marketValue !== undefined && (
                    <p className="text-sm font-semibold mt-1">{formatCents(asset.marketValue)}</p>
                  )}
                  {asset.tags && asset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {asset.tags.slice(0, 3).map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <AlertDialog open={deletingId === asset._id} onOpenChange={(open) => !open && setDeletingId(null)}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 shrink-0">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/assets/${asset._id}/edit`)}>
                        <Pencil className="size-4" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeletingId(asset._id)}
                        >
                          <Trash2 className="size-4" />Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete asset?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete <strong>{asset.name}</strong> and all its custom fields.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => handleDeleteAsset(asset._id)}
                      >Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
