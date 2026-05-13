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
            <div key={at._id} className="group relative rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/asset-types/${at._id}`}
                  className="flex-1 no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                >
                  <h3 className="font-semibold leading-tight">{at.name}</h3>
                  {at.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{at.description}</p>
                  )}
                </Link>

                <AlertDialog open={deletingId === at._id} onOpenChange={(open) => !open && setDeletingId(null)}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Actions for ${at.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/asset-types/${at._id}/edit`)}>
                        <Pencil className="size-4" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletingId(at._id)}>
                          <Trash2 className="size-4" />Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete asset type?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Delete <strong>{at.name}</strong>? Any assets using this type must be moved off it first.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => handleDelete(at._id)}>
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
