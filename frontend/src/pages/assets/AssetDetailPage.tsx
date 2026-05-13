import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Id } from "@convex-gen/dataModel";
import { formatCents, formatDate } from "@/lib/utils";
import { deleteAsset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

function formatDescriptorValue(
  value: string,
  dataType: string
): string {
  if (dataType === "boolean") return value === "true" ? "Yes" : "No";
  if (dataType === "date" && value) return formatDate(value);
  return value;
}

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <AssetDetail id={id} />;
}

function AssetDetail({ id }: { id: string }) {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  const asset = useQuery(api.assets.getAsset, { assetId: id as Id<"assets"> });

  async function handleDelete() {
    // Capture the navigation target before the delete so a reactive update to
    // `asset` (which may flip to null after deletion) can't change where we go.
    const firstCollection = asset?.collections[0];
    const target = firstCollection
      ? `/collections/${firstCollection._id}`
      : "/assets";
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteAsset(token, id);
      toast.success("Asset deleted");
      navigate(target);
    } catch {
      toast.error("Failed to delete asset");
    }
  }

  if (asset === undefined) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (asset === null) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Asset not found.</p>
        <Button asChild className="mt-4">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const backHref = asset.collections[0]
    ? `/collections/${asset.collections[0]._id}`
    : "/assets";
  const backLabel = asset.collections[0]
    ? "Back to collection"
    : "All assets";

  const descriptorsById = new Map(
    asset.descriptors.map((d) => [d._id, d])
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to={backHref}>
            <ChevronLeft className="size-4" />
            {backLabel}
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{asset.name}</h1>
            {asset.assetType && (
              <Link to={`/asset-types/${asset.assetType._id}`}>
                <Badge variant="secondary" className="mt-2 cursor-pointer hover:bg-muted">
                  {asset.assetType.name}
                </Badge>
              </Link>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/assets/${id}/edit`}>
                <Pencil className="size-4" />Edit
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="size-4" />Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete asset?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{asset.name}</strong> and remove it from all collections.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {asset.description && <p className="text-muted-foreground">{asset.description}</p>}

      {asset.tags && asset.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {asset.tags.map((tag: string) => (
            <Badge key={tag} variant="outline">{tag}</Badge>
          ))}
        </div>
      )}

      <Separator />

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
        {asset.dateAcquired && (
          <div>
            <dt className="text-muted-foreground">Date acquired</dt>
            <dd className="font-medium mt-0.5">{formatDate(asset.dateAcquired)}</dd>
          </div>
        )}
        {asset.purchasedValue !== undefined && (
          <div>
            <dt className="text-muted-foreground">Purchased for</dt>
            <dd className="font-medium mt-0.5">{formatCents(asset.purchasedValue)}</dd>
          </div>
        )}
        {asset.marketValue !== undefined && (
          <div>
            <dt className="text-muted-foreground">Market value</dt>
            <dd className="font-medium mt-0.5 text-base">{formatCents(asset.marketValue)}</dd>
          </div>
        )}
      </dl>

      {asset.descriptorValues.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {asset.assetType?.name ?? "Details"}
            </h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {asset.descriptorValues.map((v) => {
                const d = descriptorsById.get(v.descriptorId);
                if (!d) {
                  // Orphan: descriptor was deleted out from under this value.
                  // Cascade rules should prevent this, but warn during dev if it slips through.
                  console.warn(
                    `Orphaned descriptor value ${v._id} → descriptor ${v.descriptorId}`
                  );
                  return null;
                }
                return (
                  <div key={v._id}>
                    <dt className="text-muted-foreground">{d.name}</dt>
                    <dd className="font-medium mt-0.5">
                      {formatDescriptorValue(v.value, d.dataType)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </>
      )}

      {asset.collections.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Collections
            </h2>
            <div className="flex flex-wrap gap-2">
              {asset.collections.map((c) => (
                <Link key={c._id} to={`/collections/${c._id}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-muted">
                    {c.name}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
