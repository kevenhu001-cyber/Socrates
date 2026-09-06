/* Local brand marks for every connector surface (plugin directory,
 * composer plugin menu/chips, slash palette, legacy connector panel).
 *
 * Every mark is a real vendor brand SVG bundled at build time — no remote
 * favicon/image CDNs (icon.horse / simpleicons / raw.githubusercontent),
 * which can hang on mobile networks (especially in CN) and stall page
 * switches. Sources per mark:
 *   - Simple Icons (CC0, simpleicons.org): gmail, googledrive,
 *     googlecalendar, todoist, ticktick, discord, gitlab, zotero, gitee,
 *     arxiv, qq (used for QQ Mail)
 *   - ByteDance Semi Design (MIT, github.com/DouyinFE/semi-design): feishu
 *   - Wikimedia Commons (official Microsoft Outlook 2018–2024 mark): outlook
 *   - gilbarbara/logos (brand-logo collection): onedrive
 *   - LobeHub static icons (already vendored via node_modules): github,
 *     notion, baiducloud (Baidu Netdisk), tencent-color (Tencent Docs),
 *     microsoft-color + google-color (generic fallbacks)
 * See frontend/src/assets/connector-icons/ for the vendored files; their
 * first-line provenance is recorded in ATTRIBUTION.md next to them.
 */
import githubRaw from '@lobehub/icons-static-svg/icons/github.svg?raw';
import notionRaw from '@lobehub/icons-static-svg/icons/notion.svg?raw';
import baiduCloudRaw from '@lobehub/icons-static-svg/icons/baiducloud.svg?raw';
import tencentRaw from '@lobehub/icons-static-svg/icons/tencent-color.svg?raw';
import microsoftRaw from '@lobehub/icons-static-svg/icons/microsoft-color.svg?raw';
import googleRaw from '@lobehub/icons-static-svg/icons/google-color.svg?raw';
import gmailRaw from './assets/connector-icons/gmail.svg?raw';
import googledriveRaw from './assets/connector-icons/googledrive.svg?raw';
import googlecalendarRaw from './assets/connector-icons/googlecalendar.svg?raw';
import todoistRaw from './assets/connector-icons/todoist.svg?raw';
import ticktickRaw from './assets/connector-icons/ticktick.svg?raw';
import discordRaw from './assets/connector-icons/discord.svg?raw';
import gitlabRaw from './assets/connector-icons/gitlab.svg?raw';
import zoteroRaw from './assets/connector-icons/zotero.svg?raw';
import giteeRaw from './assets/connector-icons/gitee.svg?raw';
import arxivRaw from './assets/connector-icons/arxiv.svg?raw';
import qqmailRaw from './assets/connector-icons/qqmail.svg?raw';
import feishuRaw from './assets/connector-icons/feishu.svg?raw';
import outlookRaw from './assets/connector-icons/outlook.svg?raw';
import onedriveRaw from './assets/connector-icons/onedrive.svg?raw';

/* Normalise every sizing/namespace quirk to one contract: the host CSS
 * sizes the <svg> (plugin rows 26px, composer chips 16px) and the mark
 * keeps its own brand fill. <title> is dropped because every host already
 * labels the icon via adjacent text / aria-label. */
function cleanIcon(raw: string): string {
  return String(raw || '')
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s(?:width|height)="[^"]*"/gi, '')
    .replace(/\sstyle="[^"]*"/i, '')
    .replace(/\sxmlns(?::\w+)?="[^"]*"/gi, '')
    .replace(/<svg /i, '<svg aria-hidden="true" ');
}

const GITHUB = cleanIcon(githubRaw);
const NOTION = cleanIcon(notionRaw);
const BAIDU = cleanIcon(baiduCloudRaw);
const TENCENT = cleanIcon(tencentRaw);
const MICROSOFT = cleanIcon(microsoftRaw);
const GOOGLE = cleanIcon(googleRaw);

/* Keys are normalised connector ids (lowercase, no _/-). Aliases cover the
 * legacy /plugins panel ids and vendor-name lookups. */
const MARKS: Record<string, string> = {
  github: GITHUB,
  notion: NOTION,
  gitee: cleanIcon(giteeRaw),
  gmail: cleanIcon(gmailRaw),
  googledrive: cleanIcon(googledriveRaw),
  googlecalendar: cleanIcon(googlecalendarRaw),
  google: GOOGLE,
  todoist: cleanIcon(todoistRaw),
  ticktick: cleanIcon(ticktickRaw),
  discord: cleanIcon(discordRaw),
  gitlab: cleanIcon(gitlabRaw),
  zotero: cleanIcon(zoteroRaw),
  arxiv: cleanIcon(arxivRaw),
  feishu: cleanIcon(feishuRaw),
  lark: cleanIcon(feishuRaw),
  onedrive: cleanIcon(onedriveRaw),
  outlook: cleanIcon(outlookRaw),
  microsoft: MICROSOFT,
  tencentdocs: TENCENT,
  tencent: TENCENT,
  qqmail: cleanIcon(qqmailRaw),
  qq: cleanIcon(qqmailRaw),
  baidunetdisk: BAIDU,
  baiducloud: BAIDU,
  baidu: BAIDU,
};

export function normaliseConnectorId(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[_-]/g, '');
}

/* Inline-SVG markup for a connector, or '' when the connector has no
 * bundled mark. Callers render their own monogram fallback on ''. */
export function getConnectorIconMarkup(id: unknown): string {
  const key = normaliseConnectorId(id);
  if (!key) return '';
  return MARKS[key] || MARKS[String(id || '').toLowerCase()] || '';
}

/* Ids with a bundled real brand mark (useful for tests / diagnostics). */
export function connectorIconIds(): ReadonlyArray<string> {
  return Object.freeze(Object.keys(MARKS));
}
