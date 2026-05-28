import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc } from "@convex-gen/dataModel";
import {
  createCollection,
  recordCollectionCover,
  requestCollectionCoverUploadUrl,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, nativeSelectClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import { decryptText, encryptOptionalText, encryptText } from "@/lib/encrypted-fields";
import { PendingCoverPicker } from "@/components/images/PendingCoverPicker";
import {
  compressForUpload,
  DEFAULT_CROP_VIEW,
  encryptForUpload,
  encryptImageMetadata,
  MAX_FILE_SIZE_BYTES,
  uploadEncryptedBlob,
  type ImageMetadata,
} from "@/lib/images";

export function CreateCollectionPage() {
  const { getAccessToken } = useAuth();
  const { dek, workosUserId } = useEncryption();
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

  // While decryption is in flight, fall back to the raw list with a placeholder
  // name so the dropdown stays the right length and the user can still select.
  const typeOptions =
    decryptedTypes ??
    (collectionTypes ?? []).map((ct: Doc<"collectionTypes">) => ({
      _id: ct._id,
      name: "…",
    }));

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    collectionTypeId: "",
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);

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
      const { id } = await createCollection(token, {
        name: await encryptText(form.name.trim(), dek),
        description: await encryptOptionalText(
          form.description.trim() || undefined,
          dek
        ),
        collectionTypeId: form.collectionTypeId || undefined,
      });

      // Best-effort cover attach. The collection itself was created
      // successfully; if the cover step fails we still navigate and let
      // the user retry from the Edit page. workosUserId comes from the
      // encryption context and is required for the owner-header wrap.
      if (coverFile && workosUserId) {
        try {
          const compressed = await compressForUpload(coverFile);
          if (compressed.size > MAX_FILE_SIZE_BYTES) {
            toast.warning(
              "Collection created, but the cover image was too large to attach."
            );
          } else {
            const encrypted = await encryptForUpload(
              compressed,
              dek,
              workosUserId
            );
            const { uploadUrl } = await requestCollectionCoverUploadUrl(
              token,
              id
            );
            const storageId = await uploadEncryptedBlob(uploadUrl, encrypted);
            const meta: ImageMetadata = {
              cropView: DEFAULT_CROP_VIEW,
              contentType: "image/jpeg",
              sizeBytes: compressed.size,
            };
            const metadataCiphertext = await encryptImageMetadata(meta, dek);
            await recordCollectionCover(token, id, {
              storageId,
              metadataCiphertext,
            });
          }
        } catch (err) {
          console.error("Cover upload failed:", err);
          toast.warning(
            "Collection created, but the cover image couldn't be uploaded."
          );
        }
      }

      toast.success("Collection created");
      navigate(`/collections/${id}`);
    } catch {
      toast.error("Failed to create collection");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/dashboard">
            <ChevronLeft className="size-4" />
            Dashboard
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New collection</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collection details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="My Coin Collection"
                required
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What's in this collection?"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type">Collection type</Label>
              <select
                id="type"
                value={form.collectionTypeId}
                onChange={(e) => set("collectionTypeId", e.target.value)}
                className={nativeSelectClasses}
              >
                <option value="">Untyped</option>
                {typeOptions.map((ct) => (
                  <option key={ct._id} value={ct._id}>
                    {ct.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                <Link to="/collection-types/new" className="underline">
                  Create a new collection type
                </Link>{" "}
                if you don't see the one you need.
              </p>
            </div>

            <PendingCoverPicker
              file={coverFile}
              onChange={setCoverFile}
              disabled={saving}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>
                Cancel
              </Button>
              <Button type="submit" disabled={!form.name.trim() || saving || !dek}>
                {saving ? "Creating…" : "Create collection"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
