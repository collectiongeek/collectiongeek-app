import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import {
  createAssetType,
  type DescriptorInput,
  type DescriptorDataType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { useEncryption } from "@/lib/encryption-provider";
import {
  encryptOptionalArray,
  encryptOptionalText,
  encryptText,
} from "@/lib/encrypted-fields";

const DATA_TYPE_LABELS: Record<DescriptorDataType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  year: "Year",
  boolean: "Yes/No",
  select: "Select",
};

export function TemplateDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return null;
  return <TemplateDetail slug={slug} />;
}

function TemplateDetail({ slug }: { slug: string }) {
  const { getAccessToken } = useAuth();
  const { dek } = useEncryption();
  const navigate = useNavigate();
  const template = useQuery(api.assetTypeTemplates.getTemplateBySlug, { slug });
  const [installing, setInstalling] = useState(false);

  async function handleInstall() {
    if (!template || !dek) return;
    setInstalling(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      // Encrypt the template under the user's DEK. From this point the new
      // asset type is indistinguishable from a hand-authored one — same shape,
      // same encryption, same write path. The sourceTemplateSlug + version
      // fields are the only marker that it came from the catalog.
      const payloadDescriptors: DescriptorInput[] = await Promise.all(
        template.descriptors.map(async (d, idx) => ({
          name: await encryptText(d.name, dek),
          dataType: d.dataType as DescriptorDataType,
          required: d.required,
          order: idx,
          options: await encryptOptionalArray(d.options, dek),
          // Stamp the template descriptor's stable identity onto the
          // user's row so the future upgrade-diff matches by identity
          // rather than by name, even after the user renames the field.
          sourceKey: d.key,
        }))
      );

      const { id } = await createAssetType(token, {
        name: await encryptText(template.name, dek),
        description: await encryptOptionalText(template.description, dek),
        descriptors: payloadDescriptors,
        sourceTemplateSlug: template.slug,
        sourceTemplateVersion: template.version,
      });
      toast.success(`Installed "${template.name}"`);
      navigate(`/asset-types/${id}`);
    } catch (err) {
      // Surface the underlying error in dev tools — the toast intentionally
      // stays generic so a transport/CORS/backend error doesn't leak details
      // to end users, but the console line saves a debugging round-trip.
      console.error("Template install failed:", err);
      toast.error("Failed to install template");
      setInstalling(false);
    }
  }

  if (template === undefined) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (template === null) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Template not found.</p>
        <Button asChild className="mt-4">
          <Link to="/templates">Back to library</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/templates">
            <ChevronLeft className="size-4" />Back to library
          </Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{template.name}</h1>
            {template.description && (
              <p className="text-muted-foreground">{template.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="font-mono">
                v{template.version}
              </Badge>
              <div className="flex items-center gap-1.5">
                <Download className="size-3.5" />
                <span>
                  {template.installCount.toLocaleString()}{" "}
                  {template.installCount === 1 ? "install" : "installs"}
                </span>
              </div>
              {template.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Button
            onClick={handleInstall}
            disabled={installing || !dek}
            className="sm:shrink-0"
          >
            <Download className="size-4" />
            {installing ? "Installing…" : "Install"}
          </Button>
        </div>
        {!dek && (
          <p className="mt-2 text-xs text-muted-foreground">
            Unlock encryption to install templates.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Descriptors</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            The fields this asset type tracks. You can edit, add, or remove any
            of them after installing.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {template.descriptors.map((d) => (
              <li key={d._id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{d.name}</span>
                    {d.required && (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        Required
                      </Badge>
                    )}
                  </div>
                  {d.dataType === "select" && d.options && d.options.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {d.options.join(" · ")}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {DATA_TYPE_LABELS[d.dataType as DescriptorDataType]}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
