/* Local brand marks for every connector surface (plugin directory,
 * composer plugin menu/chips, slash palette, legacy connector panel).
 *
 * Every mark is a real vendor brand SVG bundled at build time — no remote
 * favicon/image CDNs (icon.horse / simpleicons / raw.githubusercontent),
 * which can hang on mobile networks (especially in CN) and stall page
 * switches. Sources per mark:
 *   - OOMOL static third-party set (static.oomol.com/logo/third-party,
 *     vendor-supplied, used nominatively): most OpenConnector services
 *   - Wikimedia Commons (official vendor uploads, PD-textlogo/trademark):
 *     gmail, googlecalendar, discord, telegram, airtable, asana, jira,
 *     bluesky, cloudflare, openai, gemini, deepseek, perplexity,
 *     elevenlabs, zendesk, mcdonalds, linear, pipedrive
 *   - Official vendor brand/press pages: clicksend, front, freshdesk,
 *     apipie_ai, agenty, airbrake, chatbotkit, diffbot, emailable,
 *     emailoctopus, emaillistverify, encharge, deck_co, dingtalk_bot,
 *     wecom_bot, netease_mail, qq_mail, gitlab, googledrive (gilbarbara)
 *   - LobeHub static icons (MIT, already a dependency): github, notion,
 *     baiducloud, tencent-color, microsoft-color, google-color,
 *     anthropic, elevenlabs(fallback), baidu-color, jimeng-color
 *   - ByteDance Semi Design (MIT): feishu
 *   - Official site assets: ima (Tencent), yuandian (华宇元典)
 *   - Official vendor PNGs (favicon / apple-touch-icon / header logo,
 *     all bundled locally, no runtime fetch): 7_shifts, accredible,
 *     agiled, anysearch, agentql, aivoov, bark, beamer, bird, browse_ai,
 *     campaign_cleaner, chatwork, data247, detect_language, eagle_doc,
 *     edenai, godial, twochat — long-tail services with no public SVG.
 * See frontend/src/assets/connector-icons/ATTRIBUTION.md for the
 * per-file source + license table.
 */
