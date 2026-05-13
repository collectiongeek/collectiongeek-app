import { createBrowserRouter } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LandingPage } from "@/pages/LandingPage";
import { AuthCallback } from "@/pages/auth/AuthCallback";
import { AccountDeletedPage } from "@/pages/AccountDeletedPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { SettingsPage } from "@/pages/SettingsPage";

// Asset Types
import { AssetTypesListPage } from "@/pages/asset-types/AssetTypesListPage";
import {
  CreateAssetTypePage,
  EditAssetTypePage,
} from "@/pages/asset-types/AssetTypeFormPage";
import { AssetTypeDetailPage } from "@/pages/asset-types/AssetTypeDetailPage";

// Collection Types
import { CollectionTypesListPage } from "@/pages/collection-types/CollectionTypesListPage";
import {
  CreateCollectionTypePage,
  EditCollectionTypePage,
} from "@/pages/collection-types/CollectionTypeFormPage";
import { CollectionTypeDetailPage } from "@/pages/collection-types/CollectionTypeDetailPage";

// Collections
import { CreateCollectionPage } from "@/pages/collections/CreateCollectionPage";
import { CollectionDetailPage } from "@/pages/collections/CollectionDetailPage";
import { EditCollectionPage } from "@/pages/collections/EditCollectionPage";

// Assets
import {
  CreateAssetPage,
  EditAssetPage,
} from "@/pages/assets/AssetFormPage";
import { AssetDetailPage } from "@/pages/assets/AssetDetailPage";
import { AllAssetsPage } from "@/pages/assets/AllAssetsPage";

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
]);
