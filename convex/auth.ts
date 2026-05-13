import type { QueryCtx } from "./_generated/server";

// Resolves the Convex user record for the currently authenticated WorkOS identity.
// Returns null when there is no identity or no matching user.
export async function getUserFromIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_workos_id", (q) => q.eq("workosUserId", identity.subject))
    .unique();
}
