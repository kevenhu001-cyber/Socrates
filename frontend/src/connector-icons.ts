/* Local brand marks for every connector surface (plugin directory,
 * composer plugin menu/chips, slash palette, legacy connector panel).
 *
 * Every mark is a real vendor brand SVG bundled at build time — no remote
 * favicon/image CDNs (icon.horse / simpleicons / raw.githubusercontent),
 * which can hang on mobile networks (especially in CN) and stall page
 * switches. Sources per mark:
 *   - Simple Icons (CC0, simpleicons.org): gmail, googledrive,
 *     googlecalendar, todoist, ticktick, discord, gitlab, zotero, gitee,
 *     arxiv, qq (used for QQ Mail); v11.15.0 additionally supplies
 *     telegram, slack, twilio, circle, cloudflare, airtable, trello,
 *     asana, jira, linear, clickup, 1password, zendesk, intercom, agora,
 *     aircall, bluesky, discourse, deepgram, airbrake, whatsapp, baidu
 *     (used for 百度地图), zhihu, mcdonalds (used for 麦当劳中国)
 *   - gilbarbara/logos (brand-logo collection): onedrive, sendgrid,
 *     monday, frontapp
 *   - Official site assets: ima (Tencent ima.copilot favicon), yuandian
 *     (华宇元典 favicon)
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
import anthropicLobeRaw from '@lobehub/icons-static-svg/icons/anthropic.svg?raw';
import elevenlabsLobeRaw from '@lobehub/icons-static-svg/icons/elevenlabs.svg?raw';
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
import telegramRaw from './assets/connector-icons/telegram.svg?raw';
import slackRaw from './assets/connector-icons/slack.svg?raw';
import twilioRaw from './assets/connector-icons/twilio.svg?raw';
import circleRaw from './assets/connector-icons/circle.svg?raw';
import cloudflareRaw from './assets/connector-icons/cloudflare.svg?raw';
import airtableRaw from './assets/connector-icons/airtable.svg?raw';
import trelloRaw from './assets/connector-icons/trello.svg?raw';
import asanaRaw from './assets/connector-icons/asana.svg?raw';
import jiraRaw from './assets/connector-icons/jira.svg?raw';
import linearRaw from './assets/connector-icons/linear.svg?raw';
import clickupRaw from './assets/connector-icons/clickup.svg?raw';
import onepasswordRaw from './assets/connector-icons/onepassword.svg?raw';
import zendeskRaw from './assets/connector-icons/zendesk.svg?raw';
import intercomRaw from './assets/connector-icons/intercom.svg?raw';
import agoraRaw from './assets/connector-icons/agora.svg?raw';
import aircallRaw from './assets/connector-icons/aircall.svg?raw';
import blueskyRaw from './assets/connector-icons/bluesky.svg?raw';
import discourseRaw from './assets/connector-icons/discourse.svg?raw';
import deepgramRaw from './assets/connector-icons/deepgram.svg?raw';
import airbrakeRaw from './assets/connector-icons/airbrake.svg?raw';
import whatsappRaw from './assets/connector-icons/whatsapp.svg?raw';
import baiduRaw from './assets/connector-icons/baidu.svg?raw';
import zhihuRaw from './assets/connector-icons/zhihu.svg?raw';
import mcdonaldsRaw from './assets/connector-icons/mcdonalds.svg?raw';
import sendgridRaw from './assets/connector-icons/sendgrid.svg?raw';
import mondayRaw from './assets/connector-icons/monday.svg?raw';
import frontappRaw from './assets/connector-icons/frontapp.svg?raw';
import imaRaw from './assets/connector-icons/ima.svg?raw';
import yuandianRaw from './assets/connector-icons/yuandian.svg?raw';

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
  baidumaps: cleanIcon(baiduRaw),
  telegram: cleanIcon(telegramRaw),
  telegrambot: cleanIcon(telegramRaw),
  slack: cleanIcon(slackRaw),
  twilio: cleanIcon(twilioRaw),
  circle: cleanIcon(circleRaw),
  cloudflare: cleanIcon(cloudflareRaw),
  cloudflareemailrouting: cleanIcon(cloudflareRaw),
  airtable: cleanIcon(airtableRaw),
  trello: cleanIcon(trelloRaw),
  asana: cleanIcon(asanaRaw),
  jira: cleanIcon(jiraRaw),
  linear: cleanIcon(linearRaw),
  clickup: cleanIcon(clickupRaw),
  onepassword: cleanIcon(onepasswordRaw),
  '1password': cleanIcon(onepasswordRaw),
  zendesk: cleanIcon(zendeskRaw),
  intercom: cleanIcon(intercomRaw),
  agora: cleanIcon(agoraRaw),
  aircall: cleanIcon(aircallRaw),
  bluesky: cleanIcon(blueskyRaw),
  discourse: cleanIcon(discourseRaw),
  deepgram: cleanIcon(deepgramRaw),
  airbrake: cleanIcon(airbrakeRaw),
  whatsapp: cleanIcon(whatsappRaw),
  chatapiforwhatsapp: cleanIcon(whatsappRaw),
  zhihu: cleanIcon(zhihuRaw),
  mcdonalds: cleanIcon(mcdonaldsRaw),
  mcdonaldscn: cleanIcon(mcdonaldsRaw),
  sendgrid: cleanIcon(sendgridRaw),
  monday: cleanIcon(mondayRaw),
  front: cleanIcon(frontappRaw),
  frontapp: cleanIcon(frontappRaw),
  ima: cleanIcon(imaRaw),
  yuandian: cleanIcon(yuandianRaw),
  discordbot: cleanIcon(discordRaw),
  feishuappbot: cleanIcon(feishuRaw),
  feishucustombot: cleanIcon(feishuRaw),
  anthropicadmin: cleanIcon(anthropicLobeRaw),
  elevenreader: cleanIcon(elevenlabsLobeRaw),
  /* Namespaced OpenConnector directory ids (oc_<service>) reuse the same
   * brand marks as their gateway twins. */
  ocgmail: cleanIcon(gmailRaw),
  ocgooglecalendar: cleanIcon(googlecalendarRaw),
  ocfeishu: cleanIcon(feishuRaw),
  ocdiscord: cleanIcon(discordRaw),
  octencentdocs: TENCENT,
  ocoutlook: cleanIcon(outlookRaw),
  ocqqmail: cleanIcon(qqmailRaw),
  octicktick: cleanIcon(ticktickRaw),
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
