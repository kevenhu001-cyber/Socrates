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
import githubRaw from '@lobehub/icons-static-svg/icons/github.svg?raw';
import notionRaw from '@lobehub/icons-static-svg/icons/notion.svg?raw';
import baiduCloudRaw from '@lobehub/icons-static-svg/icons/baiducloud.svg?raw';
import tencentRaw from '@lobehub/icons-static-svg/icons/tencent-color.svg?raw';
import microsoftRaw from '@lobehub/icons-static-svg/icons/microsoft-color.svg?raw';
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
import frontRaw from './assets/connector-icons/front.svg?raw';
import frontappRaw from './assets/connector-icons/frontapp.svg?raw';
import geminiRaw from './assets/connector-icons/gemini.svg?raw';
import giteeRaw from './assets/connector-icons/gitee.svg?raw';
import gitlabRaw from './assets/connector-icons/gitlab.svg?raw';
import gleapRaw from './assets/connector-icons/gleap.svg?raw';
import gmailRaw from './assets/connector-icons/gmail.svg?raw';
import googlecalendarRaw from './assets/connector-icons/googlecalendar.svg?raw';
import googledriveRaw from './assets/connector-icons/googledrive.svg?raw';
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
  // Inline `style` is only normalised away on the ROOT <svg> (vendor layout
  // styles such as flex/display). Inner `style` attributes carry real
  // artwork (mask-type, stop-color, fill, opacity) and must be preserved.
  const rootStripped = String(raw || '').replace(/<svg[^>]*>/i, (tag) =>
    tag.replace(/\swidth="[^"]*"/gi, '').replace(/\sheight="[^"]*"/gi, '').replace(/\sstyle="[^"]*"/i, ''),
  );
  return rootStripped
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/\sclip-path="url\(#[^"]*\)"/gi, '')
    .replace(/\sxmlns(?::\w+)?="[^"]*"/gi, '')
    .replace(/\bid="([^"]+)"/g, `id="${ns}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${ns}$1)`)
    .replace(/(href|aria-labelledby|aria-describedby)="#([^"]+)"/g, `$1="#${ns}$2"`)
    .replace(/<svg /i, '<svg aria-hidden="true" ');
}

const GITHUB = cleanIcon(githubRaw);
const NOTION = cleanIcon(notionRaw);
const BAIDU = cleanIcon(baiduCloudRaw);
const TENCENT = cleanIcon(tencentRaw);
const MICROSOFT = cleanIcon(microsoftRaw);
const GOOGLE = cleanIcon(googleRaw);

/* Raster twin of cleanIcon: wraps a bundled PNG URL in the same tile
 * contract (host CSS sizes `img.connector-logo` with object-fit). */
function pngIcon(src: string): string {
  const safe = String(src || '').replace(/"/g, '%22');
  return `<img class="connector-logo" src="${safe}" alt="" aria-hidden="true" loading="lazy" />`;
}

/* Keys are normalised connector ids (lowercase, no _/-). Aliases cover the
 * legacy /plugins panel ids and vendor-name lookups. */
const MARKS: Record<string, string> = {
  github: GITHUB,
  notion: NOTION,
  gitee: cleanIcon(giteeRaw),
  googledrive: cleanIcon(googledriveRaw),
  todoist: cleanIcon(todoistRaw),
  gitlab: cleanIcon(gitlabRaw),
  zotero: cleanIcon(zoteroRaw),
  arxiv: cleanIcon(arxivRaw),
  lark: cleanIcon(feishuRaw),
  onedrive: cleanIcon(onedriveRaw),
  qq: cleanIcon(qqmailRaw),
  google: GOOGLE,
  microsoft: MICROSOFT,
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
  front: cleanIcon(frontRaw),
  ocfront: cleanIcon(frontRaw),
  gemini: cleanIcon(geminiRaw),
  ocgemini: cleanIcon(geminiRaw),
  gleap: cleanIcon(gleapRaw),
  ocgleap: cleanIcon(gleapRaw),
  gmail: cleanIcon(gmailRaw),
  ocgmail: cleanIcon(gmailRaw),
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
  'Front': cleanIcon(frontRaw),
  'Gemini': cleanIcon(geminiRaw),
  'Gleap': cleanIcon(gleapRaw),
  'Gmail': cleanIcon(gmailRaw),
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
  return MARKS[key] || MARKS[String(id || '').toLowerCase()] || NAME_MARKS[String(id || '')] || '';
}

/* Ids with a bundled real brand mark (useful for tests / diagnostics). */
export function connectorIconIds(): ReadonlyArray<string> {
  return Object.freeze(Object.keys(MARKS));
}
