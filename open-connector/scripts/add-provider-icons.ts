/* scripts/add-provider-icons.ts
 *
 * One-shot script that walks every provider definition file and writes
 * an `iconUrl` field into the ProviderDefinition when one isn't already
 * set.
 *
 * Strategy (per AGENTS.md "Prefer linking to official public assets
 * instead of copying brand files into this repository"):
 *
 *   1. Curated overrides — a small hand-verified map of the most-used
 *      providers to their official brand-asset URL. These come first
 *      because the runtime's icon picker prefers `provider.iconUrl`
 *      over the favicon fallback.
 *
 *   2. homepageUrl + favicon.ico — for the rest, point at
 *      `${homepageUrl}/favicon.ico`. The web console already falls back
 *      to letters if the image fails to load, so a wrong URL is
 *      non-fatal (just looks like the old behavior).
 *
 *   3. Skip when the provider already declares iconUrl, has no
 *      homepageUrl, or already supplies a brand color class through
 *      resolveProviderIconClass.
 *
 * The script is idempotent: re-running it changes only the providers
 * that don't yet have iconUrl and that don't have a curated override
 * conflict (curated wins).
 *
 * Usage: `node scripts/add-provider-icons.ts` (Node 22+ runs the TS
 * natively; no tsx or strip-types flag needed).
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/* P_brand_overrides — hand-verified, official public brand-asset URLs.
 * Add new entries here when you want a curated provider to win over the
 * generic favicon fallback. Keys are `service` ids from each
 * definition.ts. Values must resolve over plain HTTPS (the runtime
 * fetches them with the global `<img src=...>` tag in the web console).
 *
 * Sources: each provider's own `brand` / `press` / `marketing` CDN path
 * or their static asset domain. We link, we don't copy. */
const CURATED: Record<string, string> = {
  // ── Frontier-model labs (high-traffic, hand-picked for correctness) ──
  anthropic: "https://www.anthropic.com/images/icons/apple-touch-icon.png",
  openai: "https://openai.com/favicon.ico",
  deepseek: "https://www.deepseek.com/favicon.ico",
  x_ai: "https://x.ai/favicon.ico",
  minimax: "https://minimax.io/favicon.ico",
  minimax_voice: "https://minimax.io/favicon.ico",
  mistral_ai: "https://mistral.ai/favicon.ico",
  groqcloud: "https://groq.com/favicon.ico",
  cohere: "https://cohere.com/favicon.ico",
  perplexity: "https://www.perplexity.ai/favicon.ico",
  together_ai: "https://www.together.ai/favicon.ico",
  fireworks: "https://fireworks.ai/favicon.ico",
  replicate: "https://replicate.com/favicon.ico",
  huggingface: "https://huggingface.co/front/assets/huggingface_logo-noborder.svg",
  stabilityai: "https://stability.ai/favicon.ico",

  // ── Dev tools ──
  github: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  gitlab: "https://about.gitlab.com/images/press/logo/svg/gitlab-icon-rgb.svg",
  gitee: "https://gitee.com/favicon.ico",
  bitbucket: "https://wac-cdn.atlassian.com/assets/img/favicons/bitbucket/favicon.png",
  jira: "https://wac-cdn.atlassian.com/assets/img/favicons/jira/favicon.png",
  linear: "https://linear.app/favicon.ico",
  notion: "https://www.notion.so/images/logo-ios.png",
  slack: "https://a.slack-edge.com/80588/marketing/img/meta/slack_hash_256.png",
  discord: "https://discord.com/assets/847ad504c8b2169d0f08f17ac88b0e44.svg",
  trello: "https://trello.com/favicon.ico",
  asana: "https://asana.com/favicon.ico",
  monday: "https://cdn.monday.com/images/logos/monday_logo_icon.png",

  // ── Productivity / collaboration ──
  gmail: "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",
  outlook: "https://outlook.live.com/favicon.ico",
  googlecalendar: "https://calendar.google.com/favicon.ico",
  googledrive: "https://drive.google.com/favicon.ico",
  googledocs: "https://docs.google.com/favicon.ico",
  googlesheets: "https://sheets.google.com/favicon.ico",
  googleslides: "https://slides.google.com/favicon.ico",
  googleforms: "https://docs.google.com/favicon.ico",
  googletasks: "https://tasks.google.com/favicon.ico",
  dropbox: "https://www.dropbox.com/favicon.ico",
  onedrive: "https://onedrive.live.com/favicon.ico",

  // ── Cloud / data ──
  aws_s3: "https://a0.awsstatic.com/libra-css/images/logos/aws_logo_smile_1200x630.png",
  googlecloud: "https://cloud.google.com/favicon.ico",
  digital_ocean: "https://www.digitalocean.com/favicon.ico",
  supabase: "https://supabase.com/brand-assets/supabase-logo-icon.png",
  vercel: "https://assets.vercel.com/image/upload/front/favicon/vercel/favicon.ico",
  netlify: "https://www.netlify.com/favicon.ico",
  fly: "https://fly.io/static/images/brand/fly-logo-2019.png",
  heroku: "https://www.heroku.com/favicon.ico",
  cloudflare_browser_rendering: "https://www.cloudflare.com/favicon.ico",
  cloudflare_r2: "https://www.cloudflare.com/favicon.ico",
  cloudflare_dns: "https://www.cloudflare.com/favicon.ico",
  cloudflare_email_routing: "https://www.cloudflare.com/favicon.ico",

  // ── Frontend / design ──
  figma: "https://static.figma.com/app/icon/1/icon-192.png",
  canva: "https://canva.com/favicon.ico",
  unsplash: "https://unsplash.com/favicon.ico",

  // ── Search / research ──
  arxiv: "https://arxiv.org/favicon.ico",
  brave_search: "https://brave.com/favicon.ico",
  exa: "https://exa.ai/favicon.ico",
  tavily: "https://tavily.com/favicon.ico",
  serpapi: "https://serpapi.com/favicon.ico",
  firecrawl: "https://www.firecrawl.dev/favicon.ico",

  // ── Communication / notifications ──
  telegram: "https://telegram.org/favicon.ico",
  twilio: "https://www.twilio.com/favicon.ico",
  sendgrid: "https://sendgrid.com/favicon.ico",
  mailchimp: "https://mailchimp.com/favicon.ico",
  whatsapp: "https://static.whatsapp.net/rsrc.php/yc/r/logos/whatsapp-icon.svg",
};

