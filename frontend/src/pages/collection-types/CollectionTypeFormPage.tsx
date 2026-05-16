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
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import {
  decryptOptionalText,
  decryptText,
  encryptOptionalText,
  encryptText,
} from "@/lib/encrypted-fields";

interface InitialForm {
  name: string;
  description: string;
  assetTypeIds: string[];
}

export function CreateCollectionTypePage() {
  return <CollectionTypeForm mode="create" />;
}

export function EditCollectionTypePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <EditCollectionTypeLoader id={id} />;
}

function EditCollectionTypeLoader({ id }: { id: string }) {
  const { dek } = useEncryption();
  const data = useQuery(api.collectionTypes.getCollectionType, {
    collectionTypeId: id as Id<"collectionTypes">,
  });

  const initial = useDecrypted(
    data,
    dek,
    async (raw, dek): Promise<InitialForm> => ({
      name: await decryptText(raw.name, dek),
      description: (await decryptOptionalText(raw.description, dek)) ?? "",
      assetTypeIds: raw.assetTypes.map((at) => at._id),
    })
  );

  if (data === undefined) return <Skeleton className="h-48 w-full max-w-2xl" />;
  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Collection type not found.</p>
        <Button asChild className="mt-4">
          <Link to="/collection-types">Back to collection types</Link>
        </Button>
      </div>
    );
  }
  if (!initial) return <Skeleton className="h-48 w-full max-w-2xl" />;

  return (
    <CollectionTypeForm
      key={id}
      mode="edit"
      collectionTypeId={id}
      initial={initial}
    />
  );
}

interface FormProps {
  mode: "create" | "edit";
  collectionTypeId?: string;
  initial?: InitialForm;
}

function CollectionTypeForm({ mode, collectionTypeId, initial }: FormProps) {
  const { getAccessToken } = useAuth();
  const { dek } = useEncryption();
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
    if (!name.trim() || !dek) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const payload = {
        name: await encryptText(name.trim(), dek),
        description: await encryptOptionalText(
          description.trim() || undefined,
          dek
        ),
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
                maxLength={100}
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
                  <AssetTypeOption
                    key={at._id}
                    assetType={at}
                    checked={selectedAssetTypeIds.has(at._id)}
                    onToggle={() => toggleAssetType(at._id)}
                  />
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              These are suggestions used when adding assets to a collection of this type. They're
              not enforced — any asset can still be added.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              <Link to="/asset-types/new" className="underline">
                Create a new asset type
              </Link>{" "}
              if you don't see the one you need.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(backHref)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || saving || !dek}>
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

interface AssetTypeOptionProps {
  assetType: Doc<"assetTypes">;
  checked: boolean;
  onToggle: () => void;
}

function AssetTypeOption({ assetType, checked, onToggle }: AssetTypeOptionProps) {
  const { dek } = useEncryption();
  const decrypted = useDecrypted(assetType, dek, async (at, dek) => ({
    name: await decryptText(at.name, dek),
  }));
  const name = decrypted?.name ?? "…";

  return (
    <label className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/30">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="truncate">{name}</span>
    </label>
  );
}
