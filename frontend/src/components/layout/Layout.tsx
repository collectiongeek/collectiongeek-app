import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@workos-inc/authkit-react";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import { BookOpen, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemePicker } from "@/components/layout/ThemePicker";

const navItems = [
  { to: "/dashboard", label: "Collections" },
  { to: "/assets", label: "Assets" },
  { to: "/asset-types", label: "Asset types" },
  { to: "/collection-types", label: "Collection types" },
];

export function Layout() {
  const { user, signOut } = useAuth();
  const convexUser = useQuery(api.users.getUser);
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto grid h-14 max-w-5xl grid-cols-[1fr_auto_1fr] items-center px-4">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <BookOpen className="size-5" />
            CollectionGeek
          </Link>

          {user ? (
            <nav className="hidden md:flex items-center justify-center gap-1 text-sm whitespace-nowrap">
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
          ) : (
            <div />
          )}

          {user && (
            <div className="flex items-center justify-self-end gap-1">
              <ThemePicker />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account menu">
                    <User className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
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
