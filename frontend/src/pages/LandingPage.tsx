import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@workos-inc/authkit-react";
import { BookOpen, ShieldCheck, Tag, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: BookOpen,
    title: "Organize collections",
    description: "Create collections for any hobby — coins, stamps, cards, books, and more.",
  },
  {
    icon: Tag,
    title: "Rich metadata",
    description: "Custom fields per collection type, tags, categories, and acquisition details.",
  },
  {
    icon: TrendingUp,
    title: "Track value",
    description: "Log purchased and market values to know your collection's total worth.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    description: "Your data is encrypted in your browser before it reaches our servers. We can't see your collection. Only you can.",
  },
];

export function LandingPage() {
  const { user, signIn, signUp, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/dashboard");
    }
  }, [isLoading, user, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <BookOpen className="size-5" />
            CollectionGeek
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => signIn()}>
              Sign in
            </Button>
            <Button size="sm" onClick={() => signUp()}>
              Get started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-5xl flex-col items-center px-4 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Your collections,
          <br />
          beautifully cataloged
        </h1>
        <p className="mt-4 max-w-lg text-lg text-muted-foreground">
          CollectionGeek helps hobbyists and professionals catalog, organize, and
          track the value of everything they collect.
        </p>
        <div className="mt-8 flex gap-3">
          <Button size="lg" onClick={() => signUp()}>
            Get started
          </Button>
          <Button size="lg" variant="outline" onClick={() => signIn()}>
            Sign in
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border p-6 space-y-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-5" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-sm text-muted-foreground">
          CollectionGeek — catalog everything you love
        </div>
      </footer>
    </div>
  );
}
