import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc, Id } from "@convex-gen/dataModel";
import {
  createAssetType,
  updateAssetType,
  type DescriptorDataType,
  type DescriptorInput,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import {
  decryptOptionalArray,
  decryptOptionalText,
  decryptText,
  encryptOptionalArray,
  encryptOptionalText,
  encryptText,
} from "@/lib/encrypted-fields";

const DATA_TYPES: { value: DescriptorDataType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "year", label: "Year" },
  { value: "boolean", label: "Yes/No" },
  { value: "select", label: "Select" },
];

/** Plaintext form state for one descriptor row. */
interface DescriptorRow {
  name: string;
  dataType: DescriptorDataType;
  required: boolean;
  order: number;
  /** Comma-separated text the user types for `select` options. */
  optionsRaw: string;
}

function emptyDescriptor(order: number): DescriptorRow {
  return {
    name: "",
    dataType: "text",
    required: false,
    order,
    optionsRaw: "",
  };
}

interface InitialForm {
  name: string;
  description: string;
  descriptors: DescriptorRow[];
}

export function CreateAssetTypePage() {
  return <AssetTypeForm mode="create" />;
}

export function EditAssetTypePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <EditAssetTypeLoader id={id} />;
}

type AssetTypeWithDescriptors = NonNullable<
  ReturnType<
    typeof useQuery<typeof api.assetTypes.getAssetType>
  > extends infer T
    ? T
    : never
>;

function EditAssetTypeLoader({ id }: { id: string }) {
  const { dek } = useEncryption();
  const data = useQuery(api.assetTypes.getAssetType, {
    assetTypeId: id as Id<"assetTypes">,
  });

  const initial = useDecrypted(
    data,
    dek,
    async (raw: AssetTypeWithDescriptors, dek): Promise<InitialForm> => {
      return {
        name: await decryptText(raw.name, dek),
        description: (await decryptOptionalText(raw.description, dek)) ?? "",
        descriptors: await Promise.all(
          raw.descriptors.map(async (d: Doc<"assetTypeDescriptors">) => {
            const options = await decryptOptionalArray(d.options, dek);
            return {
              name: await decryptText(d.name, dek),
              dataType: d.dataType as DescriptorDataType,
              required: d.required,
              order: d.order,
              optionsRaw: options ? options.join(", ") : "",
            };
          })
        ),
      };
    }
  );

  if (data === undefined) return <Skeleton className="h-48 w-full max-w-2xl" />;
  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Asset type not found.</p>
        <Button asChild className="mt-4">
          <Link to="/asset-types">Back to asset types</Link>
        </Button>
      </div>
    );
  }
  if (!initial) return <Skeleton className="h-48 w-full max-w-2xl" />;

  return (
    <AssetTypeForm key={id} mode="edit" assetTypeId={id} initial={initial} />
  );
}

interface FormProps {
  mode: "create" | "edit";
  assetTypeId?: string;
  initial?: InitialForm;
}

function AssetTypeForm({ mode, assetTypeId, initial }: FormProps) {
  const { getAccessToken } = useAuth();
  const { dek } = useEncryption();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [descriptors, setDescriptors] = useState<DescriptorRow[]>(
    initial?.descriptors ?? []
  );

  function addDescriptor() {
    setDescriptors((prev) => [...prev, emptyDescriptor(prev.length)]);
  }

  function updateDescriptor(i: number, patch: Partial<DescriptorRow>) {
    setDescriptors((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d))
    );
  }

  function removeDescriptor(i: number) {
    setDescriptors((prev) =>
      prev.filter((_, idx) => idx !== i).map((d, idx) => ({ ...d, order: idx }))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dek) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const payloadDescriptors: DescriptorInput[] = await Promise.all(
        descriptors
          .filter((d) => d.name.trim())
          .map(async (d, idx) => {
            const optionsArr =
              d.dataType === "select"
                ? d.optionsRaw
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : undefined;
            return {
              name: await encryptText(d.name.trim(), dek),
              dataType: d.dataType,
              required: d.required,
              order: idx,
              options: await encryptOptionalArray(optionsArr, dek),
            };
          })
      );

      const payload = {
        name: await encryptText(name.trim(), dek),
        description: await encryptOptionalText(
          description.trim() || undefined,
          dek
        ),
        descriptors: payloadDescriptors,
      };

      if (mode === "create") {
        const { id } = await createAssetType(token, payload);
        toast.success("Asset type created");
        navigate(`/asset-types/${id}`);
      } else if (assetTypeId) {
        await updateAssetType(token, assetTypeId, payload);
        toast.success("Asset type updated");
        navigate(`/asset-types/${assetTypeId}`);
      }
    } catch {
      toast.error(mode === "create" ? "Failed to create" : "Failed to update");
      setSaving(false);
    }
  }

  const backHref =
    mode === "edit" && assetTypeId ? `/asset-types/${assetTypeId}` : "/asset-types";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to={backHref}>
            <ChevronLeft className="size-4" />Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">
          {mode === "create" ? "New asset type" : "Edit asset type"}
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
                placeholder="Coin, Book, Car…"
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Descriptors</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addDescriptor}>
                <Plus className="size-4" />Add descriptor
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Descriptors are the fields that describe an asset of this type.
              For example, a <span className="font-medium">Car</span> might
              have descriptors like VIN, Color, Model Year, and Mileage.
            </p>
          </CardHeader>
          {descriptors.length > 0 && (
            <CardContent className="space-y-3">
              {descriptors.map((d, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Descriptor name (e.g. ISBN)"
                      value={d.name}
                      onChange={(e) => updateDescriptor(i, { name: e.target.value })}
                      className="flex-1"
                      maxLength={100}
                    />
                    <select
                      value={d.dataType}
                      onChange={(e) =>
                        updateDescriptor(i, {
                          dataType: e.target.value as DescriptorDataType,
                        })
                      }
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {DATA_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDescriptor(i)}
                      className="size-9 shrink-0"
                      aria-label="Remove descriptor"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  {d.dataType === "select" && (
                    <Input
                      placeholder="Options (comma-separated)"
                      value={d.optionsRaw}
                      onChange={(e) =>
                        updateDescriptor(i, { optionsRaw: e.target.value })
                      }
                    />
                  )}
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={d.required}
                      onChange={(e) =>
                        updateDescriptor(i, { required: e.target.checked })
                      }
                    />
                    Required
                  </label>
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(backHref)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || saving || !dek}>
            {saving ? "Saving…" : mode === "create" ? "Create asset type" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