import notionRaw from '@lobehub/icons-static-svg/icons/notion.svg?raw';
import baiduCloudRaw from '@lobehub/icons-static-svg/icons/baiducloud.svg?raw';
import tencentRaw from '@lobehub/icons-static-svg/icons/tencent-color.svg?raw';
import googleRaw from '@lobehub/icons-static-svg/icons/google-color.svg?raw';
import acculynxRaw from './assets/connector-icons/acculynx.svg?raw';
import affindaRaw from './assets/connector-icons/affinda.svg?raw';
import affinityRaw from './assets/connector-icons/affinity.svg?raw';
import agentMailRaw from './assets/connector-icons/agent_mail.svg?raw';
import agentyRaw from './assets/connector-icons/agenty.svg?raw';
import agoraRaw from './assets/connector-icons/agora.svg?raw';
import airbrakeRaw from './assets/connector-icons/airbrake.svg?raw';
import aircallRaw from './assets/connector-icons/aircall.svg?raw';
import airtableRaw from './assets/connector-icons/airtable.svg?raw';
import altTextAiRaw from './assets/connector-icons/alt_text_ai.svg?raw';
import amapRaw from './assets/connector-icons/amap.svg?raw';
import anchorBrowserRaw from './assets/connector-icons/anchor_browser.svg?raw';
import anthropicRaw from './assets/connector-icons/anthropic.svg?raw';
import anthropicAdminRaw from './assets/connector-icons/anthropic_admin.svg?raw';
import apipieAiRaw from './assets/connector-icons/apipie_ai.svg?raw';
import arxivRaw from './assets/connector-icons/arxiv.svg?raw';
import asanaRaw from './assets/connector-icons/asana.svg?raw';
import assemblyaiRaw from './assets/connector-icons/assemblyai.svg?raw';
import atlasSoRaw from './assets/connector-icons/atlas_so.svg?raw';
import baiduMapsRaw from './assets/connector-icons/baidu_maps.svg?raw';
import blueskyRaw from './assets/connector-icons/bluesky.svg?raw';
import botpressRaw from './assets/connector-icons/botpress.svg?raw';
import botsonicRaw from './assets/connector-icons/botsonic.svg?raw';
import callerapiRaw from './assets/connector-icons/callerapi.svg?raw';
import callinglyRaw from './assets/connector-icons/callingly.svg?raw';
import callpageRaw from './assets/connector-icons/callpage.svg?raw';
import chatbotkitRaw from './assets/connector-icons/chatbotkit.svg?raw';
import chatpdfRaw from './assets/connector-icons/chatpdf.svg?raw';
import chorusRaw from './assets/connector-icons/chorus.svg?raw';
import circleRaw from './assets/connector-icons/circle.svg?raw';
import claidAiRaw from './assets/connector-icons/claid_ai.svg?raw';
import clickmeetingRaw from './assets/connector-icons/clickmeeting.svg?raw';
import clicksendRaw from './assets/connector-icons/clicksend.svg?raw';
import clickupRaw from './assets/connector-icons/clickup.svg?raw';
import cloudflareRaw from './assets/connector-icons/cloudflare.svg?raw';
import cloudflareEmailRoutingRaw from './assets/connector-icons/cloudflare_email_routing.svg?raw';
import codegenRaw from './assets/connector-icons/codegen.svg?raw';
import cohereRaw from './assets/connector-icons/cohere.svg?raw';
import context7Raw from './assets/connector-icons/context7.svg?raw';
import courierRaw from './assets/connector-icons/courier.svg?raw';
import crispRaw from './assets/connector-icons/crisp.svg?raw';
import cursorRaw from './assets/connector-icons/cursor.svg?raw';
import customgptRaw from './assets/connector-icons/customgpt.svg?raw';
import dailybotRaw from './assets/connector-icons/dailybot.svg?raw';
import deckCoRaw from './assets/connector-icons/deck_co.svg?raw';
import deepgramRaw from './assets/connector-icons/deepgram.svg?raw';
import deeplRaw from './assets/connector-icons/deepl.svg?raw';
import deepseekRaw from './assets/connector-icons/deepseek.svg?raw';
import devinRaw from './assets/connector-icons/devin.svg?raw';
import diffbotRaw from './assets/connector-icons/diffbot.svg?raw';
import dingtalkBotRaw from './assets/connector-icons/dingtalk_bot.svg?raw';
import discordRaw from './assets/connector-icons/discord.svg?raw';
import discourseRaw from './assets/connector-icons/discourse.svg?raw';
import dixaRaw from './assets/connector-icons/dixa.svg?raw';
import docsbotAiRaw from './assets/connector-icons/docsbot_ai.svg?raw';
import docsumoRaw from './assets/connector-icons/docsumo.svg?raw';
import e2bRaw from './assets/connector-icons/e2b.svg?raw';
import elevenlabsRaw from './assets/connector-icons/elevenlabs.svg?raw';
import emailableRaw from './assets/connector-icons/emailable.svg?raw';
import emaillistverifyRaw from './assets/connector-icons/emaillistverify.svg?raw';
import emailoctopusRaw from './assets/connector-icons/emailoctopus.svg?raw';
import enchargeRaw from './assets/connector-icons/encharge.svg?raw';
import feishuRaw from './assets/connector-icons/feishu.svg?raw';
import feishuCustomBotRaw from './assets/connector-icons/feishu_custom_bot.svg?raw';
import freshdeskRaw from './assets/connector-icons/freshdesk.svg?raw';
import freshserviceRaw from './assets/connector-icons/freshservice.svg?raw';
import frontappRaw from './assets/connector-icons/frontapp.svg?raw';
import geminiRaw from './assets/connector-icons/gemini.svg?raw';
import giteeRaw from './assets/connector-icons/gitee.svg?raw';
import gitlabRaw from './assets/connector-icons/gitlab.svg?raw';
import gleapRaw from './assets/connector-icons/gleap.svg?raw';
import googlecalendarRaw from './assets/connector-icons/googlecalendar.svg?raw';
import imaRaw from './assets/connector-icons/ima.svg?raw';
import intercomRaw from './assets/connector-icons/intercom.svg?raw';
import jimengAiRaw from './assets/connector-icons/jimeng_ai.svg?raw';
import jiraRaw from './assets/connector-icons/jira.svg?raw';
import linearRaw from './assets/connector-icons/linear.svg?raw';
import lingvanexTranslationApiRaw from './assets/connector-icons/lingvanex_translation_api.svg?raw';
import luckinCoffeeRaw from './assets/connector-icons/luckin_coffee.svg?raw';
import mcdonaldsRaw from './assets/connector-icons/mcdonalds.svg?raw';
import mcdonaldsCnRaw from './assets/connector-icons/mcdonalds_cn.svg?raw';
import mondayRaw from './assets/connector-icons/monday.svg?raw';
import neteaseMailRaw from './assets/connector-icons/netease_mail.svg?raw';
import onedriveRaw from './assets/connector-icons/onedrive.svg?raw';
import onepasswordRaw from './assets/connector-icons/onepassword.svg?raw';
import openaiRaw from './assets/connector-icons/openai.svg?raw';
import outlookRaw from './assets/connector-icons/outlook.svg?raw';
import perplexityRaw from './assets/connector-icons/perplexity.svg?raw';
import pipedriveRaw from './assets/connector-icons/pipedrive.svg?raw';
import qianfanRaw from './assets/connector-icons/qianfan.svg?raw';
import qqMailRaw from './assets/connector-icons/qq_mail.svg?raw';
import qqmailRaw from './assets/connector-icons/qqmail.svg?raw';
import sendgridRaw from './assets/connector-icons/sendgrid.svg?raw';
import slackRaw from './assets/connector-icons/slack.svg?raw';
import telegramRaw from './assets/connector-icons/telegram.svg?raw';
import tencentDocsRaw from './assets/connector-icons/tencent_docs.svg?raw';
import ticktickRaw from './assets/connector-icons/ticktick.svg?raw';
import todoistRaw from './assets/connector-icons/todoist.svg?raw';
import toriiRaw from './assets/connector-icons/torii.svg?raw';
import trelloRaw from './assets/connector-icons/trello.svg?raw';
import twilioRaw from './assets/connector-icons/twilio.svg?raw';
import wecomBotRaw from './assets/connector-icons/wecom_bot.svg?raw';
import whatsappRaw from './assets/connector-icons/whatsapp.svg?raw';
import yuandianRaw from './assets/connector-icons/yuandian.svg?raw';
import zendeskRaw from './assets/connector-icons/zendesk.svg?raw';
import zhihuRaw from './assets/connector-icons/zhihu.svg?raw';
import zoteroRaw from './assets/connector-icons/zotero.svg?raw';

/* Long-tail PNG brand marks (official favicon / apple-touch-icon / header
 * logo, bundled locally). Vite emits these as hashed asset URLs. */
import sevenShiftsPng from './assets/connector-icons/7_shifts.png';
import accrediblePng from './assets/connector-icons/accredible_certificates.png';
import agiledPng from './assets/connector-icons/agiled.png';
import anysearchPng from './assets/connector-icons/anysearch.png';
import agentqlPng from './assets/connector-icons/agentql.png';
import aivoovPng from './assets/connector-icons/aivoov.png';
import barkPng from './assets/connector-icons/bark.png';
import beamerPng from './assets/connector-icons/beamer.png';
import birdPng from './assets/connector-icons/bird.png';
import browseAiPng from './assets/connector-icons/browse_ai.png';
import campaignCleanerPng from './assets/connector-icons/campaign_cleaner.png';
import chatworkPng from './assets/connector-icons/chatwork.png';
import data247Png from './assets/connector-icons/data247.png';
import detectLanguagePng from './assets/connector-icons/detect_language.png';
import eagleDocPng from './assets/connector-icons/eagle_doc.png';
import edenAiPng from './assets/connector-icons/edenai.png';
import godialPng from './assets/connector-icons/godial.png';
import twochatPng from './assets/connector-icons/twochat.png';

