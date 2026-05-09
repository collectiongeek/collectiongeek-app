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
import { BookOpen, MoreHorizontal, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export function DashboardPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const collections = useQuery(api.collections.listCollections);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    <div className="space-y-6">
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
          {collections.map((col: Doc<"collections">) => (
            <div
              key={col._id}
              className="group relative rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate(`/collections/${col._id}`)}
                >
                  <h3 className="font-semibold leading-tight">{col.name}</h3>
                  {col.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {col.description}
                    </p>
                  )}
                  {col.collectionType && (
                    <Badge variant="secondary" className="mt-2">
                      {col.collectionType}
                    </Badge>
                  )}
                </div>

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
                        This will permanently delete <strong>{col.name}</strong> and
                        all its assets. This action cannot be undone.
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
          ))}
        </div>
      )}
    </div>
  );
}
