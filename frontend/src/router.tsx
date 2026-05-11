import { createBrowserRouter } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LandingPage } from "@/pages/LandingPage";
import { AuthCallback } from "@/pages/auth/AuthCallback";
import { AccountDeletedPage } from "@/pages/AccountDeletedPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { SettingsPage } from "@/pages/SettingsPage";

// Collection pages (Phase 2)
import { CreateCollectionPage } from "@/pages/collections/CreateCollectionPage";
import { CollectionDetailPage } from "@/pages/collections/CollectionDetailPage";
import { EditCollectionPage } from "@/pages/collections/EditCollectionPage";

// Asset pages (Phase 3)
import { CreateAssetPage } from "@/pages/assets/CreateAssetPage";
import { AssetDetailPage } from "@/pages/assets/AssetDetailPage";
import { EditAssetPage } from "@/pages/assets/EditAssetPage";

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
          { path: "/collections/new", element: <CreateCollectionPage /> },
          { path: "/collections/:id", element: <CollectionDetailPage /> },
          { path: "/collections/:id/edit", element: <EditCollectionPage /> },
          { path: "/collections/:id/assets/new", element: <CreateAssetPage /> },
          { path: "/assets/:id", element: <AssetDetailPage /> },
          { path: "/assets/:id/edit", element: <EditAssetPage /> },
        ],
      },
    ],
  },
]);
