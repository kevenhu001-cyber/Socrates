import type { ExtensionDefinition } from '../types';

export const CREATE_SITE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r=".6" fill="currentColor" stroke="none"/><circle cx="9.5" cy="6.5" r=".6" fill="currentColor" stroke="none"/><path d="m10.5 13-1.8 1.8 1.8 1.8m3-3.6 1.8 1.8-1.8 1.8"/></svg>';

export const CREATE_SITE_SYSTEM_PROMPT = [
  'You are in site creation mode. The user describes a page or small site they want published.',
  'Build the request as ONE complete, self-contained HTML document: inline <style> in <head>, no JavaScript, no remote scripts, fonts, images, forms, or credentials. Keep it clean, responsive, and readable in both light and dark browser defaults (declare an explicit color scheme). Match the user\'s language for all copy.',
  'When the brief is clear enough to build, call the create_site tool with a short title and the full HTML source. Use visibility "unlisted" unless the user asked for private or public. If a key detail is missing (purpose, content, audience), ask at most 2 focused questions first — never stall on trivia.',
  'Never claim success without a tool result. After create_site returns a published url, reply with the link (Markdown) and one short sentence on how to open it; offer to iterate on the content or styling. If the call fails, report the failure plainly and offer to retry.',
].join('\n\n');

export const createSiteExtension: ExtensionDefinition = {
  key: 'createSite',
  kind: 'template',
  nameKey: 'composer.tools.createSite',
  nameFallback: 'Create site',
  descriptionKey: 'composer.createSite.hint',
  descriptionFallback: 'Describe a page to build and publish',
  hintKey: 'composer.createSite.hint',
  hintFallback: 'Describe a page to build and publish',
  icon: CREATE_SITE_ICON,
  systemPrompt: CREATE_SITE_SYSTEM_PROMPT,
  body: '',
  autoFocus: true,
  placement: { tools: 10 },
  onActivate(ctx) {
    ctx.setTemplate({
      key: 'createSite',
      title: ctx.t('composer.tools.createSite', 'Create site'),
      icon: CREATE_SITE_ICON,
      hint: ctx.t('composer.createSite.hint', 'Describe a page to build and publish'),
      systemPrompt: CREATE_SITE_SYSTEM_PROMPT,
      body: '',
    });
    ctx.focusComposer();
  },
};
