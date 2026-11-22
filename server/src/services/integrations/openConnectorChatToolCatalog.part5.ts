/* Reviewed OpenConnector chat tools, part 5 of 7.
 * Data only: the allow-list rationale lives in openConnectorChatToolCatalog.ts.
 * Keep entries in the original reviewed order. */

import type { OpenConnectorChatTool } from './openConnectorChatToolCatalog.types.js';

export const OPEN_CONNECTOR_CHAT_TOOLS_PART_5: OpenConnectorChatTool[] = [
  {
    tool: 'oc_jimeng_ai_get_image_generation_4_0_result',
    service: 'jimeng_ai',
    actionId: 'jimeng_ai.get_image_generation_4_0_result',
    description: 'Get the result of a Jimeng AI Image Generation 4.0 async task.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', minLength: 1, description: 'The Jimeng async task identifier.' },
        logo_info: {
          type: 'object',
          properties: {
            add_logo: { type: 'boolean' },
            position: { type: 'integer', minimum: 0, maximum: 3 },
            language: { type: 'integer', minimum: 0, maximum: 1 },
            opacity: { type: 'number', minimum: 0, maximum: 1 },
            logo_text_content: { type: 'string' },
          },
          additionalProperties: false,
          description: 'Visible watermark configuration sent to Jimeng.',
        },
        aigc_meta: {
          type: 'object',
          properties: {
            content_producer: { type: 'string' },
            producer_id: { type: 'string', minLength: 1 },
            content_propagator: { type: 'string' },
            propagate_id: { type: 'string' },
          },
          additionalProperties: false,
          required: ['producer_id'],
          description: 'AIGC metadata configuration embedded in generated content.',
        },
      },
      additionalProperties: false,
      required: ['task_id'],
      description: 'Input parameters for querying a Jimeng image task result.',
    },
  },
  {
    tool: 'oc_jimeng_ai_submit_image_generation_4_6',
    service: 'jimeng_ai',
    actionId: 'jimeng_ai.submit_image_generation_4_6',
    description:
      'Submit a user-requested image-generation prompt to Jimeng AI 4.6. This action creates a new image task; use it only after the user has submitted a prompt in image-creation mode.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          minLength: 1,
          maxLength: 800,
          description: "The user's image-generation prompt, up to 800 characters.",
        },
      },
      additionalProperties: false,
      required: ['prompt'],
      description: 'Submit one text prompt to Jimeng AI Image Generation 4.6.',
    },
    retryableOnTransientError: false,
  },
  {
    tool: 'oc_jimeng_ai_get_image_generation_4_6_result',
    service: 'jimeng_ai',
    actionId: 'jimeng_ai.get_image_generation_4_6_result',
    description: 'Get the result of a Jimeng AI Image Generation 4.6 async task.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', minLength: 1, description: 'The Jimeng async task identifier.' },
        logo_info: {
          type: 'object',
          properties: {
            add_logo: { type: 'boolean' },
            position: { type: 'integer', minimum: 0, maximum: 3 },
            language: { type: 'integer', minimum: 0, maximum: 1 },
            opacity: { type: 'number', minimum: 0, maximum: 1 },
            logo_text_content: { type: 'string' },
          },
          additionalProperties: false,
          description: 'Visible watermark configuration sent to Jimeng.',
        },
        aigc_meta: {
          type: 'object',
          properties: {
            content_producer: { type: 'string' },
            producer_id: { type: 'string', minLength: 1 },
            content_propagator: { type: 'string' },
            propagate_id: { type: 'string' },
          },
          additionalProperties: false,
          required: ['producer_id'],
          description: 'AIGC metadata configuration embedded in generated content.',
        },
      },
      additionalProperties: false,
      required: ['task_id'],
      description: 'Input parameters for querying a Jimeng image task result.',
    },
  },
  {
    tool: 'oc_jimeng_ai_get_marketing_video_agent_result',
    service: 'jimeng_ai',
    actionId: 'jimeng_ai.get_marketing_video_agent_result',
    description: 'Get the result of a Lilinque Marketing Video Agent async task.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', minLength: 1, description: 'The Jimeng async task identifier.' },
      },
      additionalProperties: false,
      description: 'Input parameters for querying a Jimeng video task result.',
    },
  },
  {
    tool: 'oc_zhihu_hot_list',
    service: 'zhihu',
    actionId: 'zhihu.hot_list',
    description: 'Get the current Zhihu hot list with titles, links, thumbnails, and summaries.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 30,
          description: 'The number of hot list items to return, up to 30.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for a Zhihu hot list request.',
    },
  },
  {
    tool: 'oc_ima_check_repeated_names',
    service: 'ima',
    actionId: 'ima.check_repeated_names',
    description: 'Check whether file names already exist in an IMA knowledge-base folder.',
    parameters: {
      type: 'object',
      properties: {
        knowledgeBaseId: {
          type: 'string',
          minLength: 1,
          description: 'The IMA knowledge base ID.',
        },
        folderId: {
          type: 'string',
          minLength: 1,
          description: 'The target folder ID inside the knowledge base.',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, description: 'The file name to check.' },
              mediaType: { type: 'integer', description: 'The IMA media type for this file.' },
            },
            additionalProperties: false,
            description: 'One file name and media type to check.',
          },
          description: 'The files to check for duplicate names.',
          minItems: 1,
          maxItems: 2000,
        },
      },
      additionalProperties: false,
      required: ['knowledgeBaseId', 'files'],
      description: 'The input payload for checking repeated IMA knowledge-base file names.',
    },
  },
  {
    tool: 'oc_ima_get_knowledge_bases',
    service: 'ima',
    actionId: 'ima.get_knowledge_bases',
    description: 'Fetch metadata for one or more IMA knowledge bases.',
    parameters: {
      type: 'object',
      properties: {
        knowledgeBaseIds: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'One unique IMA knowledge base ID.' },
          description: 'The unique IMA knowledge-base IDs to fetch.',
          minItems: 1,
          maxItems: 20,
          uniqueItems: true,
        },
      },
      additionalProperties: false,
      description: 'The input payload for fetching IMA knowledge-base metadata.',
    },
  },
  {
    tool: 'oc_ima_get_knowledge_item_original',
    service: 'ima',
    actionId: 'ima.get_knowledge_item_original',
    description:
      'Fetch access information for a knowledge-base item and download URL-backed original content through local transit storage when available.',
    parameters: {
      type: 'object',
      properties: {
        mediaId: { type: 'string', minLength: 1, description: 'The IMA media ID.' },
        fileName: {
          type: 'string',
          minLength: 1,
          description: 'The preferred transit file name when downloading URL content.',
        },
      },
      additionalProperties: false,
      required: ['mediaId'],
      description: 'The input payload for retrieving original IMA knowledge-base content.',
    },
  },
  {
    tool: 'oc_lingvanex_translation_api_detect_language',
    service: 'lingvanex_translation_api',
    actionId: 'lingvanex_translation_api.detect_language',
    description: 'Detect the language of one text value or a list of text values.',
    parameters: {
      type: 'object',
      properties: {
        q: {
          anyOf: [
            { type: 'string', minLength: 1 },
            {
              type: 'array',
              items: { type: 'string', minLength: 1, description: 'One text value to inspect.' },
              minItems: 1,
            },
          ],
          description: 'The text values to inspect with Lingvanex.',
        },
      },
      additionalProperties: false,
      required: ['q'],
      description: 'The input payload for detecting languages with Lingvanex.',
    },
  },
  {
    tool: 'oc_lingvanex_translation_api_list_languages',
    service: 'lingvanex_translation_api',
    actionId: 'lingvanex_translation_api.list_languages',
    description: 'List languages supported by the Lingvanex Translation API.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          minLength: 1,
          description: 'The language code used to localize returned language names.',
        },
        model: {
          type: 'string',
          minLength: 1,
          description: 'The optional translation model passed to Lingvanex.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for listing Lingvanex languages.',
    },
  },
  {
    tool: 'oc_torii_get_app',
    service: 'torii',
    actionId: 'torii.get_app',
    description: 'Retrieve one Torii app by app identifier.',
    parameters: {
      type: 'object',
      properties: {
        appId: {
          type: 'integer',
          minimum: 1,
          maximum: 2147483647,
          description: 'The Torii app identifier.',
        },
        fields: {
          type: 'string',
          minLength: 1,
          description: 'A comma-separated list of fields to return.',
        },
        includeLicenses: {
          type: 'boolean',
          description: 'Whether to include the aggregated license summary for the app.',
        },
      },
      additionalProperties: false,
      required: ['appId'],
      description: 'The input payload for retrieving one Torii app.',
    },
  },
  {
    tool: 'oc_torii_get_contract',
    service: 'torii',
    actionId: 'torii.get_contract',
    description: 'Retrieve one Torii contract by contract identifier.',
    parameters: {
      type: 'object',
      properties: {
        contractId: {
          type: 'integer',
          minimum: 1,
          maximum: 2147483647,
          description: 'The Torii contract identifier.',
        },
        apiVersion: {
          type: 'string',
          enum: ['1.0', '1.1'],
          description: 'The Torii contracts API version header to send.',
        },
        fields: {
          type: 'string',
          minLength: 1,
          description: 'A comma-separated list of fields to return.',
        },
      },
      additionalProperties: false,
      required: ['contractId'],
      description: 'The input payload for retrieving one Torii contract.',
    },
  },
  {
    tool: 'oc_torii_get_organization',
    service: 'torii',
    actionId: 'torii.get_organization',
    description: 'Retrieve the Torii organization profile for the current API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for retrieving the current Torii organization.',
    },
  },
  {
    tool: 'oc_openai_get_batch',
    service: 'openai',
    actionId: 'openai.get_batch',
    description: 'Fetch one OpenAI batch job by its identifier.',
    parameters: {
      type: 'object',
      properties: { batch_id: { type: 'string', description: 'The batch identifier.' } },
      additionalProperties: false,
      required: ['batch_id'],
      description: 'The input payload for a batch lookup action.',
    },
  },
  {
    tool: 'oc_openai_get_input_token_counts',
    service: 'openai',
    actionId: 'openai.get_input_token_counts',
    description: 'Count how many input tokens a Responses-style OpenAI request would consume.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'The model used for counting the input tokens.' },
        input: {
          anyOf: [
            { type: 'string' },
            {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  role: {
                    type: 'string',
                    enum: ['system', 'user', 'assistant', 'developer'],
                    description: 'The role of the message author.',
                  },
                  content: {
                    anyOf: [
                      { type: 'string', description: 'Plain text content for a simple message.' },
                      {
                        type: 'array',
                        items: {
                          anyOf: [
                            {
                              type: 'object',
                              properties: {
                                type: {
                                  const: 'input_text',
                                  type: 'string',
                                  description: 'The content type. Must be input_text.',
                                },
                                text: {
                                  type: 'string',
                                  description: 'The text content sent to the model.',
                                },
                              },
                              additionalProperties: false,
                              required: ['type', 'text'],
                              description: 'A text content block for a response input message.',
                            },
                            {
                              type: 'object',
                              properties: {
                                type: {
                                  const: 'input_image',
                                  type: 'string',
                                  description: 'The content type. Must be input_image.',
                                },
                                image_url: {
                                  type: 'string',
                                  description:
                                    'A remote image URL or a data URL containing the image bytes.',
                                },
                                detail: {
                                  type: 'string',
                                  enum: ['auto', 'low', 'high', 'original'],
                                  description: 'The requested image detail level.',
                                },
                              },
                              additionalProperties: false,
                              required: ['type', 'image_url'],
                              description: 'An image content block for a response input message.',
                            },
                            {
                              type: 'object',
                              properties: {
                                type: {
                                  const: 'input_file',
                                  type: 'string',
                                  description: 'The content type. Must be input_file.',
                                },
                                file_id: {
                                  type: 'string',
                                  description: 'The uploaded file ID to reference.',
                                },
                                file_data: {
                                  type: 'string',
                                  description:
                                    'The inline file data encoded as base64 or supplied as a data URL.',
                                },
                                filename: {
                                  type: 'string',
                                  description: 'The filename to report for inline file data.',
                                },
                              },
                              additionalProperties: false,
                              required: ['type'],
                              description: 'A file content block for a response input message.',
                            },
                          ],
                        },
                        description: 'Structured multimodal content blocks.',
                        minItems: 1,
                      },
                    ],
                  },
                },
                additionalProperties: false,
                required: ['role', 'content'],
                description: 'A message in the Responses API input array.',
              },
              minItems: 1,
            },
          ],
        },
        instructions: {
          type: 'string',
          description: 'Top-level instructions to include in the token count.',
        },
        previous_response_id: {
          type: 'string',
          description: 'A previous response identifier to continue counting from.',
        },
        text: {
          type: 'object',
          properties: {
            format: {
              anyOf: [
                {
                  type: 'object',
                  properties: { type: { const: 'json_object', type: 'string' } },
                  additionalProperties: false,
                  required: ['type'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'json_schema', type: 'string' },
                    name: { type: 'string' },
                    schema: { type: 'object', additionalProperties: true },
                    strict: { type: 'boolean' },
                  },
                  additionalProperties: false,
                  required: ['type', 'name', 'schema'],
                },
              ],
            },
          },
          additionalProperties: false,
          description: 'Text output configuration for the response.',
        },
        truncation: {
          type: 'string',
          description: 'The truncation mode to apply before counting.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for counting input tokens for a Responses-style request.',
    },
  },
  {
    tool: 'oc_openai_get_model',
    service: 'openai',
    actionId: 'openai.get_model',
    description: 'Retrieve the metadata for a single OpenAI model by ID.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'The exact model identifier to retrieve.' },
      },
      additionalProperties: false,
      required: ['model'],
      description: 'The input payload for retrieving a single OpenAI model.',
    },
  },
  {
    tool: 'oc_anthropic_count_message_tokens',
    service: 'anthropic',
    actionId: 'anthropic.count_message_tokens',
    description: 'Count input tokens for an Anthropic message request.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'The Anthropic model identifier to use.' },
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
                enum: ['user', 'assistant'],
                description: 'The role of the message author.',
              },
              content: {
                anyOf: [
                  { type: 'string', description: 'Plain text message content.' },
                  {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                      description: 'A structured Anthropic content block.',
                    },
                    description: 'Structured content blocks.',
                    minItems: 1,
                  },
                ],
                description: 'Anthropic message content.',
              },
            },
            additionalProperties: true,
            description: 'An input message in an Anthropic conversation.',
          },
          description: 'The ordered conversation history to count.',
          minItems: 1,
        },
        system: {
          anyOf: [
            { type: 'string' },
            {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                description: 'A structured Anthropic content block.',
              },
              minItems: 1,
            },
          ],
          description: 'System prompt content.',
        },
        thinking: {
          type: 'object',
          additionalProperties: { description: 'Any JSON value accepted by the Anthropic API.' },
          description: 'A JSON object passed through to the Anthropic API.',
        },
        tool_choice: {
          anyOf: [
            { type: 'string', enum: ['auto', 'any', 'none'] },
            {
              type: 'object',
              additionalProperties: {
                description: 'Any JSON value accepted by the Anthropic API.',
              },
            },
          ],
          description: 'Tool selection strategy for the request.',
        },
        tools: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: {},
            description: 'A JSON object passed through to the Anthropic API.',
          },
          description: 'Tools available to the model.',
        },
      },
      additionalProperties: false,
      required: ['model', 'messages'],
      description: 'The input payload for counting tokens in an Anthropic message request.',
    },
  },
  {
    tool: 'oc_anthropic_get_model',
    service: 'anthropic',
    actionId: 'anthropic.get_model',
    description: 'Fetch metadata for one Anthropic model.',
    parameters: {
      type: 'object',
      properties: {
        model_id: {
          type: 'string',
          description: 'The exact Anthropic model identifier to retrieve.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for retrieving an Anthropic model.',
    },
  },
  {
    tool: 'oc_anthropic_list_models',
    service: 'anthropic',
    actionId: 'anthropic.list_models',
    description: 'List Anthropic models available to the current API key.',
    parameters: {
      type: 'object',
      properties: {
        before_id: { type: 'string', description: 'Returns models before this model identifier.' },
        after_id: { type: 'string', description: 'Returns models after this model identifier.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'The maximum number of models to return.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for listing Anthropic models.',
    },
  },
  {
    tool: 'oc_gemini_count_tokens',
    service: 'gemini',
    actionId: 'gemini.count_tokens',
    description: 'Count the Gemini token usage for input text.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, description: 'The text to count tokens for.' },
        model: { type: 'string', description: 'The model name to use for tokenization.' },
      },
      additionalProperties: false,
      required: ['text'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_gemini_get_videos_operation',
    service: 'gemini',
    actionId: 'gemini.get_videos_operation',
    description: 'Fetch the current status for a Gemini Veo operation.',
    parameters: {
      type: 'object',
      properties: {
        operation_name: {
          type: 'string',
          minLength: 1,
          description: 'The long-running Veo operation name.',
        },
      },
      additionalProperties: false,
      required: ['operation_name'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_gemini_list_models',
    service: 'gemini',
    actionId: 'gemini.list_models',
    description: 'List the available Gemini and Veo models.',
    parameters: {
      type: 'object',
      properties: {
        filter_prefix: { type: 'string', description: 'The model name prefix to filter by.' },
      },
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_perplexity_list_models',
    service: 'perplexity',
    actionId: 'perplexity.list_models',
    description: 'List the models currently available from Perplexity.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for this action.',
    },
  },
  {
    tool: 'oc_perplexity_search',
    service: 'perplexity',
    actionId: 'perplexity.search',
    description:
      'Search the web and return ranked raw results from Perplexity without LLM synthesis.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          anyOf: [
            { type: 'string', minLength: 1 },
            {
              type: 'array',
              items: { type: 'string', minLength: 1, description: 'One raw web search query.' },
              minItems: 1,
            },
          ],
          description: 'One or more raw web search queries.',
        },
        country: {
          type: 'string',
          minLength: 2,
          maxLength: 2,
          description: 'The ISO 3166-1 alpha-2 country code used to localize search results.',
        },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'The maximum number of search results to return.',
        },
        search_after_date: {
          type: 'string',
          description: 'Only return content published after this date, for example 01/15/2024.',
        },
        search_before_date: {
          type: 'string',
          description: 'Only return content published before this date, for example 12/31/2024.',
        },
        max_tokens_per_page: {
          type: 'integer',
          minimum: 1,
          description: 'The maximum number of tokens to retrieve from each webpage.',
        },
        search_domain_filter: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1,
            description: 'A domain or URL prefix used to filter results.',
          },
          description: 'Only return search results from these domains or URL prefixes.',
          maxItems: 20,
        },
      },
      additionalProperties: false,
      required: ['query'],
      description: 'The input payload for the raw Perplexity web search action.',
    },
  },
  {
    tool: 'oc_deepseek_get_user_balance',
    service: 'deepseek',
    actionId: 'deepseek.get_user_balance',
    description: 'Get the current DeepSeek account balance.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for this action.',
    },
  },
  {
    tool: 'oc_deepseek_list_models',
    service: 'deepseek',
    actionId: 'deepseek.list_models',
    description: 'List the available DeepSeek models.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for this action.',
    },
  },
  {
    tool: 'oc_affinda_get_document',
    service: 'affinda',
    actionId: 'affinda.get_document',
    description: 'Get one Affinda document by identifier.',
    parameters: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          minLength: 1,
          description: 'The Affinda document identifier.',
        },
        compact: {
          type: 'boolean',
          description: 'Whether Affinda should return compact parsed data.',
        },
      },
      additionalProperties: false,
      required: ['identifier'],
      description: 'Input parameters for retrieving one Affinda document.',
    },
  },
  {
    tool: 'oc_affinda_list_document_types',
    service: 'affinda',
    actionId: 'affinda.list_document_types',
    description: 'List Affinda document types available to the API key.',
    parameters: {
      type: 'object',
      properties: {
        organization: {
          type: 'string',
          minLength: 1,
          description: 'Filter document types by Affinda organization identifier.',
        },
        workspace: {
          type: 'string',
          minLength: 1,
          description: 'Filter document types by Affinda workspace identifier.',
        },
      },
      additionalProperties: false,
      description: 'Filters for listing Affinda document types.',
    },
  },
  {
    tool: 'oc_affinda_list_documents',
    service: 'affinda',
    actionId: 'affinda.list_documents',
    description: 'List Affinda documents with optional workflow and pagination filters.',
    parameters: {
      type: 'object',
      properties: {
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'The number of documents to skip before collecting results.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'The number of documents to return.',
        },
        workspace: {
          type: 'string',
          minLength: 1,
          description: 'Filter by Affinda workspace identifier.',
        },
        state: {
          type: 'string',
          enum: ['uploaded', 'review', 'validated', 'archived', 'rejected'],
          description: 'Filter by the Affinda document state.',
        },
        tags: {
          type: 'array',
          items: { type: 'integer', minimum: 1, description: 'An Affinda tag ID.' },
          description: 'Filter by Affinda tag IDs.',
          minItems: 1,
        },
        search: {
          type: 'string',
          minLength: 1,
          description: 'Match document file names or tag names case-insensitively.',
        },
        includeData: {
          type: 'boolean',
          description: 'Whether Affinda should include parsed data summaries in the list.',
        },
        failed: { type: 'boolean', description: 'Filter by failed processing status.' },
        ready: { type: 'boolean', description: 'Filter by ready processing status.' },
        validatable: { type: 'boolean', description: 'Filter to documents that can be validated.' },
        customIdentifier: {
          type: 'string',
          minLength: 1,
          description: 'Filter documents by the custom identifier set at upload.',
        },
        compact: {
          type: 'boolean',
          description: 'Whether Affinda should return compact parsed data.',
        },
      },
      additionalProperties: false,
      description: 'Filters and pagination controls for listing Affinda documents.',
    },
  },
  {
    tool: 'oc_agentql_get_usage',
    service: 'agentql',
    actionId: 'agentql.get_usage',
    description:
      'Get AgentQL account and API key usage counters for the current billing cycle and lifetime totals.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'This action does not require any input parameters.',
    },
  },
  {
    tool: 'oc_agentql_list_session_usage',
    service: 'agentql',
    actionId: 'agentql.list_session_usage',
    description:
      'List AgentQL Tetra session telemetry entries with optional filters and pagination controls.',
    parameters: {
      type: 'object',
      properties: {
        sub_user_id: {
          type: 'string',
          description: 'Only return telemetry entries for this sub-user identifier.',
        },
        session_id: {
          type: 'string',
          description: 'Only return telemetry for this session identifier.',
        },
        start_after: {
          type: 'string',
          description: 'Only include sessions that started after this timestamp.',
          format: 'date-time',
        },
        end_before: {
          type: 'string',
          description: 'Only include sessions that ended before this timestamp.',
          format: 'date-time',
        },
        updated_after: {
          type: 'string',
          description: 'Only include sessions updated after this timestamp.',
          format: 'date-time',
        },
        updated_before: {
          type: 'string',
          description: 'Only include sessions updated before this timestamp.',
          format: 'date-time',
        },
        status: {
          type: 'string',
          enum: ['running', 'ended'],
          description: 'AgentQL browser session status filter.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum number of entries to return per page.',
        },
        page: { type: 'integer', minimum: 1, description: 'Page number to return.' },
      },
      additionalProperties: false,
      description: 'Optional filters for listing AgentQL Tetra session telemetry.',
    },
  },
  {
    tool: 'oc_agentql_query_data',
    service: 'agentql',
    actionId: 'agentql.query_data',
    description:
      'Query a webpage with AgentQL and return the extracted structured data plus AgentQL metadata.',
    parameters: {
      type: 'object',
      properties: {
        query: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        prompt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        url: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] },
        html: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        params: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['fast', 'standard'] },
            wait_for: { type: 'integer', minimum: 0, maximum: 10 },
            is_scroll_to_bottom_enabled: { type: 'boolean' },
            is_screenshot_enabled: { type: 'boolean' },
            browser_profile: { type: 'string', enum: ['light', 'stealth', 'tf-browser'] },
            proxy: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['tetra', 'custom'] },
                country_code: { type: 'string', minLength: 2, maxLength: 2 },
                url: { type: 'string', minLength: 1 },
                username: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                password: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
              additionalProperties: false,
              required: ['type'],
            },
          },
          additionalProperties: false,
          description: 'Optional query execution settings forwarded to AgentQL query-data.',
        },
      },
      additionalProperties: false,
      description: 'Input for querying webpage data with AgentQL.',
    },
  },
  {
    tool: 'oc_agenty_get_list',
    service: 'agenty',
    actionId: 'agenty.get_list',
    description: 'Get one Agenty list by list identifier.',
    parameters: {
      type: 'object',
      properties: {
        list_id: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { type: 'integer', minimum: 1 },
          ],
          description: 'The Agenty list identifier.',
        },
      },
      additionalProperties: false,
      required: ['list_id'],
      description: 'The input payload for retrieving one Agenty list.',
    },
  },
  {
    tool: 'oc_agenty_get_list_row',
    service: 'agenty',
    actionId: 'agenty.get_list_row',
    description: 'Get one Agenty list row by list and row identifiers.',
    parameters: {
      type: 'object',
      properties: {
        list_id: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { type: 'integer', minimum: 1 },
          ],
          description: 'The Agenty list identifier.',
        },
        row_id: { type: 'string', minLength: 1, description: 'The Agenty list row identifier.' },
      },
      additionalProperties: false,
      required: ['list_id', 'row_id'],
      description: 'The input payload for retrieving one Agenty list row.',
    },
  },
  {
    tool: 'oc_agenty_extract_structured_data',
    service: 'agenty',
    actionId: 'agenty.extract_structured_data',
    description: 'Extract structured metadata such as JSON-LD, RDFa, microdata, and meta tags.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The public HTTP or HTTPS URL to process.',
          format: 'uri',
        },
      },
      additionalProperties: false,
      required: ['url'],
      description: 'The input payload for one Agenty browser request.',
    },
  },
  {
    tool: 'oc_airbrake_get_notice_status',
    service: 'airbrake',
    actionId: 'airbrake.get_notice_status',
    description: 'Get Airbrake processing status for a notice UUID.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'integer',
          minimum: 1,
          description: 'The Airbrake project integer identifier.',
        },
        noticeUuid: {
          type: 'string',
          minLength: 1,
          description: 'The Airbrake notice UUID returned by notice creation.',
        },
      },
      additionalProperties: false,
      required: ['projectId', 'noticeUuid'],
      description: 'Input parameters for an Airbrake notice status.',
    },
  },
];
