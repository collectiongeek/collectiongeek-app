import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc, Id } from "@convex-gen/dataModel";
import { updateAsset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface CustomField { fieldName: string; fieldValue: string; fieldType: string }

type AssetWithFields = Doc<"assets"> & { customFields: Doc<"customFields">[] };

export function EditAssetPage() {
  const { id } = useParams<{ id: string }>();
  const asset = useQuery(api.assets.getAsset, { assetId: id as Id<"assets"> });

  if (asset === undefined) return <Skeleton className="h-48 w-full max-w-lg" />;
  if (!asset) return null;

  return <EditAssetForm id={id!} asset={asset} />;
}

function EditAssetForm({ id, asset }: { id: string; asset: AssetWithFields }) {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: asset.name,
    description: asset.description ?? "",
    dateAcquired: asset.dateAcquired ?? "",
    purchasedValue: asset.purchasedValue !== undefined ? (asset.purchasedValue / 100).toFixed(2) : "",
    marketValue: asset.marketValue !== undefined ? (asset.marketValue / 100).toFixed(2) : "",
    tags: asset.tags?.join(", ") ?? "",
    category: asset.category ?? "",
  });
  const [customFields, setCustomFields] = useState<CustomField[]>(
    asset.customFields.map((f) => ({ fieldName: f.fieldName, fieldValue: f.fieldValue, fieldType: f.fieldType }))
  );

  function set(field: keyof typeof form, value: string) { setForm((prev) => ({ ...prev, [field]: value })); }
  function addField() { setCustomFields((prev) => [...prev, { fieldName: "", fieldValue: "", fieldType: "text" }]); }
  function updateField(i: number, key: keyof CustomField, value: string) { setCustomFields((prev) => prev.map((f, idx) => idx === i ? { ...f, [key]: value } : f)); }
  function removeField(i: number) { setCustomFields((prev) => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      await updateAsset(token, id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        dateAcquired: form.dateAcquired || undefined,
        purchasedValue: form.purchasedValue ? Math.round(parseFloat(form.purchasedValue) * 100) : undefined,
        marketValue: form.marketValue ? Math.round(parseFloat(form.marketValue) * 100) : undefined,
        tags: tags.length ? tags : undefined,
        category: form.category.trim() || undefined,
        customFields: customFields.filter((f) => f.fieldName && f.fieldValue),
      });
      toast.success("Asset updated");
      navigate(`/assets/${id}`);
    } catch {
      toast.error("Failed to update asset");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to={`/assets/${id}`}><ChevronLeft className="size-4" />Back</Link>
        </Button>
        <h1 className="text-2xl font-bold">Edit asset</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Basic info</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="name">Name *</Label><Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="description">Description</Label><Textarea id="description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="category">Category</Label><Input id="category" value={form.category} onChange={(e) => set("category", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="dateAcquired">Date acquired</Label><Input id="dateAcquired" type="date" value={form.dateAcquired} onChange={(e) => set("dateAcquired", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="tags">Tags (comma-separated)</Label><Input id="tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Value</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label htmlFor="purchasedValue">Purchased ($)</Label><Input id="purchasedValue" type="number" step="0.01" min="0" value={form.purchasedValue} onChange={(e) => set("purchasedValue", e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="marketValue">Market value ($)</Label><Input id="marketValue" type="number" step="0.01" min="0" value={form.marketValue} onChange={(e) => set("marketValue", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Custom fields</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addField}><Plus className="size-4" />Add field</Button>
            </div>
          </CardHeader>
          {customFields.length > 0 && (
            <CardContent className="space-y-3">
              {customFields.map((field, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Field name" value={field.fieldName} onChange={(e) => updateField(i, "fieldName", e.target.value)} className="flex-1" />
                  <Input placeholder="Value" value={field.fieldValue} onChange={(e) => updateField(i, "fieldValue", e.target.value)} className="flex-1" />
                  <select value={field.fieldType} onChange={(e) => updateField(i, "fieldType", e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </select>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeField(i)} className="size-9 shrink-0"><X className="size-4" /></Button>
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(`/assets/${id}`)}>Cancel</Button>
          <Button type="submit" disabled={!form.name.trim() || saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </div>
  );
}