/* Normalise every sizing/namespace quirk to one contract: the host CSS
 * sizes the <svg> (plugin rows 26px, composer chips 16px) and the mark
 * keeps its own brand fill. <title> is dropped because every host already
 * labels the icon via adjacent text / aria-label.
 *
 * Two innerHTML hazards are neutralised here, because every mark is injected
 * via dangerouslySetInnerHTML next to 100+ sibling marks on one page:
 *   - `clip-path="url(#…)"` attributes are dropped. Forward-referenced
 *     clipPaths in innerHTML-inserted SVG render blank in Chromium; host
 *     tiles already clip via border-radius + overflow:hidden, so nothing
 *     is lost at 16–38px.
 *   - Remaining `id="…"` / `url(#…)` / `href="#…"` references (gradients,
 *     filters, masks) are namespaced per call, so duplicate ids across
 *     vendor files can never cross-resolve (wrong gradient / wrong clip). */
let __iconUid = 0;
function cleanIcon(raw: string): string {
  const ns = 'ci' + (++__iconUid) + '_';
  const namespaced = String(raw || '')
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/\sclip-path="url\(#[^"]*\)"/gi, '')
    .replace(/\sxmlns(?::\w+)?="[^"]*"/gi, '')
    .replace(/\bid="([^"]+)"/g, `id="${ns}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${ns}$1)`)
    .replace(/(href|aria-labelledby|aria-describedby)="#([^"]+)"/g, `$1="#${ns}$2"`);

  if (/<rect[^>]+width="(?:24|100%)"/i.test(namespaced)) {
    const rootStripped = namespaced.replace(/<svg[^>]*>/i, (tag) =>
      tag.replace(/\swidth="[^"]*"/gi, '').replace(/\sheight="[^"]*"/gi, '').replace(/\sstyle="[^"]*"/i, ''),
    );
    return rootStripped.replace(/<svg /i, '<svg aria-hidden="true" ');
  }

  let minX = 0;
  let minY = 0;
  let width = 24;
  let height = 24;
  const vbMatch = namespaced.match(/viewBox=["']\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)["']/i);
  if (vbMatch) {
    minX = parseFloat(vbMatch[1]);
    minY = parseFloat(vbMatch[2]);
    width = parseFloat(vbMatch[3]);
    height = parseFloat(vbMatch[4]);
  } else {
    const wMatch = namespaced.match(/width=["']([-\d.]+)["']/i);
    const hMatch = namespaced.match(/height=["']([-\d.]+)["']/i);
    if (wMatch && hMatch) {
      width = parseFloat(wMatch[1]);
      height = parseFloat(hMatch[1]);
    }
  }

  let defs = '';
  const defsMatch = namespaced.match(/<defs[\s\S]*?<\/defs>/i);
  if (defsMatch) {
    defs = defsMatch[0];
  }

  const inner = namespaced
    .replace(/<svg[^>]*>/i, '')
    .replace(/<\/svg>/i, '')
    .replace(/<defs[\s\S]*?<\/defs>/gi, '')
    .trim();

  const target = 14.4;
  const maxDim = Math.max(width, height) || 24;
  const scale = target / maxDim;
  const dx = +(12 - (width * scale) / 2 - minX * scale).toFixed(3);
  const dy = +(12 - (height * scale) / 2 - minY * scale).toFixed(3);
  const sStr = +scale.toFixed(4);

  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">${defs}<rect width="24" height="24" rx="6" fill="#212121"/><g fill="currentColor" transform="translate(${dx}, ${dy}) scale(${sStr})">${inner}</g></svg>`;
}

