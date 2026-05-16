import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc, Id } from "@convex-gen/dataModel";
import {
  createAsset,
  updateAsset,
  type DescriptorValueInput,
} from "@/lib/api";
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
  decryptOptionalArray,
  decryptOptionalNumber,
  decryptOptionalText,
  decryptText,
  encryptOptionalArray,
  encryptOptionalNumber,
  encryptOptionalText,
  encryptText,
} from "@/lib/encrypted-fields";

type DescriptorDoc = Doc<"assetTypeDescriptors">;

interface BasicForm {
  name: string;
  description: string;
  dateAcquired: string;
  purchasedValue: string;
  marketValue: string;
  tags: string;
}

const EMPTY_FORM: BasicForm = {
  name: "",
  description: "",
  dateAcquired: "",
  purchasedValue: "",
  marketValue: "",
  tags: "",
};

function parseDollarsToCents(s: string): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

interface DecryptedDescriptor {
  _id: string;
  assetTypeId: string;
  name: string;
  dataType: string;
  required: boolean;
  order: number;
  options?: string[];
}

interface DecryptedSelectedAssetType {
  _id: string;
  name: string;
  descriptors: DecryptedDescriptor[];
}

export function CreateAssetPage() {
  const { id: collectionId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialCollectionIds = collectionId
    ? [collectionId]
    : searchParams.get("collectionId")
      ? [searchParams.get("collectionId")!]
      : [];

  return (
    <AssetForm
      mode="create"
      initialCollectionIds={initialCollectionIds}
      backHref={collectionId ? `/collections/${collectionId}` : "/assets"}
    />
  );
}

export function EditAssetPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <EditAssetLoader id={id} />;
}

interface DecryptedAssetForEdit {
  form: BasicForm;
  assetTypeId: string;
  collectionIds: string[];
  descriptorValues: Record<string, string>;
}

function EditAssetLoader({ id }: { id: string }) {
  const { dek } = useEncryption();
  const asset = useQuery(api.assets.getAsset, {
    assetId: id as Id<"assets">,
  });

  const decrypted = useDecrypted(
    asset,
    dek,
    async (raw, dek): Promise<DecryptedAssetForEdit> => {
      const purchasedCents = await decryptOptionalNumber(
        raw.purchasedValue,
        dek
      );
      const marketCents = await decryptOptionalNumber(raw.marketValue, dek);
      const tagsArr = await decryptOptionalArray(raw.tags, dek);

      const dvEntries = await Promise.all(
        raw.descriptorValues.map(async (dv) => [
          dv.descriptorId,
          await decryptText(dv.value, dek),
        ] as const)
      );

      return {
        form: {
          name: await decryptText(raw.name, dek),
          description:
            (await decryptOptionalText(raw.description, dek)) ?? "",
          dateAcquired:
            (await decryptOptionalText(raw.dateAcquired, dek)) ?? "",
          purchasedValue:
            purchasedCents !== undefined
              ? (purchasedCents / 100).toFixed(2)
              : "",
          marketValue:
            marketCents !== undefined ? (marketCents / 100).toFixed(2) : "",
          tags: tagsArr ? tagsArr.join(", ") : "",
        },
        assetTypeId: raw.assetTypeId ?? "",
        collectionIds: raw.collections.map((c) => c._id),
        descriptorValues: Object.fromEntries(dvEntries),
      };
    }
  );

  if (asset === undefined) return <Skeleton className="h-48 w-full max-w-2xl" />;
  if (!asset) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Asset not found.</p>
        <Button asChild className="mt-4">
          <Link to="/assets">All assets</Link>
        </Button>
      </div>
    );
  }
  if (!decrypted) return <Skeleton className="h-48 w-full max-w-2xl" />;

  return (
    <AssetForm
      key={id}
      mode="edit"
      assetId={id}
      backHref={`/assets/${id}`}
      initialForm={decrypted.form}
      initialAssetTypeId={decrypted.assetTypeId}
      initialCollectionIds={decrypted.collectionIds}
      initialDescriptorValues={decrypted.descriptorValues}
    />
  );
}

interface AssetFormProps {
  mode: "create" | "edit";
  assetId?: string;
  backHref: string;
  initialForm?: BasicForm;
  initialAssetTypeId?: string;
  initialCollectionIds?: string[];
  initialDescriptorValues?: Record<string, string>;
}

