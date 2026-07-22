import type { ProviderDefinition } from "../../core/types.ts";

import { discordActions } from "./actions.ts";

const discordScopes = [
  "identify",
  "email",
  "guilds",
  "guilds.members.read",
  "connections",
  "applications.entitlements",
  "role_connections.write",
  "openid",
];

export const provider: ProviderDefinition = {
  service: "discord",
  displayName: "Discord",
  categories: ["Communication", "Social"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://discord.com/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
      scopes: discordScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://discord.com",
  iconUrl: "https://discord.com/assets/847ad504c8b2169d0f08f17ac88b0e44.svg",
  actions: discordActions,
};
