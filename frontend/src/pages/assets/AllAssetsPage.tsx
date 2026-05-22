import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc } from "@convex-gen/dataModel";
import { deleteAsset } from "@/lib/api";
import { formatCents } from "@/lib/utils";
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
import { MoreHorizontal, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import {
  decryptOptionalArray,
  decryptOptionalNumber,
  decryptOptionalText,
  decryptText,
} from "@/lib/encrypted-fields";

export function AllAssetsPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const assets = useQuery(api.assets.listAllAssets);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteAsset(token, id);
      toast.success("Asset deleted");
    } catch (err) {
      // Toast intentionally stays generic — surfacing raw transport/auth
      // errors to end users isn't helpful. Console line saves the debug
      // round-trip when something does go wrong.
      console.error("Asset delete failed:", err);
      toast.error("Failed to delete asset");
    }
  }

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
        <h1 className="text-2xl font-bold">Assets</h1>
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
            <AssetCard
              key={asset._id}
              asset={asset}
              isDeleting={deletingId === asset._id}
              onAskDelete={() => setDeletingId(asset._id)}
              onCloseDeletePrompt={() => setDeletingId(null)}
              onDelete={() => handleDelete(asset._id)}
              onEdit={() => navigate(`/assets/${asset._id}/edit`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  asset: Doc<"assets">;
  isDeleting: boolean;
  onAskDelete: () => void;
  onCloseDeletePrompt: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

function AssetCard({
  asset,
  isDeleting,
  onAskDelete,
  onCloseDeletePrompt,
  onDelete,
  onEdit,
}: CardProps) {
  const { dek } = useEncryption();
  const decrypted = useDecrypted(asset, dek, async (a, dek) => ({
    name: await decryptText(a.name, dek),
    description: await decryptOptionalText(a.description, dek),
    marketValue: await decryptOptionalNumber(a.marketValue, dek),
    tags: await decryptOptionalArray(a.tags, dek),
  }));

  const name = decrypted?.name ?? "…";

  return (
    <div className="group relative rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/assets/${asset._id}`}
          className="flex-1 min-w-0 no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <p className="font-medium leading-tight truncate">{name}</p>
          {decrypted?.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {decrypted.description}
            </p>
          )}
          {decrypted?.marketValue !== undefined && (
            <p className="text-sm font-semibold mt-1">
              {formatCents(decrypted.marketValue)}
            </p>
          )}
          {decrypted?.tags && decrypted.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {decrypted.tags.slice(0, 3).map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </Link>

        <AlertDialog
          open={isDeleting}
          onOpenChange={(open) => !open && onCloseDeletePrompt()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-100 pointer-fine:size-7 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
                aria-label={`Actions for ${name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-4" />Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialogTrigger asChild>
                <DropdownMenuItem onClick={onAskDelete}>
                  <Trash2 className="size-4" />Delete
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete asset?</AlertDialogTitle>
              <AlertDialogDescription>
                Delete <strong>{name}</strong>? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
