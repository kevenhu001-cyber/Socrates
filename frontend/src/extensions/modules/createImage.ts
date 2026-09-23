import type { ExtensionDefinition } from '../types';

export const CREATE_IMAGE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/><path d="M18 2v4m-2-2h4"/></svg>';

export const CREATE_IMAGE_SYSTEM_PROMPT = [
  'You are in image creation mode. The user has just submitted an image brief.',
  'Do not generate anything until the user submits a prompt. For each submitted request, use the connected Jimeng AI OpenConnector 4.6 image-generation action. Preserve the subject, style, composition, language, and constraints the user asked for; you may clarify or optimize the prompt without changing its intent.',
  'After submission, query the matching 4.6 task-result action until it is done, for at most 8 result checks. If it is still running after those checks, report that generation timed out and invite the user to retry. If the action is missing, fails, or returns no image URL, say clearly that no image was generated and direct the user to connect or repair Jimeng AI from Plugins.',
  'Never claim success or invent an image URL. When a completed result includes one or more image URLs, show the generated image in the chat with Markdown image syntax (one image per URL), followed by a brief acknowledgment.',
].join('\n\n');

export const createImageExtension: ExtensionDefinition = {
  key: 'createImage',
  kind: 'template',
  nameKey: 'composer.tools.createImage',
  nameFallback: 'Create image',
  descriptionKey: 'composer.createImage.hint',
  descriptionFallback: 'Describe an image to generate',
  hintKey: 'composer.createImage.hint',
  hintFallback: 'Describe an image to generate',
  icon: CREATE_IMAGE_ICON,
  systemPrompt: CREATE_IMAGE_SYSTEM_PROMPT,
  body: '',
  autoFocus: true,
  placement: { tools: 9 },
  onActivate(ctx) {
    ctx.setTemplate({
      key: 'createImage',
      title: ctx.t('composer.tools.createImage', 'Create image'),
      icon: CREATE_IMAGE_ICON,
      hint: ctx.t('composer.createImage.hint', 'Describe an image to generate'),
      systemPrompt: CREATE_IMAGE_SYSTEM_PROMPT,
      body: '',
    });
    ctx.focusComposer();
  },
};