/* P_skip_existing — providers whose icon is already resolved through
 * resolveProviderIconClass (Google-specific service icons etc.). No
 * point overriding them with a homepageUrl favicon. */
const SKIP_SERVICES = new Set<string>([
  "google_address_validation",
  "googleads",
  "google_analytics",
  "google_bigquery",
  "google_routes",
  "google_search_console",
]);

const PROVIDERS_DIR = join(process.cwd(), "src/providers");

/* Crude TypeScript extraction — avoid pulling in a TS compiler just to
 * read one field. The definition.ts files follow a stable shape:
 *   export const provider: ProviderDefinition = {
 *     service: "...",
 *     ...
 *     homepageUrl: "https://...",
 *     ...
 *   };
 * so a regex sweep is enough. */
function extractField(src: string, field: string): string | undefined {
  const re = new RegExp(`^\\s*${field}:\\s*("([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"|'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)')`, "m");
  const m = src.match(re);
  if (!m) return undefined;
  return (m[2] ?? m[3] ?? "").replace(/\\(.)/g, "$1");
}

function alreadyHasIconUrl(src: string): boolean {
  return /^\s*iconUrl\s*:/m.test(src);
}

async function listProviders(): Promise<string[]> {
  const entries = await readdir(PROVIDERS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function addIconToProvider(service: string): Promise<"wrote" | "skipped" | "noop"> {
  const defPath = join(PROVIDERS_DIR, service, "definition.ts");
  const src = await readFile(defPath, "utf8");

  if (alreadyHasIconUrl(src)) return "skipped";
  if (SKIP_SERVICES.has(service)) return "skipped";

  const curated = CURATED[service];
  let iconUrl: string | undefined = curated;
  if (!iconUrl) {
    const homepage = extractField(src, "homepageUrl");
    if (!homepage) return "noop";
    try {
      // Strip trailing slash so homepageUrl + "/favicon.ico" stays a
      // single host. Use URL constructor only to validate the input.
      const u = new URL(homepage);
      iconUrl = `${u.protocol}//${u.host}/favicon.ico`;
    } catch {
      return "noop";
    }
  }

  // Insert iconUrl immediately after `homepageUrl:` so the field
  // ordering stays natural. If homepageUrl isn't set (curated-only
  // case), insert right before `actions:`.
  let updated: string;
  if (/^\s*homepageUrl\s*:/m.test(src)) {
    updated = src.replace(/^(\s*homepageUrl:\s*"[^"]*",\s*)$/m, `$1\n  iconUrl: "${iconUrl}",`);
  } else {
    updated = src.replace(/^(\s*)(actions:\s*)/m, `$1  iconUrl: "${iconUrl}",\n$1$2`);
  }

  if (updated === src) return "noop";
  await writeFile(defPath, updated, "utf8");
  return "wrote";
}

async function main(): Promise<void> {
  const services = (await listProviders()).sort();
  let wrote = 0;
  let skipped = 0;
  let noop = 0;
  for (const service of services) {
    try {
      const r = await addIconToProvider(service);
      if (r === "wrote") wrote++;
      else if (r === "skipped") skipped++;
      else noop++;
    } catch (err) {
      console.warn(`[skip] ${service}: ${(err as Error).message}`);
    }
  }
  console.log(
    `providers: ${services.length}, wrote iconUrl: ${wrote}, already-set: ${skipped}, no homepageUrl: ${noop}`,
  );
}

await main();
