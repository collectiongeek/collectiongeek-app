import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@workos-inc/authkit-react";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import { BookOpen, LogOut, Menu, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemePicker } from "@/components/layout/ThemePicker";
import { HeaderSearch } from "@/components/layout/HeaderSearch";

const navItems = [
  { to: "/dashboard", label: "Collections" },
  { to: "/assets", label: "Assets" },
  { to: "/asset-types", label: "Asset types" },
  { to: "/collection-types", label: "Collection types" },
];

export function Layout() {
  const { user, signOut } = useAuth();
  const convexUser = useQuery(api.users.getUser);

  async function handleSignOut() {
    // signOut({ navigate: false }) clears the in-memory JWT and localStorage
    // refresh tokens, and (after we await) the fire-and-forget fetch to the
    // WorkOS logout endpoint completes — invalidating the server-side
    // session too. It does NOT update AuthKit's React user state, so a
    // client-side navigate("/") would flash the landing page and bounce back
    // to /dashboard because LandingPage's useEffect still sees `user`.
    // window.location.replace forces a full reload so AuthKit re-initializes
    // from scratch with no tokens → user is null → lands on LandingPage.
    // Skipping the WorkOS-hosted logout redirect avoids the
    // app-homepage-url-not-found error in environments missing that config.
    await signOut({ navigate: false }).catch((err) => {
      console.warn("Sign-out request failed:", err);
    });
    window.location.replace("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold shrink-0">
            <BookOpen className="size-5" />
            <span className="hidden sm:inline">CollectionGeek</span>
          </Link>

          {user && (
            <div className="flex items-center gap-3">
              <HeaderSearch className="w-40 sm:w-48 lg:w-56" />
              <nav className="hidden lg:flex items-center gap-1 text-sm whitespace-nowrap">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded-md px-2.5 py-1.5 transition-colors ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}

          {user && (
            <div className="flex items-center gap-1">
              {/* Below lg, the inline nav links are hidden — surface them via
                  a hamburger menu so users on phones/tablets can still navigate. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Navigation menu"
                    className="lg:hidden"
                  >
                    <Menu className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {navItems.map((item) => (
                    <DropdownMenuItem asChild key={item.to}>
                      <Link to={item.to} className="cursor-pointer">
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <ThemePicker />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account menu">
                    <User className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
                  {convexUser === undefined
                    ? " "
                    : convexUser?.username || user.email}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <Settings className="size-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={handleSignOut}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
