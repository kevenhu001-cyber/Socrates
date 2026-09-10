/**
 * Per-run Pi provider bridge.
 *
 * Loaded by the server with `pi --extension <this file> --provider socrates-run
 * --model <model>`. The three env vars below are set on the spawned child so
 * the Pi agent runs against exactly the LLM endpoint + model the user picked
 * in Socrates, without writing provider files or touching ~/.pi config.
 *
 * `--no-extensions` is also passed so only this explicit extension loads.
 */

export default function registerRunProvider(pi) {
  const baseUrl = String(process.env.PI_RUN_BASE_URL || '').trim();
  const modelId = String(process.env.PI_RUN_MODEL_ID || '').trim();
  if (!baseUrl || !modelId) return;
  const apiKey = String(process.env.PI_RUN_API_KEY || '').trim() || 'sk-no-key';
  pi.registerProvider('socrates-run', {
    baseUrl,
    apiKey,
    api: 'openai-completions',
    models: [{
      id: modelId,
      name: modelId,
      reasoning: false,
      input: ['text'],
      contextWindow: 128000,
      maxTokens: 16384,
    }],
  });
}
