import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import type { Id } from "@convex-gen/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, Pencil } from "lucide-react";
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import {
  decryptOptionalArray,
  decryptOptionalText,
  decryptText,
} from "@/lib/encrypted-fields";

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
  const assetType = useQuery(api.assetTypes.getAssetType, {
    assetTypeId: id as Id<"assetTypes">,
  });

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
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{decrypted.name}</h1>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/asset-types/${id}/edit`}>
              <Pencil className="size-4" />Edit
            </Link>
          </Button>
        </div>
        {decrypted.description && (
          <p className="text-muted-foreground mt-2">{decrypted.description}</p>
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
