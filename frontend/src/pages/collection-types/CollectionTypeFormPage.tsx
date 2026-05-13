import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc, Id } from "@convex-gen/dataModel";
import { createCollectionType, updateCollectionType } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

export function CreateCollectionTypePage() {
  return <CollectionTypeForm mode="create" />;
}

export function EditCollectionTypePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <EditCollectionTypeLoader id={id} />;
}

function EditCollectionTypeLoader({ id }: { id: string }) {
  const data = useQuery(api.collectionTypes.getCollectionType, {
    collectionTypeId: id as Id<"collectionTypes">,
  });

  if (data === undefined) return <Skeleton className="h-48 w-full max-w-2xl" />;
  if (!data) return null;

  return (
    <CollectionTypeForm
      mode="edit"
      collectionTypeId={id}
      initial={{
        name: data.name,
        description: data.description ?? "",
        assetTypeIds: data.assetTypes.map((at) => at._id),
      }}
    />
  );
}

interface FormProps {
  mode: "create" | "edit";
  collectionTypeId?: string;
  initial?: {
    name: string;
    description: string;
    assetTypeIds: string[];
  };
}

function CollectionTypeForm({ mode, collectionTypeId, initial }: FormProps) {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selectedAssetTypeIds, setSelectedAssetTypeIds] = useState<Set<string>>(
    new Set(initial?.assetTypeIds ?? [])
  );

  const assetTypes = useQuery(api.assetTypes.listAssetTypes);

  function toggleAssetType(id: string) {
    setSelectedAssetTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        assetTypeIds: Array.from(selectedAssetTypeIds),
      };
      if (mode === "create") {
        const { id } = await createCollectionType(token, payload);
        toast.success("Collection type created");
        navigate(`/collection-types/${id}`);
      } else if (collectionTypeId) {
        await updateCollectionType(token, collectionTypeId, payload);
        toast.success("Collection type updated");
        navigate(`/collection-types/${collectionTypeId}`);
      }
    } catch {
      toast.error(mode === "create" ? "Failed to create" : "Failed to update");
      setSaving(false);
    }
  }

  const backHref =
    mode === "edit" && collectionTypeId
      ? `/collection-types/${collectionTypeId}`
      : "/collection-types";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to={backHref}>
            <ChevronLeft className="size-4" />Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">
          {mode === "create" ? "New collection type" : "Edit collection type"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Coins, Brand X…"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suggested asset types</CardTitle>
          </CardHeader>
          <CardContent>
            {assetTypes === undefined ? (
              <Skeleton className="h-20 w-full" />
            ) : assetTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You haven't created any asset types yet.{" "}
                <Link to="/asset-types/new" className="underline">
                  Create one first
                </Link>{" "}
                if you want to link them here.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {assetTypes.map((at: Doc<"assetTypes">) => (
                  <label
                    key={at._id}
                    className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAssetTypeIds.has(at._id)}
                      onChange={() => toggleAssetType(at._id)}
                    />
                    <span className="truncate">{at.name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              These are suggestions used when adding assets to a collection of this type. They're
              not enforced — any asset can still be added.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(backHref)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || saving}>
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create collection type"
                : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
