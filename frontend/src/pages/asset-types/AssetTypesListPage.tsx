import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc } from "@convex-gen/dataModel";
import { deleteAssetType } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import {
  decryptOptionalText,
  decryptText,
} from "@/lib/encrypted-fields";

export function AssetTypesListPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const assetTypes = useQuery(api.assetTypes.listAssetTypes);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteAssetType(token, id);
      toast.success("Asset type deleted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("in use") ? "Asset type is in use" : "Failed to delete");
    }
  }

  if (assetTypes === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Asset Types</h1>
        <Button asChild>
          <Link to="/asset-types/new"><Plus className="size-4" />New asset type</Link>
        </Button>
      </div>

      {assetTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Tags className="size-10 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">No asset types yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the kinds of things you collect (Coin, Book, Car, …) and the fields they share.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/asset-types/new"><Plus className="size-4" />New asset type</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assetTypes.map((at: Doc<"assetTypes">) => (
            <AssetTypeCard
              key={at._id}
              assetType={at}
              isDeleting={deletingId === at._id}
              onAskDelete={() => setDeletingId(at._id)}
              onCloseDeletePrompt={() => setDeletingId(null)}
              onDelete={() => handleDelete(at._id)}
              onEdit={() => navigate(`/asset-types/${at._id}/edit`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  assetType: Doc<"assetTypes">;
  isDeleting: boolean;
  onAskDelete: () => void;
  onCloseDeletePrompt: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

function AssetTypeCard({
  assetType,
  isDeleting,
  onAskDelete,
  onCloseDeletePrompt,
  onDelete,
  onEdit,
}: CardProps) {
  const { dek } = useEncryption();
  const decrypted = useDecrypted(
    assetType,
    dek,
    async (at, dek) => ({
      name: await decryptText(at.name, dek),
      description: await decryptOptionalText(at.description, dek),
    })
  );

  const name = decrypted?.name ?? "…";
  const description = decrypted?.description;

  return (
    <div className="group relative rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/asset-types/${assetType._id}`}
          className="flex-1 no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <h3 className="font-semibold leading-tight">{name}</h3>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {description}
            </p>
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
                className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
              <AlertDialogTitle>Delete asset type?</AlertDialogTitle>
              <AlertDialogDescription>
                Delete <strong>{name}</strong>? Any assets using this type must be moved off it first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
