/* Reviewed OpenConnector chat tools, part 7 of 7.
 * Data only: the allow-list rationale lives in openConnectorChatToolCatalog.ts.
 * Keep entries in the original reviewed order. */

import type { OpenConnectorChatTool } from './openConnectorChatToolCatalog.types.js';

export const OPEN_CONNECTOR_CHAT_TOOLS_PART_7: OpenConnectorChatTool[] = [
  {
    tool: 'oc_customgpt_get_agent',
    service: 'customgpt',
    actionId: 'customgpt.get_agent',
    description: 'Get details and current status for a CustomGPT agent.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'integer',
          minimum: 1,
          description: 'The unique CustomGPT agent identifier used in project path parameters.',
        },
        width: {
          type: 'string',
          minLength: 1,
          description: 'Embed-code width to request from CustomGPT.',
        },
        height: {
          type: 'string',
          minLength: 1,
          description: 'Embed-code height to request from CustomGPT.',
        },
      },
      additionalProperties: false,
      required: ['projectId'],
      description: 'Input parameters for retrieving a CustomGPT agent.',
    },
  },
  {
    tool: 'oc_customgpt_list_agents',
    service: 'customgpt',
    actionId: 'customgpt.list_agents',
    description: 'List CustomGPT agents in the authenticated account with optional pagination.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
          description: 'Page number to retrieve. Page numbering starts at 1.',
        },
        duration: {
          type: 'integer',
          description: 'The duration filter for agents when supported by CustomGPT.',
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction for CustomGPT list results.',
        },
        orderBy: {
          type: 'string',
          enum: ['id', 'created_at'],
          description: 'CustomGPT field used to sort list results.',
        },
        width: {
          type: 'string',
          minLength: 1,
          description: 'Embed-code width to request from CustomGPT.',
        },
        height: {
          type: 'string',
          minLength: 1,
          description: 'Embed-code height to request from CustomGPT.',
        },
        name: { type: 'string', minLength: 1, description: 'Agent name filter.' },
      },
      additionalProperties: false,
      description: 'Input parameters for listing CustomGPT agents.',
    },
  },
  {
    tool: 'oc_customgpt_list_conversations',
    service: 'customgpt',
    actionId: 'customgpt.list_conversations',
    description: 'List conversations for a CustomGPT agent.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'integer',
          minimum: 1,
          description: 'The unique CustomGPT agent identifier used in project path parameters.',
        },
        page: {
          type: 'integer',
          minimum: 1,
          description: 'Page number to retrieve. Page numbering starts at 1.',
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction for CustomGPT list results.',
        },
        orderBy: {
          type: 'string',
          enum: ['id', 'created_at'],
          description: 'CustomGPT field used to sort list results.',
        },
        userFilter: {
          type: 'string',
          enum: ['all', 'anonymous', 'team_member', 'me'],
          description: 'Conversation user-type filter.',
        },
        name: { type: 'string', minLength: 1, description: 'Conversation name filter.' },
        lastUpdatedAfter: {
          type: 'string',
          description: 'Return conversations updated after this timestamp.',
          format: 'date-time',
        },
      },
      additionalProperties: false,
      required: ['projectId'],
      description: 'Input parameters for listing CustomGPT conversations.',
    },
  },
  {
    tool: 'oc_deck_co_get_agent',
    service: 'deck_co',
    actionId: 'deck_co.get_agent',
    description: 'Retrieve a Deck.co agent by ID, including its task summaries.',
    parameters: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          minLength: 1,
          description: 'Unique identifier for the agent, prefixed with agt_.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for retrieving a Deck.co agent.',
    },
  },
  {
    tool: 'oc_deck_co_get_source',
    service: 'deck_co',
    actionId: 'deck_co.get_source',
    description: 'Retrieve a Deck.co source by ID.',
    parameters: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          minLength: 1,
          description: 'Unique identifier for the source, prefixed with src_.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for retrieving a Deck.co source.',
    },
  },
  {
    tool: 'oc_deck_co_list_agents',
    service: 'deck_co',
    actionId: 'deck_co.list_agents',
    description: 'List Deck.co agents with cursor pagination.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of items to return. Deck.co allows 1 to 100.',
        },
        cursor: {
          type: 'string',
          minLength: 1,
          description: 'Opaque cursor string returned by a previous Deck.co page.',
        },
      },
      additionalProperties: false,
      description: 'Cursor pagination parameters for Deck.co list endpoints.',
    },
  },
  {
    tool: 'oc_deepgram_get_model',
    service: 'deepgram',
    actionId: 'deepgram.get_model',
    description: 'Get metadata for one public Deepgram model.',
    parameters: {
      type: 'object',
      properties: {
        modelId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the Deepgram model.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      description: 'The input payload for retrieving a Deepgram model.',
    },
  },
  {
    tool: 'oc_deepgram_get_project',
    service: 'deepgram',
    actionId: 'deepgram.get_project',
    description: 'Get details for one Deepgram project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the Deepgram project.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      description: 'The input payload for retrieving a Deepgram project.',
    },
  },
  {
    tool: 'oc_deepgram_get_project_model',
    service: 'deepgram',
    actionId: 'deepgram.get_project_model',
    description: 'Get metadata for one model available to a Deepgram project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the Deepgram project.',
          pattern: '\\S',
        },
        modelId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the Deepgram model.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      description: 'The input payload for retrieving a model available to a Deepgram project.',
    },
  },
  {
    tool: 'oc_deepl_get_usage',
    service: 'deepl',
    actionId: 'deepl.get_usage',
    description: 'Fetch the current DeepL API usage and quota counters for the connected API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'This action does not require additional input parameters.',
    },
  },
  {
    tool: 'oc_deepl_list_supported_languages',
    service: 'deepl',
    actionId: 'deepl.list_supported_languages',
    description:
      'List the DeepL source or target languages currently supported by the translation API.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['source', 'target'],
          description: 'Whether to list source or target languages.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for listing DeepL supported languages.',
    },
  },
  {
    tool: 'oc_detect_language_get_account_status',
    service: 'detect_language',
    actionId: 'detect_language.get_account_status',
    description: 'Get the current Detect Language account usage, limits, plan, and status.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Input parameters for retrieving Detect Language account status.',
    },
  },
  {
    tool: 'oc_detect_language_detect_text',
    service: 'detect_language',
    actionId: 'detect_language.detect_text',
    description: 'Detect the language of a single text string with confidence scores.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          minLength: 1,
          description: 'The UTF-8 text to detect.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for detecting the language of one text string.',
    },
  },
  {
    tool: 'oc_detect_language_detect_texts',
    service: 'detect_language',
    actionId: 'detect_language.detect_texts',
    description: 'Detect languages for multiple text strings in one batch request.',
    parameters: {
      type: 'object',
      properties: {
        texts: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1,
            description: 'The UTF-8 text to detect.',
            pattern: '\\S',
          },
          description: 'The UTF-8 texts to detect, preserving output order.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      description: 'Input parameters for detecting languages for multiple texts.',
    },
  },
  {
    tool: 'oc_devin_get_self',
    service: 'devin',
    actionId: 'devin.get_self',
    description: 'Get identity information for the authenticated Devin API credential.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for getting the authenticated Devin principal.',
    },
  },
  {
    tool: 'oc_devin_get_session',
    service: 'devin',
    actionId: 'devin.get_session',
    description: 'Get details for one Devin organization session.',
    parameters: {
      type: 'object',
      properties: {
        orgId: {
          type: 'string',
          minLength: 1,
          description: 'The Devin organization ID, usually prefixed with org-.',
        },
        devinId: {
          type: 'string',
          minLength: 1,
          description: 'The Devin session ID, usually prefixed with devin-.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for getting a Devin session.',
    },
  },
  {
    tool: 'oc_devin_list_sessions',
    service: 'devin',
    actionId: 'devin.list_sessions',
    description:
      'List Devin organization sessions with optional filters using cursor-based pagination.',
    parameters: {
      type: 'object',
      properties: {
        orgId: {
          type: 'string',
          minLength: 1,
          description: 'The Devin organization ID, usually prefixed with org-.',
        },
        first: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'The maximum number of sessions to return.',
        },
        after: {
          type: 'string',
          minLength: 1,
          description: 'The pagination cursor returned by a previous list_sessions call.',
        },
        devinId: {
          type: 'string',
          minLength: 1,
          description: 'Filter results to one Devin session ID.',
        },
        sessionIds: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'One Devin session ID.' },
          description: 'Filter results by Devin session IDs.',
        },
        userIds: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'One Devin user ID.' },
          description: 'Filter results by Devin user IDs.',
        },
        serviceUserIds: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'One Devin service user ID.' },
          description: 'Filter results by Devin service user IDs.',
        },
        repoNames: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'One repository name.' },
          description: 'Filter results by repository names such as owner/repo.',
        },
        tags: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'One session tag.' },
          description: 'Filter results by session tags.',
        },
        origins: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'webapp',
              'slack',
              'teams',
              'api',
              'linear',
              'jira',
              'automation',
              'cli',
              'desktop',
              'code_scan',
              'other',
            ],
            description: 'The origin from which the Devin session was created.',
          },
          description: 'Filter results by session origins.',
        },
        category: {
          type: 'string',
          enum: [
            'bug_fixing',
            'ci_cd_and_devops',
            'code_quality_and_security',
            'code_review',
            'code_review_and_analysis',
            'data_and_automation',
            'documentation_and_content',
            'feature_development',
            'migrations_and_upgrades',
            'other',
            'refactoring_and_optimization',
            'research_and_exploration',
            'security',
            'unit_test_generation',
          ],
          description: 'The Devin-assigned session category.',
        },
        isArchived: { type: 'boolean', description: 'Filter results by archived state.' },
        createdAfter: {
          type: 'integer',
          description: 'Only include sessions created after this Unix timestamp.',
        },
        createdBefore: {
          type: 'integer',
          description: 'Only include sessions created before this Unix timestamp.',
        },
        updatedAfter: {
          type: 'integer',
          description: 'Only include sessions updated after this Unix timestamp.',
        },
        updatedBefore: {
          type: 'integer',
          description: 'Only include sessions updated before this Unix timestamp.',
        },
        playbookId: { type: 'string', minLength: 1, description: 'Filter results by playbook ID.' },
        scheduleId: { type: 'string', minLength: 1, description: 'Filter results by schedule ID.' },
      },
      additionalProperties: false,
      required: ['orgId'],
      description: 'The input payload for listing Devin sessions.',
    },
  },
  {
    tool: 'oc_diffbot_extract_article',
    service: 'diffbot',
    actionId: 'diffbot.extract_article',
    description:
      'Extract article content and metadata from a public URL using Diffbot Article API.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The public article URL to extract with Diffbot.',
          format: 'uri',
        },
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['links', 'extlinks', 'meta', 'querystring', 'breadcrumb', 'quotes'],
            description: 'An optional Diffbot article field to request.',
          },
          description: 'Optional Diffbot article fields to include in the response.',
          minItems: 1,
        },
        timeout: {
          type: 'integer',
          minimum: 1,
          description: 'The upstream page retrieval timeout in milliseconds.',
        },
        renderDelay: {
          type: 'integer',
          minimum: 0,
          description: 'The extra delay in milliseconds before extraction.',
        },
        scroll: {
          type: 'string',
          enum: ['fast', 'slow'],
          description: 'The scrolling mode Diffbot should use to trigger lazy-loaded content.',
        },
        proxy: {
          type: 'string',
          minLength: 1,
          description: 'The custom proxy IP address Diffbot should use to fetch the target page.',
        },
        proxyAuth: {
          type: 'string',
          minLength: 1,
          description: 'The proxy authentication string sent with the custom proxy.',
        },
        useProxy: {
          type: 'string',
          enum: ['default', 'none'],
          description: 'Whether Diffbot should force its default proxy or disable proxy usage.',
        },
        paging: {
          type: 'boolean',
          description: 'Whether Diffbot should automatically concatenate multi-page articles.',
        },
        maxTags: {
          type: 'integer',
          minimum: 0,
          description: 'The maximum number of auto-generated tags to return.',
        },
        tagConfidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'The minimum relevance score required for returned tags.',
        },
        categoryConfidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'The minimum relevance score required for returned categories.',
        },
        discussion: {
          type: 'boolean',
          description: 'Whether Diffbot should extract article comments and discussions.',
        },
        naturalLanguage: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'entities',
              'sentiment',
              'summary',
              'facts',
              'openFacts',
              'records',
              'categories',
              'sentences',
              'language',
            ],
            description: 'A Diffbot Natural Language feature to enable.',
          },
          description: 'The Diffbot Natural Language features to enable for the article.',
          minItems: 1,
        },
        summaryNumSentences: {
          type: 'integer',
          minimum: 1,
          description: 'The maximum number of summary sentences when summary analysis is enabled.',
        },
      },
      additionalProperties: false,
      required: ['url'],
      description: 'The input payload for extracting one article from a public URL with Diffbot.',
    },
  },
  {
    tool: 'oc_docsbot_ai_fetch_document',
    service: 'docsbot_ai',
    actionId: 'docsbot_ai.fetch_document',
    description: 'Fetch the full reconstructed document text for a DocsBot search result file ID.',
    parameters: {
      type: 'object',
      properties: {
        teamId: { type: 'string', minLength: 1, description: 'The DocsBot team ID.' },
        botId: { type: 'string', minLength: 1, description: 'The DocsBot bot ID.' },
        fileId: {
          type: 'string',
          minLength: 1,
          description: 'The DocsBot file ID returned by semantic_search.',
        },
      },
      additionalProperties: false,
      description: 'Input for fetching a reconstructed DocsBot document.',
    },
  },
  {
    tool: 'oc_docsbot_ai_get_bot',
    service: 'docsbot_ai',
    actionId: 'docsbot_ai.get_bot',
    description: 'Get a DocsBot bot by team and bot ID.',
    parameters: {
      type: 'object',
      properties: {
        teamId: { type: 'string', minLength: 1, description: 'The DocsBot team ID.' },
        botId: { type: 'string', minLength: 1, description: 'The DocsBot bot ID.' },
      },
      additionalProperties: false,
      description: 'Input for retrieving a DocsBot bot.',
    },
  },
  {
    tool: 'oc_docsbot_ai_get_team',
    service: 'docsbot_ai',
    actionId: 'docsbot_ai.get_team',
    description: 'Get a DocsBot team by ID.',
    parameters: {
      type: 'object',
      properties: { teamId: { type: 'string', minLength: 1, description: 'The DocsBot team ID.' } },
      additionalProperties: false,
      description: 'Input for retrieving a DocsBot team.',
    },
  },
  {
    tool: 'oc_docsumo_get_account_info',
    service: 'docsumo',
    actionId: 'docsumo.get_account_info',
    description:
      'Get Docsumo account details, monthly document quota usage, and the currently enabled document types.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for retrieving account info.',
    },
  },
  {
    tool: 'oc_docsumo_get_document_detail',
    service: 'docsumo',
    actionId: 'docsumo.get_document_detail',
    description:
      'Get Docsumo document detail metadata for one document, including page information and preview assets.',
    parameters: {
      type: 'object',
      properties: {
        docId: {
          type: 'string',
          minLength: 1,
          description: 'The Docsumo document identifier to retrieve.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for retrieving one Docsumo document detail record.',
    },
  },
  {
    tool: 'oc_docsumo_get_documents_summary',
    service: 'docsumo',
    actionId: 'docsumo.get_documents_summary',
    description:
      'Get the Docsumo documents summary grouped by document type, including disabled types and status counts.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for documents summary.',
    },
  },
  {
    tool: 'oc_e2b_get_sandbox',
    service: 'e2b',
    actionId: 'e2b.get_sandbox',
    description: 'Get one E2B sandbox by sandbox identifier.',
    parameters: {
      type: 'object',
      properties: {
        sandboxID: {
          type: 'string',
          minLength: 1,
          description: 'The E2B sandbox identifier.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      description: 'The input payload for selecting an E2B sandbox.',
    },
  },
  {
    tool: 'oc_e2b_list_sandboxes',
    service: 'e2b',
    actionId: 'e2b.list_sandboxes',
    description: 'List E2B sandboxes visible to the current API key.',
    parameters: {
      type: 'object',
      properties: {
        metadata: {
          type: 'string',
          minLength: 1,
          description:
            'Metadata query used to filter sandboxes, such as "user=abc&app=prod". Keys and values must already be URL encoded.',
        },
        state: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['running', 'paused'],
            description: 'The E2B sandbox lifecycle state.',
          },
          description: 'Sandbox states used to filter the list.',
          minItems: 1,
        },
        nextToken: {
          type: 'string',
          minLength: 1,
          description: 'Cursor returned by E2B for the next page.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of sandboxes to return per page.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for listing E2B sandboxes.',
    },
  },
  {
    tool: 'oc_eagle_doc_get_current_usage',
    service: 'eagle_doc',
    actionId: 'eagle_doc.get_current_usage',
    description:
      'Fetch the current billing-month usage counters for the connected Eagle Doc API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for the current usage endpoint.',
    },
  },
  {
    tool: 'oc_eagle_doc_get_quota',
    service: 'eagle_doc',
    actionId: 'eagle_doc.get_quota',
    description:
      'Fetch the overall Eagle Doc management quota summary tied to the connected API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for the management quota endpoint.',
    },
  },
  {
    tool: 'oc_eagle_doc_list_monthly_usage',
    service: 'eagle_doc',
    actionId: 'eagle_doc.list_monthly_usage',
    description:
      'List Eagle Doc monthly usage history together with pricing metadata for each month returned.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for the monthly usage history endpoint.',
    },
  },
  {
    tool: 'oc_edenai_list_models',
    service: 'edenai',
    actionId: 'edenai.list_models',
    description: 'List the Eden AI models available to the current API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for this action.',
    },
  },
  {
    tool: 'oc_elevenlabs_get_audio_from_history_item',
    service: 'elevenlabs',
    actionId: 'elevenlabs.get_audio_from_history_item',
    description:
      'Download the audio for one ElevenLabs history item and upload the binary result to connector transit storage.',
    parameters: {
      type: 'object',
      properties: {
        historyItemId: {
          type: 'string',
          minLength: 1,
          description: 'The history item ID whose audio should be downloaded.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_elevenlabs_get_generated_items',
    service: 'elevenlabs',
    actionId: 'elevenlabs.get_generated_items',
    description:
      'List generated ElevenLabs history items with pagination and optional voice filtering.',
    parameters: {
      type: 'object',
      properties: {
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'The maximum number of history items to return.',
        },
        voiceId: { type: 'string', description: 'Filter history items by voice ID.' },
        startAfterHistoryItemId: {
          type: 'string',
          description: 'The history item ID to continue pagination after.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_elevenlabs_get_history_item_by_id',
    service: 'elevenlabs',
    actionId: 'elevenlabs.get_history_item_by_id',
    description:
      'Get one ElevenLabs history item by history item ID without downloading its audio.',
    parameters: {
      type: 'object',
      properties: {
        historyItemId: {
          type: 'string',
          minLength: 1,
          description: 'The history item ID to retrieve.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_elevenreader_get_models',
    service: 'elevenreader',
    actionId: 'elevenreader.get_models',
    description: 'List available ElevenLabs speech synthesis models for reading text aloud.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required for this action.',
    },
  },
  {
    tool: 'oc_elevenreader_get_user_info',
    service: 'elevenreader',
    actionId: 'elevenreader.get_user_info',
    description: 'Get the current ElevenReader user profile and subscription snapshot.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required for this action.',
    },
  },
  {
    tool: 'oc_elevenreader_get_voice',
    service: 'elevenreader',
    actionId: 'elevenreader.get_voice',
    description: 'Get one ElevenLabs voice by voice ID before using it to read text aloud.',
    parameters: {
      type: 'object',
      properties: {
        voiceId: { type: 'string', minLength: 1, description: 'The unique voice identifier.' },
        withSettings: {
          type: 'boolean',
          description: 'Whether to include voice settings in the response.',
        },
      },
      additionalProperties: false,
      required: ['voiceId'],
      description: 'The voice lookup request.',
    },
  },
];
