import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import type { Doc, Id } from "@convex-gen/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, Pencil } from "lucide-react";
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import { decryptOptionalText, decryptText } from "@/lib/encrypted-fields";

export function CollectionTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CollectionTypeDetail id={id} />;
}

function CollectionTypeDetail({ id }: { id: string }) {
  const { dek } = useEncryption();
  const collectionType = useQuery(api.collectionTypes.getCollectionType, {
    collectionTypeId: id as Id<"collectionTypes">,
  });

  const decrypted = useDecrypted(
    collectionType,
    dek,
    async (data, dek) => ({
      name: await decryptText(data.name, dek),
      description: await decryptOptionalText(data.description, dek),
    })
  );

  if (collectionType === undefined || (collectionType !== null && !decrypted)) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (collectionType === null) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Collection type not found.</p>
        <Button asChild className="mt-4">
          <Link to="/collection-types">Back to collection types</Link>
        </Button>
      </div>
    );
  }
  if (!decrypted) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/collection-types">
            <ChevronLeft className="size-4" />Collection types
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{decrypted.name}</h1>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/collection-types/${id}/edit`}>
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
          Suggested asset types
        </h2>
        {collectionType.assetTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No suggested asset types. Edit to link some.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {collectionType.assetTypes.map((at) => (
              <AssetTypeBadge key={at._id} assetType={at} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetTypeBadge({ assetType }: { assetType: Doc<"assetTypes"> }) {
  const { dek } = useEncryption();
  const decrypted = useDecrypted(assetType, dek, async (at, dek) => ({
    name: await decryptText(at.name, dek),
  }));
  const name = decrypted?.name ?? "…";

  return (
    <Link to={`/asset-types/${assetType._id}`}>
      <Badge variant="secondary" className="cursor-pointer hover:bg-muted">
        {name}
      </Badge>
    </Link>
  );
}
