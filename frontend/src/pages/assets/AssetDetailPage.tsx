import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc, Id } from "@convex-gen/dataModel";
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

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  const asset = useQuery(api.assets.getAsset, { assetId: id as Id<"assets"> });

  async function handleDelete() {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteAsset(token, id!);
      toast.success("Asset deleted");
      navigate(`/collections/${asset?.collectionId}`);
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
        <Button asChild className="mt-4"><Link to="/dashboard">Back to dashboard</Link></Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to={`/collections/${asset.collectionId}`}>
            <ChevronLeft className="size-4" />Back to collection
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{asset.name}</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/assets/${id}/edit`}><Pencil className="size-4" />Edit</Link>
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
                    This will permanently delete <strong>{asset.name}</strong> and all its custom fields.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {asset.description && <p className="text-muted-foreground">{asset.description}</p>}

      {asset.tags && asset.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {asset.tags.map((tag: string) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
      )}

      <Separator />

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
        {asset.category && (
          <div><dt className="text-muted-foreground">Category</dt><dd className="font-medium mt-0.5">{asset.category}</dd></div>
        )}
        {asset.dateAcquired && (
          <div><dt className="text-muted-foreground">Date acquired</dt><dd className="font-medium mt-0.5">{formatDate(asset.dateAcquired)}</dd></div>
        )}
        {asset.purchasedValue !== undefined && (
          <div><dt className="text-muted-foreground">Purchased for</dt><dd className="font-medium mt-0.5">{formatCents(asset.purchasedValue)}</dd></div>
        )}
        {asset.marketValue !== undefined && (
          <div><dt className="text-muted-foreground">Market value</dt><dd className="font-medium mt-0.5 text-base">{formatCents(asset.marketValue)}</dd></div>
        )}
      </dl>

      {asset.customFields.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Custom fields</h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {asset.customFields.map((f: Doc<"customFields">) => (
                <div key={f._id}>
                  <dt className="text-muted-foreground">{f.fieldName}</dt>
                  <dd className="font-medium mt-0.5">{f.fieldValue}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
