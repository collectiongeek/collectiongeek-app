import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import type { Id } from "@convex-gen/dataModel";
import { deleteAssetType } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import {
  decryptOptionalArray,
  decryptOptionalText,
  decryptText,
} from "@/lib/encrypted-fields";

// Tiny provenance line shown when this asset type was installed from a
// public template. Links to the template detail page when it still exists
// in the catalog; otherwise renders without a link.
function TemplateProvenance({
  slug,
  version,
  displayName,
  templateExists,
}: {
  slug: string;
  version: string;
  displayName?: string;
  templateExists: boolean;
}) {
  // displayName is plaintext from the catalog query — falls back to the slug
  // until the lookup resolves (or permanently, if the template was removed).
  const label = displayName ?? slug;
  const content = (
    <>
      <Download className="size-3.5" />
      <span>
        Installed from <span className="font-medium text-foreground">{label}</span>{" "}
        <span className="font-mono">v{version}</span>
      </span>
    </>
  );
  return (
    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
      {templateExists ? (
        <Link
          to={`/templates/${slug}`}
          className="flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
        >
          {content}
        </Link>
      ) : (
        <span className="flex items-center gap-1.5">{content}</span>
      )}
    </div>
  );
}

const DATA_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  year: "Year",
  boolean: "Yes/No",
  select: "Select",
};

interface DecryptedAssetType {
  name: string;
  description?: string;
  descriptors: Array<{
    _id: string;
    name: string;
    dataType: string;
    required: boolean;
    options?: string[];
  }>;
}

export function AssetTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <AssetTypeDetail id={id} />;
}

function AssetTypeDetail({ id }: { id: string }) {
  const { dek } = useEncryption();
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const assetType = useQuery(api.assetTypes.getAssetType, {
    assetTypeId: id as Id<"assetTypes">,
  });
  // Source-template lookup is skipped unless this asset type was installed
  // from one. The slug + version are plaintext on the assetType row, so the
  // provenance line can render even if this lookup hasn't resolved yet.
  const sourceTemplate = useQuery(
    api.assetTypeTemplates.getTemplateBySlug,
    assetType?.sourceTemplateSlug
      ? { slug: assetType.sourceTemplateSlug }
      : "skip"
  );

  async function handleDelete() {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteAssetType(token, id);
      toast.success("Asset type deleted");
      navigate("/asset-types");
    } catch (e) {
      console.error("Asset type delete failed:", e);
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg.includes("in use")
          ? "Asset type is in use by one or more assets"
          : "Failed to delete"
      );
    }
  }

  const decrypted = useDecrypted(
    assetType,
    dek,
    async (data, dek): Promise<DecryptedAssetType> => ({
      name: await decryptText(data.name, dek),
      description: await decryptOptionalText(data.description, dek),
      descriptors: await Promise.all(
        data.descriptors.map(async (d) => ({
          _id: d._id,
          name: await decryptText(d.name, dek),
          dataType: d.dataType,
          required: d.required,
          options: await decryptOptionalArray(d.options, dek),
        }))
      ),
    })
  );

  if (assetType === undefined || (assetType !== null && !decrypted)) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (assetType === null) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Asset type not found.</p>
        <Button asChild className="mt-4">
          <Link to="/asset-types">Back to asset types</Link>
        </Button>
      </div>
    );
  }
  if (!decrypted) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/asset-types">
            <ChevronLeft className="size-4" />Asset types
          </Link>
        </Button>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <h1 className="text-2xl font-bold">{decrypted.name}</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/asset-types/${id}/edit`}>
                <Pencil className="size-4" />Edit
              </Link>
            </Button>
            <AlertDialog
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
            >
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2 className="size-4" />Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete asset type?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Delete <strong>{decrypted.name}</strong>? Any assets using
                    this type must be moved off it first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {decrypted.description && (
          <p className="text-muted-foreground mt-2">{decrypted.description}</p>
        )}
        {assetType.sourceTemplateSlug && assetType.sourceTemplateVersion && (
          <TemplateProvenance
            slug={assetType.sourceTemplateSlug}
            version={assetType.sourceTemplateVersion}
            displayName={sourceTemplate?.name}
            templateExists={sourceTemplate !== null}
          />
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Descriptors
        </h2>
        {decrypted.descriptors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No descriptors yet. Edit this asset type to add fields like ISBN, VIN, etc.
          </p>
        ) : (
          <div className="space-y-2">
            {decrypted.descriptors.map((d) => (
              <div
                key={d._id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{d.name}</p>
                  {d.dataType === "select" && d.options && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.options.join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {d.required && <Badge variant="secondary">Required</Badge>}
                  <Badge variant="outline">
                    {DATA_TYPE_LABELS[d.dataType] ?? d.dataType}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