const GITHUB = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#212121"/><g transform="translate(4.8, 4.8) scale(0.6)"><path fill="#FFFFFF" fill-rule="evenodd" d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z"/></g></svg>');
const NOTION = cleanIcon(notionRaw);
const BAIDU = cleanIcon(baiduCloudRaw);
const TENCENT = cleanIcon(tencentRaw);
const MICROSOFT = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#212121"/><rect x="4.2" y="4.2" width="7.8" height="7.8" rx="2.5" fill="#258BF5"/><rect x="14.4" y="4.2" width="5.4" height="5.4" rx="1.8" fill="#1271D6"/><rect x="4.2" y="14.4" width="5.4" height="5.4" rx="1.8" fill="#1271D6"/><rect x="12" y="12" width="7.8" height="7.8" rx="2.5" fill="#50B5FF"/></svg>');
const GOOGLE = cleanIcon(googleRaw);
const SUPABASE = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="sb-grad" x1="53.97" y1="54.97" x2="94.16" y2="71.83" gradientUnits="userSpaceOnUse"><stop stop-color="#249361"/><stop offset="1" stop-color="#3ECF8E"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="#212121"/><g transform="translate(5, 4.6) scale(0.128)"><path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" fill="url(#sb-grad)"/><path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z" fill="#3ECF8E"/></g></svg>');
const HEALTH = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#212121"/><circle cx="15.6" cy="12.0" r="2.7" fill="#E52E2E"/><circle cx="14.55" cy="14.55" r="2.7" fill="#E52E2E"/><circle cx="12.0" cy="15.6" r="2.7" fill="#E52E2E"/><circle cx="9.45" cy="14.55" r="2.7" fill="#E52E2E"/><circle cx="8.4" cy="12.0" r="2.7" fill="#E52E2E"/><circle cx="9.45" cy="9.45" r="2.7" fill="#E52E2E"/><circle cx="12.0" cy="8.4" r="2.7" fill="#E52E2E"/><circle cx="14.55" cy="9.45" r="2.7" fill="#E52E2E"/><circle cx="12" cy="12" r="4.2" fill="#E52E2E"/><path d="M12 14.8l-.7-.6C8.8 12 7 10.4 7 8.5c0-1.5 1.2-2.7 2.7-2.7.9 0 1.7.4 2.3 1.1.6-.7 1.4-1.1 2.3-1.1 1.5 0 2.7 1.2 2.7 2.7 0 1.9-1.8 3.5-4.3 5.7l-.7.6z" fill="#FFFFFF"/></svg>');
const CALENDAR = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#212121"/><rect x="2.5" y="4" width="19" height="16" rx="3.5" fill="#E5E7EB"/><path d="M2.5 7.5C2.5 5.57 4.07 4 6 4h12c1.93 0 3.5 1.57 3.5 3.5V9h-19V7.5z" fill="#38BDF8"/><circle cx="5.8" cy="6.5" r="0.9" fill="#0284C7"/><circle cx="8.6" cy="6.5" r="0.9" fill="#0284C7"/><circle cx="11.4" cy="6.5" r="0.9" fill="#0284C7"/></svg>');
const BROWSER = CALENDAR;
const PALETTE = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="pal-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#C084FC"/><stop offset="100%" stop-color="#9333EA"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#pal-grad)"/><path d="M12 4.5C7.86 4.5 4.5 7.86 4.5 12c0 3.62 2.59 6.64 6.04 7.33.49.09.79-.31.79-.67 0-.3-.11-.81-.17-1.3-.16-1.37.89-2.5 2.27-2.5h1.39c2.59 0 4.69-2.1 4.69-4.69 0-4.14-3.36-7.67-7.51-7.67zm-4.22 8.44c-.78 0-1.41-.63-1.41-1.41s.63-1.41 1.41-1.41 1.41.63 1.41 1.41-.63 1.41-1.41 1.41zm1.88-3.75c-.78 0-1.41-.63-1.41-1.41s.63-1.41 1.41-1.41 1.41.63 1.41 1.41-.63 1.41-1.41 1.41zm4.69 0c-.78 0-1.41-.63-1.41-1.41s.63-1.41 1.41-1.41 1.41.63 1.41 1.41-.63 1.41-1.41 1.41zm2.34 3.75c-.78 0-1.41-.63-1.41-1.41s.63-1.41 1.41-1.41 1.41.63 1.41 1.41-.63 1.41-1.41 1.41z" fill="#FFFFFF"/></svg>');
const ZAPIER = PALETTE;
const CHART = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ch-bg" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#72BEFF"/><stop offset="50%" stop-color="#B4B2FF"/><stop offset="100%" stop-color="#F7C4E8"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ch-bg)"/><rect x="5.5" y="9.5" width="4" height="9.5" rx="1.5" fill="#FFFFFF" fill-opacity="0.9"/><rect x="9.8" y="5.5" width="4.4" height="13.5" rx="1.8" fill="#FFFFFF" fill-opacity="0.95"/><rect x="14.5" y="11.5" width="4" height="7.5" rx="1.5" fill="#FFFFFF" fill-opacity="0.9"/></svg>');
const THUMBSUP = CHART;
const WORKFLOW = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="wf-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#D946EF"/><stop offset="100%" stop-color="#9333EA"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#wf-grad)"/><circle cx="5" cy="8" r="1.5" stroke="#FFFFFF" stroke-width="1.6"/><circle cx="19" cy="8" r="1.5" stroke="#FFFFFF" stroke-width="1.6"/><line x1="6.8" y1="8" x2="9.5" y2="8" stroke="#FFFFFF" stroke-width="1.6"/><line x1="14.5" y1="8" x2="17.2" y2="8" stroke="#FFFFFF" stroke-width="1.6"/><rect x="9.5" y="6" width="5" height="5" rx="1.5" stroke="#FFFFFF" stroke-width="1.6"/><rect x="5" y="14" width="4.5" height="4.5" rx="1.5" stroke="#FFFFFF" stroke-width="1.6"/><rect x="14.5" y="14" width="4.5" height="4.5" rx="1.5" stroke="#FFFFFF" stroke-width="1.6"/><path d="M10.5 11c0 2-3 2-3 3" stroke="#FFFFFF" stroke-width="1.6" fill="none"/><path d="M13.5 11c0 2 3 2 3 3" stroke="#FFFFFF" stroke-width="1.6" fill="none"/></svg>');
const VERCEL = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#FFFFFF"/><polygon points="12 6.8 17.8 17.2 6.2 17.2" fill="#000000"/></svg>');
const GMAIL_OLED = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#212121"/><g transform="translate(5, 6.75) scale(0.159) translate(-52, -42)"><path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/><path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/><path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/><path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/><path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"/></g></svg>');
const GOOGLEDRIVE_OLED = cleanIcon('<svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#212121"/><g transform="translate(5, 5.75) scale(0.0547)"><path d="M19.3542312,196.033928 L30.644172,215.534816 C32.9900287,219.64014 36.3622164,222.86588 40.3210929,225.211737 C51.6602421,210.818376 59.5534225,199.772864 64.000634,192.075201 C68.5137119,184.263529 74.0609657,172.045039 80.6423954,155.41973 C62.9064315,153.085282 49.4659974,151.918058 40.3210929,151.918058 C31.545465,151.918058 18.1051007,153.085282 0,155.41973 C0,159.964996 1.17298825,164.510261 3.51893479,168.615586 L19.3542312,196.033928 Z" fill="#0066DA"/><path d="M215.681443,225.211737 C219.64032,222.86588 223.012507,219.64014 225.358364,215.534816 L230.050377,207.470615 L252.483511,168.615586 C254.829368,164.510261 256.002446,159.964996 256.002446,155.41973 C237.79254,153.085282 224.376613,151.918058 215.754667,151.918058 C206.488712,151.918058 193.072785,153.085282 175.506888,155.41973 C182.010479,172.136093 187.484394,184.354584 191.928633,192.075201 C196.412073,199.863919 204.329677,210.909431 215.681443,225.211737 Z" fill="#EA4335"/><path d="M128.001268,73.3111515 C141.121182,57.4655263 150.162898,45.2470011 155.126415,36.6555757 C159.123121,29.7376196 163.521739,18.6920726 168.322271,3.51893479 C164.363395,1.1729583 159.818129,0 155.126415,0 L100.876121,0 C96.1841079,0 91.638842,1.31958557 87.6799655,3.51893479 C93.7861943,20.9210065 98.9675428,33.3058067 103.224011,40.6733354 C107.927832,48.8151881 116.186918,59.6944602 128.001268,73.3111515 Z" fill="#00832D"/><path d="M175.360141,155.41973 L80.6420959,155.41973 L40.3210929,225.211737 C44.2799694,227.557893 48.8252352,228.730672 53.5172481,228.730672 L202.485288,228.730672 C207.177301,228.730672 211.722567,227.411146 215.681443,225.211737 L175.360141,155.41973 Z" fill="#2684FC"/><path d="M128.001268,73.3111515 L87.680265,3.51893479 C83.7213885,5.86488134 80.3489013,9.09044179 78.0030446,13.1960654 L3.51893479,142.223575 C1.17298825,146.329198 0,150.874464 0,155.41973 L80.6423954,155.41973 L128.001268,73.3111515 Z" fill="#00AC47"/><path d="M215.241501,77.7099697 L177.999492,13.1960654 C175.653635,9.09044179 172.281148,5.86488134 168.322271,3.51893479 L128.001268,73.3111515 L175.360141,155.41973 L255.855999,155.41973 C255.855999,150.874464 254.682921,146.329198 252.337064,142.223575 L215.241501,77.7099697 Z" fill="#FFBA00"/></g></svg>');

