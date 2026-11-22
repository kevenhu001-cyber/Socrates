/* Reviewed OpenConnector chat tools, part 6 of 7.
 * Data only: the allow-list rationale lives in openConnectorChatToolCatalog.ts.
 * Keep entries in the original reviewed order. */

import type { OpenConnectorChatTool } from './openConnectorChatToolCatalog.types.js';

export const OPEN_CONNECTOR_CHAT_TOOLS_PART_6: OpenConnectorChatTool[] = [
  {
    tool: 'oc_airbrake_get_deploy',
    service: 'airbrake',
    actionId: 'airbrake.get_deploy',
    description: 'Get details for one Airbrake deploy.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'integer',
          minimum: 1,
          description: 'The Airbrake project integer identifier.',
        },
        deployId: {
          type: 'integer',
          minimum: 1,
          description: 'The Airbrake deploy integer identifier.',
        },
      },
      additionalProperties: false,
      required: ['projectId', 'deployId'],
      description: 'Input parameters for an Airbrake deploy.',
    },
  },
  {
    tool: 'oc_airbrake_get_group',
    service: 'airbrake',
    actionId: 'airbrake.get_group',
    description: 'Get details for one Airbrake error group.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'integer',
          minimum: 1,
          description: 'The Airbrake project integer identifier.',
        },
        groupId: {
          type: 'integer',
          minimum: 1,
          description: 'The Airbrake group integer identifier.',
        },
      },
      additionalProperties: false,
      required: ['projectId', 'groupId'],
      description: 'Input parameters for an Airbrake group.',
    },
  },
  {
    tool: 'oc_aivoov_list_voices',
    service: 'aivoov',
    actionId: 'aivoov.list_voices',
    description: 'List available AiVOOV voices, optionally filtered by language code.',
    parameters: {
      type: 'object',
      properties: {
        languageCode: {
          type: 'string',
          minLength: 1,
          description: 'The language code used to filter voices.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for listing AiVOOV voices.',
    },
  },
  {
    tool: 'oc_alt_text_ai_get_account',
    service: 'alt_text_ai',
    actionId: 'alt_text_ai.get_account',
    description: 'Retrieve AltText.ai account settings and usage details for the API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required to retrieve account settings.',
    },
  },
  {
    tool: 'oc_alt_text_ai_get_image',
    service: 'alt_text_ai',
    actionId: 'alt_text_ai.get_image',
    description: 'Retrieve a single AltText.ai image record by asset ID.',
    parameters: {
      type: 'object',
      properties: {
        asset_id: {
          type: 'string',
          minLength: 1,
          description: 'The unique asset ID of the image to retrieve.',
        },
      },
      additionalProperties: false,
      description: 'Input for retrieving a specific image by asset ID.',
    },
  },
  {
    tool: 'oc_alt_text_ai_list_images',
    service: 'alt_text_ai',
    actionId: 'alt_text_ai.list_images',
    description: 'List image records in the AltText.ai library with optional URL filtering.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
          description: 'Page number to retrieve, starting at 1.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Number of images per page, up to 100.',
        },
        url: {
          type: 'string',
          description: 'Exact image URL used to filter results.',
          format: 'uri',
        },
      },
      additionalProperties: false,
      description: 'Pagination and filtering input for listing image records.',
    },
  },
  {
    tool: 'oc_anchor_browser_get_billing_info',
    service: 'anchor_browser',
    actionId: 'anchor_browser.get_billing_info',
    description:
      'Retrieve Anchor Browser project billing balance, usage, tier, and browser limits.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Input for retrieving Anchor Browser billing information.',
    },
  },
  {
    tool: 'oc_anchor_browser_get_project_metadata',
    service: 'anchor_browser',
    actionId: 'anchor_browser.get_project_metadata',
    description: 'Retrieve lightweight Anchor Browser project metadata by project ID.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'The Anchor Browser project ID.' },
      },
      additionalProperties: false,
      description: 'Input for retrieving Anchor Browser project metadata.',
    },
  },
  {
    tool: 'oc_anthropic_admin_get_organization',
    service: 'anthropic_admin',
    actionId: 'anthropic_admin.get_organization',
    description: 'Retrieve the Anthropic organization associated with the Admin API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for retrieving the Anthropic organization.',
    },
  },
  {
    tool: 'oc_anthropic_admin_list_api_keys',
    service: 'anthropic_admin',
    actionId: 'anthropic_admin.list_api_keys',
    description: 'List Anthropic API keys in the organization, optionally filtered by workspace.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          minLength: 1,
          description: 'Only return API keys belonging to this workspace.',
        },
        before_id: {
          type: 'string',
          minLength: 1,
          description: 'Return API keys before this API key identifier.',
        },
        after_id: {
          type: 'string',
          minLength: 1,
          description: 'Return API keys after this API key identifier.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'The maximum number of API keys to return.',
        },
      },
      additionalProperties: false,
      description: 'The filters and pagination parameters for listing Anthropic API keys.',
    },
  },
  {
    tool: 'oc_anthropic_admin_list_invites',
    service: 'anthropic_admin',
    actionId: 'anthropic_admin.list_invites',
    description: 'List pending or historical Anthropic organization invites.',
    parameters: {
      type: 'object',
      properties: {
        before_id: {
          type: 'string',
          minLength: 1,
          description: 'Return objects before this object identifier.',
        },
        after_id: {
          type: 'string',
          minLength: 1,
          description: 'Return objects after this object identifier.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'The maximum number of objects to return.',
        },
      },
      additionalProperties: false,
      description: 'Cursor pagination parameters for Anthropic Admin API list endpoints.',
    },
  },
  {
    tool: 'oc_anysearch_extract',
    service: 'anysearch',
    actionId: 'anysearch.extract',
    description: 'Fetch an HTML page through AnySearch and return its cleaned content as Markdown.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The HTTP or HTTPS page URL to fetch and convert to Markdown.',
          format: 'uri',
        },
      },
      additionalProperties: false,
      description: 'The page to extract through AnySearch.',
    },
  },
  {
    tool: 'oc_anysearch_get_sub_domains',
    service: 'anysearch',
    actionId: 'anysearch.get_sub_domains',
    description:
      'Discover AnySearch vertical sub-domains and their required parameters before running a specialized search.',
    parameters: {
      oneOf: [
        {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              enum: [
                'general',
                'resource',
                'social_media',
                'finance',
                'academic',
                'legal',
                'health',
                'business',
                'security',
                'ip',
                'code',
                'energy',
                'environment',
                'agriculture',
                'travel',
                'film',
                'gaming',
              ],
            },
          },
          additionalProperties: false,
          description: 'Discover capabilities for one AnySearch domain.',
        },
        {
          type: 'object',
          properties: {
            domains: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'general',
                  'resource',
                  'social_media',
                  'finance',
                  'academic',
                  'legal',
                  'health',
                  'business',
                  'security',
                  'ip',
                  'code',
                  'energy',
                  'environment',
                  'agriculture',
                  'travel',
                  'film',
                  'gaming',
                ],
                description: 'One AnySearch vertical domain.',
              },
              minItems: 1,
              maxItems: 5,
            },
          },
          additionalProperties: false,
          description: 'Discover capabilities for multiple AnySearch domains.',
        },
      ],
      description: 'One domain or a batch of up to five domains to discover.',
      additionalProperties: false,
    },
  },
  {
    tool: 'oc_anysearch_search',
    service: 'anysearch',
    actionId: 'anysearch.search',
    description:
      "Search AnySearch's automatically routed data sources and return structured source results.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'The search query to execute.' },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'The maximum number of search results to return.',
        },
        domain: {
          type: 'string',
          enum: [
            'general',
            'code',
            'tech',
            'fashion',
            'travel',
            'home',
            'ecommerce',
            'gaming',
            'film',
            'music',
            'finance',
            'academic',
            'legal',
            'business',
            'ip',
            'security',
            'education',
            'health',
            'religion',
            'geo',
            'environment',
            'energy',
          ],
          description: 'The top-level domain used to route the search.',
        },
        tag: {
          type: 'string',
          minLength: 1,
          description:
            'A sub-domain capability tag, such as code.doc. Use a sub-domain returned by get_sub_domains when possible.',
        },
        content_types: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'One AnySearch content type.' },
          description: 'Content types to include, such as web, news, or doc.',
          minItems: 1,
        },
        zone: {
          type: 'string',
          enum: ['cn', 'intl'],
          description: 'The regional search zone used by AnySearch.',
        },
        language: {
          type: 'string',
          minLength: 1,
          description: 'The preferred result language, such as zh-CN or en.',
        },
        params: {
          type: 'object',
          additionalProperties: { description: 'A tag-specific parameter value.' },
          description:
            'Parameters required by the selected tag. Use values returned by get_sub_domains when possible.',
        },
      },
      additionalProperties: false,
      required: ['query'],
      description: 'The input payload for an AnySearch unified REST search request.',
    },
  },
  {
    tool: 'oc_apipie_ai_list_detailed_models',
    service: 'apipie_ai',
    actionId: 'apipie_ai.list_detailed_models',
    description: 'List detailed APIpie AI model metadata available to the current API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for this action.',
    },
  },
  {
    tool: 'oc_apipie_ai_list_models',
    service: 'apipie_ai',
    actionId: 'apipie_ai.list_models',
    description: 'List the APIpie AI models available to the current API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for this action.',
    },
  },
  {
    tool: 'oc_assemblyai_get_transcript',
    service: 'assemblyai',
    actionId: 'assemblyai.get_transcript',
    description: 'Get one AssemblyAI transcript by ID.',
    parameters: {
      type: 'object',
      properties: {
        transcriptId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the AssemblyAI transcript.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for retrieving an AssemblyAI transcript.',
    },
  },
  {
    tool: 'oc_assemblyai_get_transcript_paragraphs',
    service: 'assemblyai',
    actionId: 'assemblyai.get_transcript_paragraphs',
    description: 'Get an AssemblyAI transcript split into paragraphs.',
    parameters: {
      type: 'object',
      properties: {
        transcriptId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the AssemblyAI transcript.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for retrieving transcript paragraphs.',
    },
  },
  {
    tool: 'oc_assemblyai_get_transcript_sentences',
    service: 'assemblyai',
    actionId: 'assemblyai.get_transcript_sentences',
    description: 'Get an AssemblyAI transcript split into sentences.',
    parameters: {
      type: 'object',
      properties: {
        transcriptId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the AssemblyAI transcript.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for retrieving transcript sentences.',
    },
  },
  {
    tool: 'oc_botpress_get_bot',
    service: 'botpress',
    actionId: 'botpress.get_bot',
    description: 'Get details for one Botpress bot in the connected workspace.',
    parameters: {
      type: 'object',
      properties: { botId: { type: 'string', minLength: 1, description: 'The Botpress bot ID.' } },
      additionalProperties: false,
      description: 'Input identifying one Botpress bot.',
    },
  },
  {
    tool: 'oc_botpress_list_bots',
    service: 'botpress',
    actionId: 'botpress.list_bots',
    description: 'List Botpress bots in the connected workspace.',
    parameters: {
      type: 'object',
      properties: {
        dev: {
          type: 'boolean',
          description: 'Whether to return development bots instead of production bots.',
        },
        tags: {
          type: 'object',
          additionalProperties: {
            type: 'string',
            minLength: 1,
            description: 'A Botpress tag value.',
          },
          description: 'Botpress tags to filter by.',
        },
        nextToken: {
          type: 'string',
          minLength: 1,
          description: 'The Botpress meta.nextToken value from the previous response.',
        },
        sortField: {
          type: 'string',
          enum: ['createdAt', 'updatedAt'],
          description: 'The Botpress field to sort by.',
        },
        sortDirection: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'The Botpress sort direction.',
        },
      },
      additionalProperties: false,
      description: 'Input for listing Botpress bots in the connected workspace.',
    },
  },
  {
    tool: 'oc_botpress_list_workspaces',
    service: 'botpress',
    actionId: 'botpress.list_workspaces',
    description: 'List Botpress workspaces accessible to the connected API token.',
    parameters: {
      type: 'object',
      properties: {
        nextToken: {
          type: 'string',
          minLength: 1,
          description: 'The Botpress meta.nextToken value from the previous response.',
        },
        handle: {
          type: 'string',
          minLength: 1,
          description: 'The Botpress workspace handle to filter by.',
        },
      },
      additionalProperties: false,
      description: 'Input for listing Botpress workspaces.',
    },
  },
  {
    tool: 'oc_botsonic_get_conversation',
    service: 'botsonic',
    actionId: 'botsonic.get_conversation',
    description: 'Get one Botsonic conversation by chat identifier.',
    parameters: {
      type: 'object',
      properties: {
        chat_id: {
          type: 'string',
          description: 'The Botsonic conversation chat identifier.',
          format: 'uuid',
        },
      },
      additionalProperties: false,
      description: 'The input payload for fetching one Botsonic conversation.',
    },
  },
  {
    tool: 'oc_botsonic_list_conversations',
    service: 'botsonic',
    actionId: 'botsonic.list_conversations',
    description: 'List conversations for the connected Botsonic bot token.',
    parameters: {
      type: 'object',
      properties: {
        search_query: {
          type: 'string',
          minLength: 1,
          description: 'Search query used to match Botsonic conversations.',
        },
        sort_by: {
          type: 'string',
          enum: ['recent', 'negative', 'positive'],
          description: 'The conversation sorting mode.',
        },
        sort_order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'The conversation sorting order.',
        },
        updated_after: {
          type: 'string',
          description: 'Filter conversations updated after this ISO 8601 timestamp.',
          format: 'date-time',
        },
        updated_before: {
          type: 'string',
          description: 'Filter conversations updated before this ISO 8601 timestamp.',
          format: 'date-time',
        },
        page: {
          type: 'integer',
          minimum: 1,
          description: 'The page number to request from Botsonic.',
        },
        size: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'The number of conversations to request from Botsonic.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for listing Botsonic conversations.',
    },
  },
  {
    tool: 'oc_botsonic_list_faqs',
    service: 'botsonic',
    actionId: 'botsonic.list_faqs',
    description: 'List FAQs attached to the connected Botsonic bot token.',
    parameters: {
      type: 'object',
      properties: {
        search_query: {
          type: 'string',
          minLength: 1,
          description: 'Search query used to match Botsonic FAQs.',
        },
        sort_by: {
          type: 'string',
          enum: [
            'id',
            'bot_id',
            'question',
            'answer',
            'error_reason',
            'status',
            'characters',
            'migration_status',
            'created_at',
            'updated_at',
          ],
          description: 'The FAQ attribute to sort by.',
        },
        sort_order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'The FAQ sorting order.',
        },
        page: {
          type: 'integer',
          minimum: 1,
          description: 'The page number to request from Botsonic.',
        },
        size: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'The number of FAQs to request from Botsonic.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for listing Botsonic FAQs.',
    },
  },
  {
    tool: 'oc_browse_ai_get_robot',
    service: 'browse_ai',
    actionId: 'browse_ai.get_robot',
    description: 'Retrieve one Browse AI robot and its input parameter definitions by robot ID.',
    parameters: {
      type: 'object',
      properties: {
        robotId: { type: 'string', minLength: 1, description: 'The Browse AI robot ID.' },
      },
      additionalProperties: false,
      required: ['robotId'],
      description: 'The input for retrieving one Browse AI robot.',
    },
  },
  {
    tool: 'oc_browse_ai_get_robot_task',
    service: 'browse_ai',
    actionId: 'browse_ai.get_robot_task',
    description: 'Retrieve one Browse AI robot task and its captured data by robot and task IDs.',
    parameters: {
      type: 'object',
      properties: {
        robotId: { type: 'string', minLength: 1, description: 'The Browse AI robot ID.' },
        taskId: { type: 'string', minLength: 1, description: 'The Browse AI task ID.' },
      },
      additionalProperties: false,
      required: ['robotId', 'taskId'],
      description: 'The input for retrieving one Browse AI robot task.',
    },
  },
  {
    tool: 'oc_browse_ai_list_robot_tasks',
    service: 'browse_ai',
    actionId: 'browse_ai.list_robot_tasks',
    description: 'List Browse AI robot tasks with pagination and status filters.',
    parameters: {
      type: 'object',
      properties: {
        robotId: { type: 'string', minLength: 1, description: 'The Browse AI robot ID.' },
        page: { type: 'integer', minimum: 1, description: 'The Browse AI task list page number.' },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'The number of tasks to return per page.',
        },
        status: {
          type: 'string',
          enum: ['failed', 'successful', 'in-progress'],
          description: 'The Browse AI task status filter.',
        },
        robotBulkRunId: {
          type: 'string',
          description: 'The Browse AI bulk run ID used to filter tasks.',
        },
        sort: {
          type: 'string',
          description: 'The Browse AI sort expression, such as -createdAt,finishedAt.',
        },
        includeRetried: {
          type: 'boolean',
          description: 'Whether retried tasks should be included in the result.',
        },
        fromDate: { type: 'integer', description: 'A Unix timestamp in milliseconds.' },
        toDate: { type: 'integer', description: 'A Unix timestamp in milliseconds.' },
      },
      additionalProperties: false,
      required: ['robotId'],
      description: 'The input for listing Browse AI robot tasks.',
    },
  },
  {
    tool: 'oc_chatbotkit_fetch_bot',
    service: 'chatbotkit',
    actionId: 'chatbotkit.fetch_bot',
    description: 'Fetch a single ChatBotKit bot by ID.',
    parameters: {
      type: 'object',
      properties: {
        botId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the resource.',
        },
      },
      additionalProperties: false,
      required: ['botId'],
    },
  },
  {
    tool: 'oc_chatbotkit_fetch_conversation',
    service: 'chatbotkit',
    actionId: 'chatbotkit.fetch_conversation',
    description: 'Fetch a single ChatBotKit conversation by ID.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the resource.',
        },
      },
      additionalProperties: false,
      required: ['conversationId'],
    },
  },
  {
    tool: 'oc_chatbotkit_fetch_dataset',
    service: 'chatbotkit',
    actionId: 'chatbotkit.fetch_dataset',
    description: 'Fetch a single ChatBotKit dataset by ID.',
    parameters: {
      type: 'object',
      properties: {
        datasetId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the resource.',
        },
      },
      additionalProperties: false,
      required: ['datasetId'],
    },
  },
  {
    tool: 'oc_claid_ai_get_edit_task',
    service: 'claid_ai',
    actionId: 'claid_ai.get_edit_task',
    description:
      'Poll one Claid async image editing task by ID and return its current status plus the finished result when available.',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'integer', description: 'The Claid async task identifier.' } },
      additionalProperties: false,
      required: ['taskId'],
      description: 'The Claid async task to retrieve.',
    },
  },
  {
    tool: 'oc_codegen_get_agent_run',
    service: 'codegen',
    actionId: 'codegen.get_agent_run',
    description: 'Retrieve a single Codegen agent run status and result.',
    parameters: {
      type: 'object',
      properties: {
        org_id: {
          type: 'integer',
          minimum: 1,
          description:
            'The Codegen organization ID. Omit this field to use the organization ID saved with the credential.',
        },
        agent_run_id: {
          type: 'integer',
          minimum: 1,
          description: 'The Codegen agent run ID to retrieve.',
        },
      },
      additionalProperties: false,
      required: ['agent_run_id'],
      description: 'Input parameters for retrieving one Codegen agent run.',
    },
  },
  {
    tool: 'oc_codegen_get_current_user',
    service: 'codegen',
    actionId: 'codegen.get_current_user',
    description: 'Retrieve the Codegen user associated with the API token.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Input parameters for retrieving the current Codegen user.',
    },
  },
  {
    tool: 'oc_codegen_list_agent_runs',
    service: 'codegen',
    actionId: 'codegen.list_agent_runs',
    description: 'List Codegen agent runs for an organization.',
    parameters: {
      type: 'object',
      properties: {
        org_id: {
          type: 'integer',
          minimum: 1,
          description:
            'The Codegen organization ID. Omit this field to use the organization ID saved with the credential.',
        },
        user_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
        source_type: {
          anyOf: [
            {
              type: 'string',
              enum: [
                'LOCAL',
                'SLACK',
                'GITHUB',
                'GITHUB_CHECK_SUITE',
                'GITHUB_PR_REVIEW',
                'LINEAR',
                'API',
                'CHAT',
                'JIRA',
                'CLICKUP',
                'MONDAY',
                'SETUP_COMMANDS',
              ],
            },
            { type: 'null' },
          ],
        },
        skip: {
          type: 'integer',
          minimum: 0,
          description: 'The number of items to skip before returning results.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'The maximum number of items to return. Codegen allows 1 to 100.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for listing Codegen agent runs.',
    },
  },
  {
    tool: 'oc_context7_get_documentation_context',
    service: 'context7',
    actionId: 'context7.get_documentation_context',
    description: 'Retrieve relevant Context7 documentation and code snippets for a library.',
    parameters: {
      type: 'object',
      properties: {
        libraryId: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'The Context7 library ID, such as /vercel/next.js.',
          pattern: '^/[^/]+/[^/]+([/@][^/]+)?$',
        },
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'The original question or task used to rank results by relevance.',
        },
        fast: {
          type: 'boolean',
          description: 'Whether to skip LLM reranking and return faster vector-search results.',
        },
      },
      additionalProperties: false,
      required: ['libraryId', 'query'],
      description: 'Input for retrieving Context7 documentation context.',
    },
  },
  {
    tool: 'oc_context7_search_libraries',
    service: 'context7',
    actionId: 'context7.search_libraries',
    description: 'Search Context7 for libraries ranked against a question or task.',
    parameters: {
      type: 'object',
      properties: {
        libraryName: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'The library name to search for.',
        },
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'The original question or task used to rank results by relevance.',
        },
        fast: {
          type: 'boolean',
          description: 'Whether to skip LLM reranking and return faster vector-search results.',
        },
      },
      additionalProperties: false,
      required: ['libraryName', 'query'],
      description: 'Input for searching Context7 libraries.',
    },
  },
  {
    tool: 'oc_cursor_get_daily_usage_data',
    service: 'cursor',
    actionId: 'cursor.get_daily_usage_data',
    description:
      'Retrieve Cursor daily usage metrics for a team over a date range of up to 30 days.',
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'integer',
          description: 'The inclusive start date in epoch milliseconds.',
        },
        endDate: { type: 'integer', description: 'The inclusive end date in epoch milliseconds.' },
        page: { type: 'integer', minimum: 1, description: 'The 1-indexed page number to request.' },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'The number of users to return per page.',
        },
      },
      additionalProperties: false,
      required: ['startDate', 'endDate'],
      description: 'The input for retrieving Cursor daily usage data.',
    },
  },
  {
    tool: 'oc_cursor_get_team_spend',
    service: 'cursor',
    actionId: 'cursor.get_team_spend',
    description:
      'Retrieve Cursor team spending for the current billing cycle with optional search, sort, and pagination.',
    parameters: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          minLength: 1,
          description: 'Search text matched against user names and emails.',
        },
        sortBy: {
          type: 'string',
          enum: ['amount', 'date', 'user'],
          description: 'The field used to sort spending rows.',
        },
        sortDirection: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'The sort direction for spending rows.',
        },
        page: { type: 'integer', minimum: 1, description: 'The 1-indexed page number to request.' },
        pageSize: {
          type: 'integer',
          minimum: 1,
          description: 'The number of spending rows to return per page.',
        },
      },
      additionalProperties: false,
      description: 'The input for retrieving Cursor team spending.',
    },
  },
  {
    tool: 'oc_cursor_list_audit_logs',
    service: 'cursor',
    actionId: 'cursor.list_audit_logs',
    description:
      'List Cursor team audit log events with optional time, event type, user, search, and page filters.',
    parameters: {
      type: 'object',
      properties: {
        startTime: {
          type: 'string',
          minLength: 1,
          description:
            'The start time as a Cursor date shortcut, ISO timestamp, date, or Unix timestamp.',
        },
        endTime: {
          type: 'string',
          minLength: 1,
          description:
            'The end time as a Cursor date shortcut, ISO timestamp, date, or Unix timestamp.',
        },
        eventTypes: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'Cursor audit event types to include.',
          minItems: 1,
        },
        search: {
          type: 'string',
          minLength: 1,
          description: 'A search term used to filter audit events.',
        },
        page: { type: 'integer', minimum: 1, description: 'The 1-indexed page number to request.' },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'The number of records to return per page.',
        },
        users: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'User emails or encoded Cursor user IDs to filter by.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      description: 'The input for listing Cursor audit logs.',
    },
  },
];
