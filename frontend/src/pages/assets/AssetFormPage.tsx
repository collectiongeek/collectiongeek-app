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

function EditAssetLoader({ id }: { id: string }) {
  const asset = useQuery(api.assets.getAsset, {
    assetId: id as Id<"assets">,
  });

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

  const valuesById = new Map(
    asset.descriptorValues.map((v) => [v.descriptorId, v.value])
  );

  return (
    <AssetForm
      key={id}
      mode="edit"
      assetId={id}
      backHref={`/assets/${id}`}
      initialForm={{
        name: asset.name,
        description: asset.description ?? "",
        dateAcquired: asset.dateAcquired ?? "",
        purchasedValue:
          asset.purchasedValue !== undefined
            ? (asset.purchasedValue / 100).toFixed(2)
            : "",
        marketValue:
          asset.marketValue !== undefined
            ? (asset.marketValue / 100).toFixed(2)
            : "",
        tags: asset.tags?.join(", ") ?? "",
      }}
      initialAssetTypeId={asset.assetTypeId ?? ""}
      initialCollectionIds={asset.collections.map((c) => c._id)}
      initialDescriptorValues={Object.fromEntries(valuesById)}
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const descriptorValuesPayload: DescriptorValueInput[] =
        selectedAssetType && selectedAssetType.descriptors.length > 0
          ? selectedAssetType.descriptors
              .map((d) => ({
                descriptorId: d._id,
                value: descriptorValues[d._id] ?? "",
              }))
              .filter((dv) => dv.value !== "")
          : [];

      const payload = {
        // Pass empty string through in edit mode so the backend can interpret
        // it as "clear the asset type" (it translates "" → null for Convex).
        // In create mode, the Go handler treats "" as omitted anyway.
        assetTypeId: mode === "edit" ? assetTypeId : assetTypeId || undefined,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        dateAcquired: form.dateAcquired || undefined,
        purchasedValue: parseDollarsToCents(form.purchasedValue),
        marketValue: parseDollarsToCents(form.marketValue),
        tags: tags.length ? tags : undefined,
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
                {(assetTypes ?? []).map((at: Doc<"assetTypes">) => (
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

        {selectedAssetType && selectedAssetType.descriptors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedAssetType.name} details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedAssetType.descriptors.map((d: DescriptorDoc) => (
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
                {collections.map((c: Doc<"collections">) => (
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
          <Button type="submit" disabled={!form.name.trim() || saving}>
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
  descriptor: DescriptorDoc;
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