/* Raster twin of cleanIcon: wraps a bundled PNG URL in the same tile
 * contract (host CSS sizes `img.connector-logo` with object-fit). */
function pngIcon(src: string): string {
  const safe = String(src || '').replace(/"/g, '%22');
  return `<span class="connector-tile-base"><img class="connector-logo" src="${safe}" alt="" aria-hidden="true" loading="lazy" /></span>`;
}

/* Keys are normalised connector ids (lowercase, no _/-). Aliases cover the
 * legacy /plugins panel ids and vendor-name lookups. */
const MARKS: Record<string, string> = {
  github: GITHUB,
  notion: NOTION,
  supabase: SUPABASE,
  ocsupabase: SUPABASE,
  health: HEALTH,
  ochealth: HEALTH,
  calendar: CALENDAR,
  browser: BROWSER,
  window: BROWSER,
  palette: PALETTE,
  zapier: ZAPIER,
  chart: CHART,
  thumbsup: THUMBSUP,
  workflow: WORKFLOW,
  microsoft: MICROSOFT,
  vercel: VERCEL,
  gmail: GMAIL_OLED,
  ocgmail: GMAIL_OLED,
  googledrive: GOOGLEDRIVE_OLED,
  ocgoogledrive: GOOGLEDRIVE_OLED,
  gitee: cleanIcon(giteeRaw),
  todoist: cleanIcon(todoistRaw),
  gitlab: cleanIcon(gitlabRaw),
  zotero: cleanIcon(zoteroRaw),
  arxiv: cleanIcon(arxivRaw),
  lark: cleanIcon(feishuRaw),
  onedrive: cleanIcon(onedriveRaw),
  qq: cleanIcon(qqmailRaw),
  google: GOOGLE,
  tencent: TENCENT,
  baidunetdisk: BAIDU,
  baiducloud: BAIDU,
  baidu: BAIDU,
  discordbot: cleanIcon(discordRaw),
  ocdiscordbot: cleanIcon(discordRaw),
  feishuappbot: cleanIcon(feishuRaw),
  ocfeishuappbot: cleanIcon(feishuRaw),
  telegrambot: cleanIcon(telegramRaw),
  cloudflare: cleanIcon(cloudflareRaw),
  onepassword: cleanIcon(onepasswordRaw),
  '1password': cleanIcon(onepasswordRaw),
  chatapiforwhatsapp: cleanIcon(whatsappRaw),
  mcdonalds: cleanIcon(mcdonaldsRaw),
  frontapp: cleanIcon(frontappRaw),
  elevenreader: cleanIcon(elevenlabsRaw),
  ocelevenreader: cleanIcon(elevenlabsRaw),
  /* Namespaced OpenConnector directory ids (oc_<service>) reuse the same
   * brand marks as their gateway twins. */
  acculynx: cleanIcon(acculynxRaw),
  ocacculynx: cleanIcon(acculynxRaw),
  affinda: cleanIcon(affindaRaw),
  ocaffinda: cleanIcon(affindaRaw),
  affinity: cleanIcon(affinityRaw),
  ocaffinity: cleanIcon(affinityRaw),
  agentmail: cleanIcon(agentMailRaw),
  ocagentmail: cleanIcon(agentMailRaw),
  agenty: cleanIcon(agentyRaw),
  ocagenty: cleanIcon(agentyRaw),
  agora: cleanIcon(agoraRaw),
  ocagora: cleanIcon(agoraRaw),
  airbrake: cleanIcon(airbrakeRaw),
  ocairbrake: cleanIcon(airbrakeRaw),
  aircall: cleanIcon(aircallRaw),
  ocaircall: cleanIcon(aircallRaw),
  airtable: cleanIcon(airtableRaw),
  ocairtable: cleanIcon(airtableRaw),
  alttextai: cleanIcon(altTextAiRaw),
  ocalttextai: cleanIcon(altTextAiRaw),
  amap: cleanIcon(amapRaw),
  ocamap: cleanIcon(amapRaw),
  anchorbrowser: cleanIcon(anchorBrowserRaw),
  ocanchorbrowser: cleanIcon(anchorBrowserRaw),
  anthropic: cleanIcon(anthropicRaw),
  ocanthropic: cleanIcon(anthropicRaw),
  anthropicadmin: cleanIcon(anthropicAdminRaw),
  ocanthropicadmin: cleanIcon(anthropicAdminRaw),
  apipieai: cleanIcon(apipieAiRaw),
  ocapipieai: cleanIcon(apipieAiRaw),
  asana: cleanIcon(asanaRaw),
  ocasana: cleanIcon(asanaRaw),
  assemblyai: cleanIcon(assemblyaiRaw),
  ocassemblyai: cleanIcon(assemblyaiRaw),
  atlasso: cleanIcon(atlasSoRaw),
  ocatlasso: cleanIcon(atlasSoRaw),
  baidumaps: cleanIcon(baiduMapsRaw),
  ocbaidumaps: cleanIcon(baiduMapsRaw),
  bluesky: cleanIcon(blueskyRaw),
  ocbluesky: cleanIcon(blueskyRaw),
  botpress: cleanIcon(botpressRaw),
  ocbotpress: cleanIcon(botpressRaw),
  botsonic: cleanIcon(botsonicRaw),
  ocbotsonic: cleanIcon(botsonicRaw),
  callerapi: cleanIcon(callerapiRaw),
  occallerapi: cleanIcon(callerapiRaw),
  callingly: cleanIcon(callinglyRaw),
  occallingly: cleanIcon(callinglyRaw),
  callpage: cleanIcon(callpageRaw),
  occallpage: cleanIcon(callpageRaw),
  chatbotkit: cleanIcon(chatbotkitRaw),
  occhatbotkit: cleanIcon(chatbotkitRaw),
  chatpdf: cleanIcon(chatpdfRaw),
  occhatpdf: cleanIcon(chatpdfRaw),
  chorus: cleanIcon(chorusRaw),
  occhorus: cleanIcon(chorusRaw),
  circle: cleanIcon(circleRaw),
  occircle: cleanIcon(circleRaw),
  claidai: cleanIcon(claidAiRaw),
  occlaidai: cleanIcon(claidAiRaw),
  clickmeeting: cleanIcon(clickmeetingRaw),
  occlickmeeting: cleanIcon(clickmeetingRaw),
  clicksend: cleanIcon(clicksendRaw),
  occlicksend: cleanIcon(clicksendRaw),
  clickup: cleanIcon(clickupRaw),
  occlickup: cleanIcon(clickupRaw),
  cloudflareemailrouting: cleanIcon(cloudflareEmailRoutingRaw),
  occloudflareemailrouting: cleanIcon(cloudflareEmailRoutingRaw),
  codegen: cleanIcon(codegenRaw),
  occodegen: cleanIcon(codegenRaw),
  cohere: cleanIcon(cohereRaw),
  occohere: cleanIcon(cohereRaw),
  context7: cleanIcon(context7Raw),
  occontext7: cleanIcon(context7Raw),
  courier: cleanIcon(courierRaw),
  occourier: cleanIcon(courierRaw),
  crisp: cleanIcon(crispRaw),
  occrisp: cleanIcon(crispRaw),
  cursor: cleanIcon(cursorRaw),
  occursor: cleanIcon(cursorRaw),
  customgpt: cleanIcon(customgptRaw),
  occustomgpt: cleanIcon(customgptRaw),
  dailybot: cleanIcon(dailybotRaw),
  ocdailybot: cleanIcon(dailybotRaw),
  deckco: cleanIcon(deckCoRaw),
  ocdeckco: cleanIcon(deckCoRaw),
  deepgram: cleanIcon(deepgramRaw),
  ocdeepgram: cleanIcon(deepgramRaw),
  deepl: cleanIcon(deeplRaw),
  ocdeepl: cleanIcon(deeplRaw),
  deepseek: cleanIcon(deepseekRaw),
  ocdeepseek: cleanIcon(deepseekRaw),
  devin: cleanIcon(devinRaw),
  ocdevin: cleanIcon(devinRaw),
  diffbot: cleanIcon(diffbotRaw),
  ocdiffbot: cleanIcon(diffbotRaw),
  dingtalkbot: cleanIcon(dingtalkBotRaw),
  ocdingtalkbot: cleanIcon(dingtalkBotRaw),
  discord: cleanIcon(discordRaw),
  ocdiscord: cleanIcon(discordRaw),
  discourse: cleanIcon(discourseRaw),
  ocdiscourse: cleanIcon(discourseRaw),
  dixa: cleanIcon(dixaRaw),
  ocdixa: cleanIcon(dixaRaw),
  docsbotai: cleanIcon(docsbotAiRaw),
  ocdocsbotai: cleanIcon(docsbotAiRaw),
  docsumo: cleanIcon(docsumoRaw),
  ocdocsumo: cleanIcon(docsumoRaw),
  e2b: cleanIcon(e2bRaw),
  oce2b: cleanIcon(e2bRaw),
  elevenlabs: cleanIcon(elevenlabsRaw),
  ocelevenlabs: cleanIcon(elevenlabsRaw),
  emailable: cleanIcon(emailableRaw),
  ocemailable: cleanIcon(emailableRaw),
  emaillistverify: cleanIcon(emaillistverifyRaw),
  ocemaillistverify: cleanIcon(emaillistverifyRaw),
  emailoctopus: cleanIcon(emailoctopusRaw),
  ocemailoctopus: cleanIcon(emailoctopusRaw),
  encharge: cleanIcon(enchargeRaw),
  ocencharge: cleanIcon(enchargeRaw),
  feishu: cleanIcon(feishuRaw),
  ocfeishu: cleanIcon(feishuRaw),
  feishucustombot: cleanIcon(feishuCustomBotRaw),
  ocfeishucustombot: cleanIcon(feishuCustomBotRaw),
  freshdesk: cleanIcon(freshdeskRaw),
  ocfreshdesk: cleanIcon(freshdeskRaw),
  freshservice: cleanIcon(freshserviceRaw),
  ocfreshservice: cleanIcon(freshserviceRaw),
  front: cleanIcon(frontappRaw),
  ocfront: cleanIcon(frontappRaw),
  gemini: cleanIcon(geminiRaw),
  ocgemini: cleanIcon(geminiRaw),
  gleap: cleanIcon(gleapRaw),
  ocgleap: cleanIcon(gleapRaw),
  googlecalendar: cleanIcon(googlecalendarRaw),
  ocgooglecalendar: cleanIcon(googlecalendarRaw),
  ima: cleanIcon(imaRaw),
  ocima: cleanIcon(imaRaw),
  intercom: cleanIcon(intercomRaw),
  ocintercom: cleanIcon(intercomRaw),
  jimengai: cleanIcon(jimengAiRaw),
  ocjimengai: cleanIcon(jimengAiRaw),
  jira: cleanIcon(jiraRaw),
  ocjira: cleanIcon(jiraRaw),
  linear: cleanIcon(linearRaw),
  oclinear: cleanIcon(linearRaw),
  lingvanextranslationapi: cleanIcon(lingvanexTranslationApiRaw),
  oclingvanextranslationapi: cleanIcon(lingvanexTranslationApiRaw),
  luckincoffee: cleanIcon(luckinCoffeeRaw),
  ocluckincoffee: cleanIcon(luckinCoffeeRaw),
  mcdonaldscn: cleanIcon(mcdonaldsCnRaw),
  ocmcdonaldscn: cleanIcon(mcdonaldsCnRaw),
  monday: cleanIcon(mondayRaw),
  ocmonday: cleanIcon(mondayRaw),
  neteasemail: cleanIcon(neteaseMailRaw),
  ocneteasemail: cleanIcon(neteaseMailRaw),
  openai: cleanIcon(openaiRaw),
  ocopenai: cleanIcon(openaiRaw),
  outlook: cleanIcon(outlookRaw),
  ocoutlook: cleanIcon(outlookRaw),
  perplexity: cleanIcon(perplexityRaw),
  ocperplexity: cleanIcon(perplexityRaw),
  pipedrive: cleanIcon(pipedriveRaw),
  ocpipedrive: cleanIcon(pipedriveRaw),
  qianfan: cleanIcon(qianfanRaw),
  ocqianfan: cleanIcon(qianfanRaw),
  qqmail: cleanIcon(qqMailRaw),
  ocqqmail: cleanIcon(qqMailRaw),
  sendgrid: cleanIcon(sendgridRaw),
  ocsendgrid: cleanIcon(sendgridRaw),
  slack: cleanIcon(slackRaw),
  ocslack: cleanIcon(slackRaw),
  telegram: cleanIcon(telegramRaw),
  octelegram: cleanIcon(telegramRaw),
  tencentdocs: cleanIcon(tencentDocsRaw),
  octencentdocs: cleanIcon(tencentDocsRaw),
  ticktick: cleanIcon(ticktickRaw),
  octicktick: cleanIcon(ticktickRaw),
  torii: cleanIcon(toriiRaw),
  octorii: cleanIcon(toriiRaw),
  trello: cleanIcon(trelloRaw),
  octrello: cleanIcon(trelloRaw),
  twilio: cleanIcon(twilioRaw),
  octwilio: cleanIcon(twilioRaw),
  wecombot: cleanIcon(wecomBotRaw),
  ocwecombot: cleanIcon(wecomBotRaw),
  whatsapp: cleanIcon(whatsappRaw),
  ocwhatsapp: cleanIcon(whatsappRaw),
  yuandian: cleanIcon(yuandianRaw),
  ocyuandian: cleanIcon(yuandianRaw),
  zendesk: cleanIcon(zendeskRaw),
  oczendesk: cleanIcon(zendeskRaw),
  zhihu: cleanIcon(zhihuRaw),
  oczhihu: cleanIcon(zhihuRaw),
  /* Long-tail PNG marks (no public vendor SVG). */
  '7shifts': pngIcon(sevenShiftsPng),
  oc7shifts: pngIcon(sevenShiftsPng),
  accrediblecertificates: pngIcon(accrediblePng),
  ocaccrediblecertificates: pngIcon(accrediblePng),
  agiled: pngIcon(agiledPng),
  ocagiled: pngIcon(agiledPng),
  anysearch: pngIcon(anysearchPng),
  ocanysearch: pngIcon(anysearchPng),
  agentql: pngIcon(agentqlPng),
  ocagentql: pngIcon(agentqlPng),
  aivoov: pngIcon(aivoovPng),
  ocaivoov: pngIcon(aivoovPng),
  bark: pngIcon(barkPng),
  ocbark: pngIcon(barkPng),
  beamer: pngIcon(beamerPng),
  ocbeamer: pngIcon(beamerPng),
  bird: pngIcon(birdPng),
  ocbird: pngIcon(birdPng),
  browseai: pngIcon(browseAiPng),
  ocbrowseai: pngIcon(browseAiPng),
  campaigncleaner: pngIcon(campaignCleanerPng),
  occampaigncleaner: pngIcon(campaignCleanerPng),
  chatwork: pngIcon(chatworkPng),
  occhatwork: pngIcon(chatworkPng),
  data247: pngIcon(data247Png),
  ocdata247: pngIcon(data247Png),
  detectlanguage: pngIcon(detectLanguagePng),
  ocdetectlanguage: pngIcon(detectLanguagePng),
  eagledoc: pngIcon(eagleDocPng),
  oceagledoc: pngIcon(eagleDocPng),
  edenai: pngIcon(edenAiPng),
  ocedenai: pngIcon(edenAiPng),
  godial: pngIcon(godialPng),
  ocgodial: pngIcon(godialPng),
  twochat: pngIcon(twochatPng),
  octwochat: pngIcon(twochatPng),
};

/* Chinese display-name keys: the directory falls back to the plugin name
 * when the id lookup misses (e.g. oc_amap → 高德地图). Registering the
 * official display names keeps those rows branded too. */
const NAME_MARKS: Record<string, string> = {
  'AccuLynx': cleanIcon(acculynxRaw),
  'Affinda': cleanIcon(affindaRaw),
  'Affinity': cleanIcon(affinityRaw),
  'AgentMail': cleanIcon(agentMailRaw),
  'Agenty': cleanIcon(agentyRaw),
  'Agora': cleanIcon(agoraRaw),
  'Airbrake': cleanIcon(airbrakeRaw),
  'Aircall': cleanIcon(aircallRaw),
  'Airtable': cleanIcon(airtableRaw),
  'AltText.ai': cleanIcon(altTextAiRaw),
  '高德地图': cleanIcon(amapRaw),
  'Anchor Browser': cleanIcon(anchorBrowserRaw),
  'Anthropic': cleanIcon(anthropicRaw),
  'Anthropic Admin': cleanIcon(anthropicAdminRaw),
  'APIPie AI': cleanIcon(apipieAiRaw),
  'Asana': cleanIcon(asanaRaw),
  'AssemblyAI': cleanIcon(assemblyaiRaw),
  'Atlas.so': cleanIcon(atlasSoRaw),
  'Bluesky': cleanIcon(blueskyRaw),
  'Botpress': cleanIcon(botpressRaw),
  'Botsonic': cleanIcon(botsonicRaw),
  'CallerAPI': cleanIcon(callerapiRaw),
  'Callingly': cleanIcon(callinglyRaw),
  'CallPage': cleanIcon(callpageRaw),
  'ChatBotKit': cleanIcon(chatbotkitRaw),
  'ChatPDF': cleanIcon(chatpdfRaw),
  'Chorus': cleanIcon(chorusRaw),
  'Circle': cleanIcon(circleRaw),
  'Claid AI': cleanIcon(claidAiRaw),
  'ClickMeeting': cleanIcon(clickmeetingRaw),
  'ClickSend': cleanIcon(clicksendRaw),
  'ClickUp': cleanIcon(clickupRaw),
  'Codegen': cleanIcon(codegenRaw),
  'Cohere': cleanIcon(cohereRaw),
  'Context7': cleanIcon(context7Raw),
  'Courier': cleanIcon(courierRaw),
  'Crisp': cleanIcon(crispRaw),
  'Cursor': cleanIcon(cursorRaw),
  'CustomGPT.ai': cleanIcon(customgptRaw),
  'Dailybot': cleanIcon(dailybotRaw),
  'Deck.co': cleanIcon(deckCoRaw),
  'Deepgram': cleanIcon(deepgramRaw),
  'DeepL': cleanIcon(deeplRaw),
  'DeepSeek': cleanIcon(deepseekRaw),
  'Devin': cleanIcon(devinRaw),
  'Diffbot': cleanIcon(diffbotRaw),
  'Discord': cleanIcon(discordRaw),
  'Discourse': cleanIcon(discourseRaw),
  'Dixa': cleanIcon(dixaRaw),
  'DocsBot AI': cleanIcon(docsbotAiRaw),
  'Docsumo': cleanIcon(docsumoRaw),
  'E2B': cleanIcon(e2bRaw),
  'ElevenLabs': cleanIcon(elevenlabsRaw),
  'Emailable': cleanIcon(emailableRaw),
  'EmailListVerify': cleanIcon(emaillistverifyRaw),
  'EmailOctopus': cleanIcon(emailoctopusRaw),
  'Encharge': cleanIcon(enchargeRaw),
  'Freshdesk': cleanIcon(freshdeskRaw),
  'Freshservice': cleanIcon(freshserviceRaw),
  'Front': cleanIcon(frontappRaw),
  'Gemini': cleanIcon(geminiRaw),
  'Gleap': cleanIcon(gleapRaw),
  'Gmail': GMAIL_OLED,
  'Google 日历': cleanIcon(googlecalendarRaw),
  'ima 知识库': cleanIcon(imaRaw),
  'Intercom': cleanIcon(intercomRaw),
  '即梦 AI': cleanIcon(jimengAiRaw),
  'Jira': cleanIcon(jiraRaw),
  'Linear': cleanIcon(linearRaw),
  'Lingvanex 翻译 API': cleanIcon(lingvanexTranslationApiRaw),
  '麦当劳中国 MCP': cleanIcon(mcdonaldsCnRaw),
  'monday': cleanIcon(mondayRaw),
  'OpenAI': cleanIcon(openaiRaw),
  'Outlook': cleanIcon(outlookRaw),
  'Perplexity': cleanIcon(perplexityRaw),
  'Pipedrive': cleanIcon(pipedriveRaw),
  'QQ 邮箱': cleanIcon(qqMailRaw),
  'SendGrid': cleanIcon(sendgridRaw),
  'Slack': cleanIcon(slackRaw),
  'Torii 图片翻译器': cleanIcon(toriiRaw),
  'Trello': cleanIcon(trelloRaw),
  'Twilio': cleanIcon(twilioRaw),
  'Zendesk': cleanIcon(zendeskRaw),
  '知乎': cleanIcon(zhihuRaw),
  '麦当劳中国': cleanIcon(mcdonaldsCnRaw),
  '百度地图': cleanIcon(baiduMapsRaw),
  'QQ邮箱': cleanIcon(qqMailRaw),
  '网易邮箱': cleanIcon(neteaseMailRaw),
  '网易企业邮箱': cleanIcon(neteaseMailRaw),
  '钉钉机器人': cleanIcon(dingtalkBotRaw),
  '企业微信机器人': cleanIcon(wecomBotRaw),
  '腾讯文档': cleanIcon(tencentDocsRaw),
  'ima知识库': cleanIcon(imaRaw),
  '华宇元典法律数据': cleanIcon(yuandianRaw),
  '百度千帆': cleanIcon(qianfanRaw),
  '即梦AI': cleanIcon(jimengAiRaw),
  '瑞幸咖啡': cleanIcon(luckinCoffeeRaw),
  '滴答清单': cleanIcon(ticktickRaw),
  '飞书': cleanIcon(feishuRaw),
  '飞书应用机器人': cleanIcon(feishuRaw),
  '飞书自定义机器人': cleanIcon(feishuCustomBotRaw),
  'Discord机器人': cleanIcon(discordRaw),
  'Discord 机器人': cleanIcon(discordRaw),
  'Telegram Bot': cleanIcon(telegramRaw),
  'Chat API for WhatsApp': cleanIcon(whatsappRaw),
  'Cloudflare Email Routing': cleanIcon(cloudflareEmailRoutingRaw),
  '7shifts': pngIcon(sevenShiftsPng),
  'Accredible Certificates': pngIcon(accrediblePng),
  'Agiled': pngIcon(agiledPng),
  'AnySearch': pngIcon(anysearchPng),
  'AgentQL': pngIcon(agentqlPng),
  'AiVOOV': pngIcon(aivoovPng),
  'Bark': pngIcon(barkPng),
  'Beamer': pngIcon(beamerPng),
  'Bird': pngIcon(birdPng),
  'Browse AI': pngIcon(browseAiPng),
  'Campaign Cleaner': pngIcon(campaignCleanerPng),
  'Chatwork': pngIcon(chatworkPng),
  'Data247': pngIcon(data247Png),
  'Detect Language': pngIcon(detectLanguagePng),
  'Eagle Doc': pngIcon(eagleDocPng),
  'Eden AI': pngIcon(edenAiPng),
  'GoDial': pngIcon(godialPng),
  '2Chat': pngIcon(twochatPng),
};

export function normaliseConnectorId(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[_-]/g, '');
}

/* Inline-SVG markup for a connector, or '' when the connector has no
 * bundled mark. Callers render their own monogram fallback on ''. */
export function getConnectorIconMarkup(id: unknown): string {
  const key = normaliseConnectorId(id);
  if (!key) return '';
  const stripped = key.replace(/^oc/, '');
  return MARKS[key] || MARKS[stripped] || MARKS[String(id || '').toLowerCase()] || NAME_MARKS[String(id || '')] || '';
}

/* Ids with a bundled real brand mark (useful for tests / diagnostics). */
export function connectorIconIds(): ReadonlyArray<string> {
  return Object.freeze(Object.keys(MARKS));
}
