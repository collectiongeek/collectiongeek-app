/* eslint-disable react-refresh/only-export-components --
 * The router module mixes `lazy()` component references with the `router`
 * export. Fast Refresh's "components-only file" rule has no narrow exception
 * for that shape and there's nothing useful to gain from it here: a route
 * change usually wants a full reload, not a hot-swap.
 */
import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";
import { ChunkErrorBoundary } from "@/components/layout/ChunkErrorBoundary";
import { Layout } from "@/components/layout/Layout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LandingPage } from "@/pages/LandingPage";
import { Skeleton } from "@/components/ui/skeleton";

// Public + auth flow pages: kept eager. The landing page is the unauthenticated
// entry point and ProtectedRoute / Layout host every internal screen, so it's
// the seam where lazy-loading buys us the most without delaying first paint
// on the marketing surface.
import { AuthCallback } from "@/pages/auth/AuthCallback";
import { AccountDeletedPage } from "@/pages/AccountDeletedPage";

// Each named-export wrapper turns the page's named export into the `default`
// shape React.lazy needs, so Vite can emit one chunk per page.
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);

const AssetTypesListPage = lazy(() =>
  import("@/pages/asset-types/AssetTypesListPage").then((m) => ({
    default: m.AssetTypesListPage,
  }))
);
const CreateAssetTypePage = lazy(() =>
  import("@/pages/asset-types/AssetTypeFormPage").then((m) => ({
    default: m.CreateAssetTypePage,
  }))
);
const EditAssetTypePage = lazy(() =>
  import("@/pages/asset-types/AssetTypeFormPage").then((m) => ({
    default: m.EditAssetTypePage,
  }))
);
const AssetTypeDetailPage = lazy(() =>
  import("@/pages/asset-types/AssetTypeDetailPage").then((m) => ({
    default: m.AssetTypeDetailPage,
  }))
);

const CollectionTypesListPage = lazy(() =>
  import("@/pages/collection-types/CollectionTypesListPage").then((m) => ({
    default: m.CollectionTypesListPage,
  }))
);
const CreateCollectionTypePage = lazy(() =>
  import("@/pages/collection-types/CollectionTypeFormPage").then((m) => ({
    default: m.CreateCollectionTypePage,
  }))
);
const EditCollectionTypePage = lazy(() =>
  import("@/pages/collection-types/CollectionTypeFormPage").then((m) => ({
    default: m.EditCollectionTypePage,
  }))
);
const CollectionTypeDetailPage = lazy(() =>
  import("@/pages/collection-types/CollectionTypeDetailPage").then((m) => ({
    default: m.CollectionTypeDetailPage,
  }))
);

const CreateCollectionPage = lazy(() =>
  import("@/pages/collections/CreateCollectionPage").then((m) => ({
    default: m.CreateCollectionPage,
  }))
);
const CollectionDetailPage = lazy(() =>
  import("@/pages/collections/CollectionDetailPage").then((m) => ({
    default: m.CollectionDetailPage,
  }))
);
const EditCollectionPage = lazy(() =>
  import("@/pages/collections/EditCollectionPage").then((m) => ({
    default: m.EditCollectionPage,
  }))
);

const CreateAssetPage = lazy(() =>
  import("@/pages/assets/AssetFormPage").then((m) => ({
    default: m.CreateAssetPage,
  }))
);
const EditAssetPage = lazy(() =>
  import("@/pages/assets/AssetFormPage").then((m) => ({
    default: m.EditAssetPage,
  }))
);
const AssetDetailPage = lazy(() =>
  import("@/pages/assets/AssetDetailPage").then((m) => ({
    default: m.AssetDetailPage,
  }))
);
const AllAssetsPage = lazy(() =>
  import("@/pages/assets/AllAssetsPage").then((m) => ({
    default: m.AllAssetsPage,
  }))
);

// Single Suspense seam wrapping the protected outlet. Each lazy page chunk
// shows the same skeleton during fetch; once cached, navigation between pages
// is instant. The ChunkErrorBoundary outside Suspense catches dynamic-import
// failures (most often: a deploy invalidated the URLs of the chunks this tab
// has cached) and gives the user a reload affordance instead of a blank screen.
function LazyLayoutOutlet() {
  return (
    <ChunkErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-background p-8">
            <div className="mx-auto max-w-5xl space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </ChunkErrorBoundary>
  );
}

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/callback", element: <AuthCallback /> },
  { path: "/account-deleted", element: <AccountDeletedPage /> },

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            element: <LazyLayoutOutlet />,
            children: [
              { path: "/dashboard", element: <DashboardPage /> },
              { path: "/settings", element: <SettingsPage /> },

              { path: "/asset-types", element: <AssetTypesListPage /> },
              { path: "/asset-types/new", element: <CreateAssetTypePage /> },
              { path: "/asset-types/:id", element: <AssetTypeDetailPage /> },
              { path: "/asset-types/:id/edit", element: <EditAssetTypePage /> },

              { path: "/collection-types", element: <CollectionTypesListPage /> },
              { path: "/collection-types/new", element: <CreateCollectionTypePage /> },
              { path: "/collection-types/:id", element: <CollectionTypeDetailPage /> },
              { path: "/collection-types/:id/edit", element: <EditCollectionTypePage /> },

              { path: "/collections/new", element: <CreateCollectionPage /> },
              { path: "/collections/:id", element: <CollectionDetailPage /> },
              { path: "/collections/:id/edit", element: <EditCollectionPage /> },
              { path: "/collections/:id/assets/new", element: <CreateAssetPage /> },

              { path: "/assets", element: <AllAssetsPage /> },
              { path: "/assets/new", element: <CreateAssetPage /> },
              { path: "/assets/:id", element: <AssetDetailPage /> },
              { path: "/assets/:id/edit", element: <EditAssetPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
