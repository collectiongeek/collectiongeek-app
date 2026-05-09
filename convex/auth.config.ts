// Convex validates WorkOS JWTs automatically using this config.
// WORKOS_CLIENT_ID must be set via: npx convex env set WORKOS_CLIENT_ID "client_..."
export default {
  providers: [
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${process.env.WORKOS_CLIENT_ID}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${process.env.WORKOS_CLIENT_ID}`,
    },
  ],
};
