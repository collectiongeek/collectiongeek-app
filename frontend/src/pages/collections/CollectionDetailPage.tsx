import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Id } from "@convex-gen/dataModel";
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
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import {
  decryptOptionalArray,
  decryptOptionalNumber,
  decryptOptionalText,
  decryptText,
} from "@/lib/encrypted-fields";

interface DecryptedCollection {
  name: string;
  description?: string;
  typeName?: string;
}

interface DecryptedAsset {
  _id: string;
  name: string;
  description?: string;
  marketValue?: number;
  tags?: string[];
}

export function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CollectionDetail id={id} />;
}

function CollectionDetail({ id }: { id: string }) {
  const { getAccessToken } = useAuth();
  const { dek } = useEncryption();
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const collectionId = id as Id<"collections">;
  const collection = useQuery(api.collections.getCollection, { collectionId });
  const assets = useQuery(api.assets.listAssetsInCollection, { collectionId });

  const decryptedCollection = useDecrypted(
    collection,
    dek,
    async (data, dek): Promise<DecryptedCollection> => ({
      name: await decryptText(data.name, dek),
      description: await decryptOptionalText(data.description, dek),
      typeName: data.collectionType
        ? await decryptText(data.collectionType.name, dek)
        : undefined,
    })
  );

  const decryptedAssets = useDecrypted(
    assets,
    dek,
    async (list, dek): Promise<DecryptedAsset[]> =>
      Promise.all(
        list.map(async (a) => ({
          _id: a._id,
          name: await decryptText(a.name, dek),
          description: await decryptOptionalText(a.description, dek),
          marketValue: await decryptOptionalNumber(a.marketValue, dek),
          tags: await decryptOptionalArray(a.tags, dek),
        }))
      )
  );

  const totalValueCents = decryptedAssets
    ? decryptedAssets.reduce((sum, a) => sum + (a.marketValue ?? 0), 0)
    : undefined;

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

  if (
    collection === undefined ||
    assets === undefined ||
    (collection !== null && !decryptedCollection) ||
    (assets !== null && !decryptedAssets)
  ) {
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

  if (!decryptedCollection || !decryptedAssets) return null;

  const assetCount = decryptedAssets.length;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/dashboard"><ChevronLeft className="size-4" />Dashboard</Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{decryptedCollection.name}</h1>
            {decryptedCollection.description && (
              <p className="text-muted-foreground mt-1">{decryptedCollection.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {collection.collectionType && decryptedCollection.typeName && (
                <Link to={`/collection-types/${collection.collectionType._id}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-muted">
                    {decryptedCollection.typeName}
                  </Badge>
                </Link>
              )}
              <span className="text-sm text-muted-foreground">
                {assetCount} asset{assetCount !== 1 ? "s" : ""}
                {totalValueCents !== undefined && totalValueCents > 0 && (
                  <>
                    {" · "}
                    <span className="font-medium text-foreground">
                      {formatCents(totalValueCents)} total value
                    </span>
                  </>
                )}
              </span>
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

      {decryptedAssets.length === 0 ? (
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
          {decryptedAssets.map((asset) => (
            <div key={asset._id} className="group relative rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/assets/${asset._id}`}
                  className="flex-1 min-w-0 no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
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
                </Link>

                <AlertDialog open={deletingId === asset._id} onOpenChange={(open) => !open && setDeletingId(null)}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0"
                        aria-label={`Actions for ${asset.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/assets/${asset._id}/edit`)}>
                        <Pencil className="size-4" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onClick={() => setDeletingId(asset._id)}>
                          <Trash2 className="size-4" />Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete asset?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete <strong>{asset.name}</strong> and remove it from all collections.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteAsset(asset._id)}>
                        Delete
                      </AlertDialogAction>
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