function AssetForm({
  mode,
  assetId,
  backHref,
  initialForm,
  initialAssetTypeId,
  initialCollectionIds,
  initialDescriptorValues,
}: AssetFormProps) {
  const { getAccessToken } = useAuth();
  const { dek } = useEncryption();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BasicForm>(initialForm ?? EMPTY_FORM);
  const [assetTypeId, setAssetTypeId] = useState(initialAssetTypeId ?? "");
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(
    new Set(initialCollectionIds ?? [])
  );
  const [descriptorValues, setDescriptorValues] = useState<
    Record<string, string>
  >(initialDescriptorValues ?? {});

  const assetTypes = useQuery(api.assetTypes.listAssetTypes);
  const collections = useQuery(api.collections.listCollections);
  const selectedAssetType = useQuery(
    api.assetTypes.getAssetType,
    assetTypeId
      ? { assetTypeId: assetTypeId as Id<"assetTypes"> }
      : "skip"
  );

  const decryptedAssetTypes = useDecrypted(
    assetTypes,
    dek,
    async (list, dek) =>
      Promise.all(
        list.map(async (at) => ({
          _id: at._id,
          name: await decryptText(at.name, dek),
        }))
      )
  );

  const decryptedCollections = useDecrypted(
    collections,
    dek,
    async (list, dek) =>
      Promise.all(
        list.map(async (c) => ({
          _id: c._id,
          name: await decryptText(c.name, dek),
        }))
      )
  );

  const decryptedSelectedAssetType = useDecrypted(
    selectedAssetType,
    dek,
    async (data, dek): Promise<DecryptedSelectedAssetType> => ({
      _id: data._id,
      name: await decryptText(data.name, dek),
      descriptors: await Promise.all(
        data.descriptors.map(async (d: DescriptorDoc) => ({
          _id: d._id,
          assetTypeId: d.assetTypeId,
          name: await decryptText(d.name, dek),
          dataType: d.dataType,
          required: d.required,
          order: d.order,
          options: await decryptOptionalArray(d.options, dek),
        }))
      ),
    })
  );

  // Fallback placeholder names while decryption is in flight, so the dropdown
  // and checkbox lists stay the right length and the user can still interact.
  const assetTypeOptions =
    decryptedAssetTypes ??
    (assetTypes ?? []).map((at) => ({ _id: at._id, name: "…" }));
  const collectionOptions =
    decryptedCollections ??
    (collections ?? []).map((c) => ({ _id: c._id, name: "…" }));

  function set(field: keyof BasicForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleCollection(id: string) {
    setSelectedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // If the user changes assetTypeId and submits before useDecrypted finishes,
  // descriptorValuesPayload would silently fall back to [] — dropping the
  // values the user entered for the prior type and providing none for the
  // new one. Guard the submit path on this explicitly.
  const assetTypeDecryptionPending =
    !!assetTypeId && !decryptedSelectedAssetType;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !dek) return;
    if (assetTypeDecryptionPending) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const descriptorValuesPayload: DescriptorValueInput[] =
        decryptedSelectedAssetType &&
        decryptedSelectedAssetType.descriptors.length > 0
          ? await Promise.all(
              decryptedSelectedAssetType.descriptors
                .map((d) => ({
                  descriptorId: d._id,
                  raw: descriptorValues[d._id] ?? "",
                }))
                .filter((dv) => dv.raw !== "")
                .map(async (dv) => ({
                  descriptorId: dv.descriptorId,
                  value: await encryptText(dv.raw, dek),
                }))
            )
          : [];

      const payload = {
        // Pass empty string through in edit mode so the backend can interpret
        // it as "clear the asset type" (it translates "" → null for Convex).
        // In create mode, the Go handler treats "" as omitted anyway.
        assetTypeId: mode === "edit" ? assetTypeId : assetTypeId || undefined,
        name: await encryptText(form.name.trim(), dek),
        description: await encryptOptionalText(
          form.description.trim() || undefined,
          dek
        ),
        dateAcquired: await encryptOptionalText(
          form.dateAcquired || undefined,
          dek
        ),
        purchasedValue: await encryptOptionalNumber(
          parseDollarsToCents(form.purchasedValue),
          dek
        ),
        marketValue: await encryptOptionalNumber(
          parseDollarsToCents(form.marketValue),
          dek
        ),
        tags: await encryptOptionalArray(tags.length ? tags : undefined, dek),
        collectionIds: Array.from(selectedCollections),
        descriptorValues: descriptorValuesPayload,
      };

      if (mode === "create") {
        const { id } = await createAsset(token, payload);
        toast.success("Asset added");
        navigate(`/assets/${id}`);
      } else if (assetId) {
        await updateAsset(token, assetId, payload);
        toast.success("Asset updated");
        navigate(`/assets/${assetId}`);
      }
    } catch {
      toast.error(mode === "create" ? "Failed to create asset" : "Failed to update asset");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to={backHref}>
            <ChevronLeft className="size-4" />Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">
          {mode === "create" ? "Add asset" : "Edit asset"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="1921 Morgan Silver Dollar"
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assetType">Asset type</Label>
              <select
                id="assetType"
                value={assetTypeId}
                onChange={(e) => setAssetTypeId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Untyped</option>
                {assetTypeOptions.map((at) => (
                  <option key={at._id} value={at._id}>
                    {at.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                <Link to="/asset-types/new" className="underline">
                  Create a new asset type
                </Link>{" "}
                if you don't see the one you need.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dateAcquired">Date acquired</Label>
                <Input
                  id="dateAcquired"
                  type="date"
                  value={form.dateAcquired}
                  onChange={(e) => set("dateAcquired", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={form.tags}
                  onChange={(e) => set("tags", e.target.value)}
                  placeholder="silver, morgan, us-mint"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Value</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="purchasedValue">Purchased ($)</Label>
              <Input
                id="purchasedValue"
                type="number"
                step="0.01"
                min="0"
                value={form.purchasedValue}
                onChange={(e) => set("purchasedValue", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marketValue">Market value ($)</Label>
              <Input
                id="marketValue"
                type="number"
                step="0.01"
                min="0"
                value={form.marketValue}
                onChange={(e) => set("marketValue", e.target.value)}
                placeholder="0.00"
              />
            </div>
          </CardContent>
        </Card>

        {decryptedSelectedAssetType &&
          decryptedSelectedAssetType.descriptors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {decryptedSelectedAssetType.name} details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {decryptedSelectedAssetType.descriptors.map((d) => (
                  <DescriptorField
                    key={d._id}
                    descriptor={d}
                    value={descriptorValues[d._id] ?? ""}
                    onChange={(v) =>
                      setDescriptorValues((prev) => ({ ...prev, [d._id]: v }))
                    }
                  />
                ))}
              </CardContent>
            </Card>
          )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Collections</CardTitle>
          </CardHeader>
          <CardContent>
            {collections === undefined ? (
              <Skeleton className="h-16 w-full" />
            ) : collections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You haven't created any collections yet. This asset will be standalone.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {collectionOptions.map((c) => (
                  <label
                    key={c._id}
                    className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCollections.has(c._id)}
                      onChange={() => toggleCollection(c._id)}
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(backHref)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              !form.name.trim() ||
              saving ||
              !dek ||
              assetTypeDecryptionPending
            }
          >
            {saving ? "Saving…" : mode === "create" ? "Add asset" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DescriptorField({
  descriptor,
  value,
  onChange,
}: {
  descriptor: DecryptedDescriptor;
  value: string;
  onChange: (v: string) => void;
}) {
  const label = (
    <Label htmlFor={descriptor._id}>
      {descriptor.name}
      {descriptor.required && " *"}
    </Label>
  );

  if (descriptor.dataType === "boolean") {
    return (
      <div className="space-y-1.5">
        {label}
        <select
          id={descriptor._id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={descriptor.required}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>
    );
  }

  if (descriptor.dataType === "select") {
    return (
      <div className="space-y-1.5">
        {label}
        <select
          id={descriptor._id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={descriptor.required}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">—</option>
          {(descriptor.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (descriptor.dataType === "year") {
    return (
      <div className="space-y-1.5">
        {label}
        <Input
          id={descriptor._id}
          type="number"
          inputMode="numeric"
          min={1}
          max={9999}
          step={1}
          placeholder="e.g. 2003"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={descriptor.required}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {label}
      <Input
        id={descriptor._id}
        type={
          descriptor.dataType === "number"
            ? "number"
            : descriptor.dataType === "date"
              ? "date"
              : "text"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={descriptor.required}
      />
    </div>
  );
}
