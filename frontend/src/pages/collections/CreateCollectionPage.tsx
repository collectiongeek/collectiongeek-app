import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Doc } from "@convex-gen/dataModel";
import { createCollection } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

export function CreateCollectionPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const collectionTypes = useQuery(api.collectionTypes.listCollectionTypes);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    collectionTypeId: "",
  });

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const { id } = await createCollection(token, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        collectionTypeId: form.collectionTypeId || undefined,
      });
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
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Untyped</option>
                {(collectionTypes ?? []).map((ct: Doc<"collectionTypes">) => (
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

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>
                Cancel
              </Button>
              <Button type="submit" disabled={!form.name.trim() || saving}>
                {saving ? "Creating…" : "Create collection"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
