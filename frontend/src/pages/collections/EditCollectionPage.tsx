import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Id } from "@convex-gen/dataModel";
import { updateCollection } from "@/lib/api";
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
  collectionTypeId: string;
}

export function EditCollectionPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <EditCollectionLoader id={id} />;
}

function EditCollectionLoader({ id }: { id: string }) {
  const { dek } = useEncryption();
  const collection = useQuery(api.collections.getCollection, {
    collectionId: id as Id<"collections">,
  });

  const initial = useDecrypted(
    collection,
    dek,
    async (data, dek): Promise<InitialForm> => ({
      name: await decryptText(data.name, dek),
      description: (await decryptOptionalText(data.description, dek)) ?? "",
      collectionTypeId: data.collectionTypeId ?? "",
    })
  );

  if (collection === undefined) return <Skeleton className="h-48 w-full max-w-lg" />;
  if (!collection) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Collection not found.</p>
        <Button asChild className="mt-4">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }
  if (!initial) return <Skeleton className="h-48 w-full max-w-lg" />;

  return <EditCollectionForm key={id} id={id} initial={initial} />;
}

function EditCollectionForm({ id, initial }: { id: string; initial: InitialForm }) {
  const { getAccessToken } = useAuth();
  const { dek } = useEncryption();
  const navigate = useNavigate();
  const collectionTypes = useQuery(api.collectionTypes.listCollectionTypes);
  const decryptedTypes = useDecrypted(
    collectionTypes,
    dek,
    async (list, dek) =>
      Promise.all(
        list.map(async (ct) => ({
          _id: ct._id,
          name: await decryptText(ct.name, dek),
        }))
      )
  );
  // Fallback placeholder names while decryption is in flight.
  const typeOptions =
    decryptedTypes ??
    (collectionTypes ?? []).map((ct) => ({ _id: ct._id, name: "…" }));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initial);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !dek) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await updateCollection(token, id, {
        name: await encryptText(form.name.trim(), dek),
        description: await encryptOptionalText(
          form.description.trim() || undefined,
          dek
        ),
        collectionTypeId: form.collectionTypeId || undefined,
      });
      toast.success("Collection updated");
      navigate(`/collections/${id}`);
    } catch {
      toast.error("Failed to update collection");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to={`/collections/${id}`}>
            <ChevronLeft className="size-4" />Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Edit collection</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Collection details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Collection type</Label>
              <select
                id="type"
                value={form.collectionTypeId}
                onChange={(e) => set("collectionTypeId", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Untyped</option>
                {typeOptions.map((ct) => (
                  <option key={ct._id} value={ct._id}>{ct.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate(`/collections/${id}`)}>Cancel</Button>
              <Button type="submit" disabled={!form.name.trim() || saving || !dek}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
