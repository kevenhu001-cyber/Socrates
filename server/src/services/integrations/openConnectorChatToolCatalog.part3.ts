/* Reviewed OpenConnector chat tools, part 3 of 7.
 * Data only: the allow-list rationale lives in openConnectorChatToolCatalog.ts.
 * Keep entries in the original reviewed order. */

import type { OpenConnectorChatTool } from './openConnectorChatToolCatalog.types.js';

export const OPEN_CONNECTOR_CHAT_TOOLS_PART_3: OpenConnectorChatTool[] = [
  {
    tool: 'oc_intercom_get_article',
    service: 'intercom',
    actionId: 'intercom.get_article',
    description: 'Get a single Intercom help center article by identifier.',
    parameters: {
      type: 'object',
      properties: {
        articleId: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { type: 'integer', minimum: 0 },
          ],
          description: 'Intercom resource identifier.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for reading a single Intercom article.',
    },
  },
  {
    tool: 'oc_twochat_get_api_usage_info',
    service: 'twochat',
    actionId: 'twochat.get_api_usage_info',
    description:
      'Fetch the current 2Chat account, rate limit, and usage counters for the connected API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required to retrieve the current 2Chat usage information.',
    },
  },
  {
    tool: 'oc_twochat_list_contacts',
    service: 'twochat',
    actionId: 'twochat.list_contacts',
    description:
      'List contacts from the connected 2Chat account, with optional pagination and channel filtering.',
    parameters: {
      type: 'object',
      properties: {
        pageNumber: {
          type: 'integer',
          minimum: 0,
          description: 'Optional page number to retrieve.',
        },
        resultsPerPage: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Optional page size to request from 2Chat, from 1 to 100.',
        },
        channelUuid: {
          type: 'string',
          minLength: 1,
          description: 'Optional connected number UUID used to filter contacts by channel.',
        },
      },
      additionalProperties: false,
      description: 'Parameters for listing contacts from 2Chat.',
    },
  },
  {
    tool: 'oc_twochat_list_webhooks',
    service: 'twochat',
    actionId: 'twochat.list_webhooks',
    description:
      'List the webhook subscriptions currently configured in the connected 2Chat account.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required to list the configured 2Chat webhooks.',
    },
  },
  {
    tool: 'oc_agent_mail_get_inbox_list_entry',
    service: 'agent_mail',
    actionId: 'agent_mail.get_inbox_list_entry',
    description: 'Get an allow or block list entry scoped to a specific AgentMail inbox.',
    parameters: {
      type: 'object',
      properties: {
        inbox_id: { type: 'string', minLength: 1, description: 'The AgentMail inbox identifier.' },
        direction: {
          type: 'string',
          enum: ['send', 'receive', 'reply'],
          description: 'Direction of the list entry.',
        },
        type: { type: 'string', enum: ['allow', 'block'], description: 'Type of list entry.' },
        entry: {
          type: 'string',
          minLength: 1,
          description: 'The email address or domain list entry.',
        },
      },
      additionalProperties: false,
      description: 'Path parameters for fetching an AgentMail inbox list entry.',
    },
  },
  {
    tool: 'oc_agent_mail_get_list_entry',
    service: 'agent_mail',
    actionId: 'agent_mail.get_list_entry',
    description: 'Get a global AgentMail allow or block list entry.',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['send', 'receive', 'reply'],
          description: 'Direction of the list entry.',
        },
        type: { type: 'string', enum: ['allow', 'block'], description: 'Type of list entry.' },
        entry: {
          type: 'string',
          minLength: 1,
          description: 'The email address or domain list entry.',
        },
      },
      additionalProperties: false,
      description: 'Path parameters for fetching an AgentMail list entry.',
    },
  },
  {
    tool: 'oc_agent_mail_get_pod_list_entry',
    service: 'agent_mail',
    actionId: 'agent_mail.get_pod_list_entry',
    description: 'Get an AgentMail allow or block list entry scoped to a pod.',
    parameters: {
      type: 'object',
      properties: {
        pod_id: { type: 'string', minLength: 1, description: 'The AgentMail pod identifier.' },
        direction: {
          type: 'string',
          enum: ['send', 'receive', 'reply'],
          description: 'Direction of the list entry.',
        },
        type: { type: 'string', enum: ['allow', 'block'], description: 'Type of list entry.' },
        entry: {
          type: 'string',
          minLength: 1,
          description: 'The email address or domain list entry.',
        },
      },
      additionalProperties: false,
      description: 'Path parameters for fetching an AgentMail pod list entry.',
    },
  },
  {
    tool: 'oc_agora_get_project',
    service: 'agora',
    actionId: 'agora.get_project',
    description: 'Retrieve one Agora Console project by project ID and name.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'An Agora Console project ID.' },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 255,
          description: 'The Agora Console project name.',
        },
      },
      additionalProperties: false,
      description: 'Input for retrieving one Agora Console project.',
    },
  },
  {
    tool: 'oc_agora_get_project_usage',
    service: 'agora',
    actionId: 'agora.get_project_usage',
    description: 'Retrieve usage data for one Agora Console project and business type.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'An Agora Console project ID.' },
        fromDate: {
          type: 'string',
          description: 'The inclusive usage start date in YYYY-MM-DD format.',
          format: 'date',
        },
        toDate: {
          type: 'string',
          description: 'The inclusive usage end date in YYYY-MM-DD format.',
          format: 'date',
        },
        business: {
          type: 'string',
          enum: ['default', 'transcodeDuration', 'recording', 'cloudRecording', 'miniapp'],
          description: 'The Agora usage business type.',
        },
      },
      additionalProperties: false,
      description: 'Input for retrieving Agora project usage.',
    },
  },
  {
    tool: 'oc_agora_list_projects',
    service: 'agora',
    actionId: 'agora.list_projects',
    description: 'List Agora Console projects for the connected account.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required to list Agora projects.',
    },
  },
  {
    tool: 'oc_aircall_get_call',
    service: 'aircall',
    actionId: 'aircall.get_call',
    description: 'Retrieve one Aircall call by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 1, description: 'The Aircall numeric resource ID.' },
        fetchContact: {
          type: 'boolean',
          description: 'Whether Aircall should include contact details for the call.',
        },
        fetchShortUrls: {
          type: 'boolean',
          description: 'Whether Aircall should include shortened recording URLs.',
        },
        fetchCallTimeline: {
          type: 'boolean',
          description: 'Whether Aircall should include call timeline details.',
        },
      },
      additionalProperties: false,
      required: ['id'],
      description: 'Input for retrieving one Aircall call.',
    },
  },
  {
    tool: 'oc_aircall_get_contact',
    service: 'aircall',
    actionId: 'aircall.get_contact',
    description: 'Retrieve one Aircall contact.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 1, description: 'The Aircall numeric resource ID.' },
      },
      additionalProperties: false,
      required: ['id'],
      description: 'Input for retrieving one Aircall resource.',
    },
  },
  {
    tool: 'oc_aircall_get_number',
    service: 'aircall',
    actionId: 'aircall.get_number',
    description: 'Retrieve one Aircall phone number.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 1, description: 'The Aircall numeric resource ID.' },
      },
      additionalProperties: false,
      required: ['id'],
      description: 'Input for retrieving one Aircall resource.',
    },
  },
  {
    tool: 'oc_atlas_so_get_account',
    service: 'atlas_so',
    actionId: 'atlas_so.get_account',
    description: 'Retrieve a single Atlas account by ID.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The Atlas account ID.', format: 'uuid' } },
      additionalProperties: false,
      required: ['id'],
      description: 'The input payload for retrieving an Atlas account.',
    },
  },
  {
    tool: 'oc_atlas_so_get_customer',
    service: 'atlas_so',
    actionId: 'atlas_so.get_customer',
    description: 'Retrieve a single Atlas customer by ID.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The Atlas customer ID.', format: 'uuid' } },
      additionalProperties: false,
      required: ['id'],
      description: 'The input payload for retrieving an Atlas customer.',
    },
  },
  {
    tool: 'oc_atlas_so_list_accounts',
    service: 'atlas_so',
    actionId: 'atlas_so.list_accounts',
    description: 'List Atlas accounts visible to the current API key.',
    parameters: {
      type: 'object',
      properties: {
        cursor: {
          type: 'integer',
          minimum: 0,
          description: 'The Atlas pagination cursor. Atlas defaults this to 0.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          description: 'The maximum number of records to return. Atlas defaults this to 20.',
        },
      },
      additionalProperties: false,
      description: 'Pagination parameters for Atlas list endpoints.',
    },
  },
  {
    tool: 'oc_bark_get_server_info',
    service: 'bark',
    actionId: 'bark.get_server_info',
    description: 'Fetch raw server information from the connected Bark server.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for fetching Bark server information.',
    },
  },
  {
    tool: 'oc_beamer_count_unread_posts',
    service: 'beamer',
    actionId: 'beamer.count_unread_posts',
    description: 'Count unread Beamer posts for one end-user context.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          minLength: 1,
          description: 'The end-user identifier used together with filterByUserId.',
        },
        filterByUserId: {
          type: 'boolean',
          description: 'Whether to include single-user posts that match the provided userId.',
        },
      },
      additionalProperties: false,
      description: 'Query parameters for counting unread posts for one Beamer end-user context.',
    },
  },
  {
    tool: 'oc_beamer_get_feed_url',
    service: 'beamer',
    actionId: 'beamer.get_feed_url',
    description:
      'Retrieve the standalone Beamer feed URL with optional language and segmentation filters.',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          minLength: 2,
          maxLength: 2,
          description: 'A two-letter ISO-639 language code used by Beamer for feed localization.',
        },
        filterByUrl: {
          type: 'boolean',
          description: 'Whether URL segmentation should be applied to the feed URL.',
        },
        filter: {
          type: 'string',
          minLength: 1,
          description: 'An optional segmentation filter string to apply.',
        },
      },
      additionalProperties: false,
      description: 'Query parameters for retrieving the standalone Beamer feed URL.',
    },
  },
  {
    tool: 'oc_beamer_list_posts',
    service: 'beamer',
    actionId: 'beamer.list_posts',
    description:
      'List existing Beamer posts with optional changelog, audience, and analytics filters.',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          minLength: 1,
          description: 'Retrieve posts with a matching segmentation filter.',
        },
        forceFilter: {
          type: 'string',
          minLength: 1,
          description: 'Only retrieve posts that match this segmentation filter.',
        },
        filterUrl: {
          type: 'string',
          minLength: 1,
          description: 'Retrieve posts with a matching segmentation URL.',
        },
        dateFrom: {
          type: 'string',
          description: 'An ISO-8601 date-time string accepted by the Beamer API.',
          format: 'date-time',
        },
        dateTo: {
          type: 'string',
          description: 'An ISO-8601 date-time string accepted by the Beamer API.',
          format: 'date-time',
        },
        language: {
          type: 'string',
          minLength: 2,
          maxLength: 2,
          description: 'A two-letter ISO-639 language code used by Beamer for localized content.',
        },
        category: {
          type: 'string',
          minLength: 1,
          description: 'Retrieve posts for a specific category.',
        },
        published: {
          type: 'boolean',
          description: 'Whether to retrieve only published or only draft posts.',
        },
        archived: {
          type: 'boolean',
          description: 'Whether to retrieve only archived or only non-archived posts.',
        },
        expired: {
          type: 'boolean',
          description: 'Whether to retrieve only expired or only non-expired posts.',
        },
        filterByUserId: {
          type: 'boolean',
          description: 'Whether to include single-user posts that match the provided userId.',
        },
        userFirstName: {
          type: 'string',
          minLength: 1,
          description: "The end user's first name used for analytics attribution.",
        },
        userLastName: {
          type: 'string',
          minLength: 1,
          description: "The end user's last name used for analytics attribution.",
        },
        userEmail: {
          type: 'string',
          minLength: 1,
          description: "The end user's email used for analytics attribution.",
        },
        userId: {
          type: 'string',
          minLength: 1,
          description: 'The end-user identifier used for analytics attribution.',
        },
        traceableLinks: {
          type: 'boolean',
          description: 'Whether Beamer should rewrite links into tracked URLs.',
        },
        ignoreRequestDetails: {
          type: 'boolean',
          description:
            'Whether backend request IP, browser, OS, and geolocation details should be ignored.',
        },
        saveViews: {
          type: 'boolean',
          description: 'Whether fetching these posts should save views in Beamer analytics.',
        },
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'The maximum number of posts to return.',
        },
        page: { type: 'integer', minimum: 1, description: 'The results page to retrieve.' },
        ignoreFilters: {
          type: 'boolean',
          description: 'Whether Beamer should ignore segmentation filters when returning posts.',
        },
      },
      additionalProperties: false,
      description: 'Query parameters for listing existing posts from the Beamer API.',
    },
  },
  {
    tool: 'oc_bird_get_channel',
    service: 'bird',
    actionId: 'bird.get_channel',
    description: 'Retrieve a specific Bird workspace channel by ID.',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'The Bird workspace ID.', format: 'uuid' },
        channelId: { type: 'string', description: 'The Bird channel ID.', format: 'uuid' },
      },
      additionalProperties: false,
      description: 'The input payload for retrieving a Bird channel.',
    },
  },
  {
    tool: 'oc_bird_get_contact',
    service: 'bird',
    actionId: 'bird.get_contact',
    description: 'Retrieve a Bird contact by ID, optionally requesting specific attributes.',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'The Bird workspace ID.', format: 'uuid' },
        contactId: { type: 'string', description: 'The Bird contact ID.', format: 'uuid' },
        attribute: {
          type: 'string',
          minLength: 1,
          description: 'A contact attribute name to include in the response.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      required: ['workspaceId', 'contactId'],
      description: 'The input payload for retrieving a Bird contact.',
    },
  },
  {
    tool: 'oc_bird_get_message',
    service: 'bird',
    actionId: 'bird.get_message',
    description: 'Retrieve a Bird channel message by ID.',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'The Bird workspace ID.', format: 'uuid' },
        channelId: { type: 'string', description: 'The Bird channel ID.', format: 'uuid' },
        messageId: { type: 'string', description: 'The Bird channel message ID.', format: 'uuid' },
      },
      additionalProperties: false,
      description: 'The input payload for retrieving a Bird channel message.',
    },
  },
  {
    tool: 'oc_bluesky_get_profile',
    service: 'bluesky',
    actionId: 'bluesky.get_profile',
    description: 'Get the detailed Bluesky profile for a handle or DID.',
    parameters: {
      type: 'object',
      properties: {
        actor: { type: 'string', minLength: 1, description: 'A Bluesky handle or DID.' },
      },
      additionalProperties: false,
      description: 'Parameters for retrieving a Bluesky profile.',
    },
  },
  {
    tool: 'oc_bluesky_search_posts',
    service: 'bluesky',
    actionId: 'bluesky.search_posts',
    description: 'Search Bluesky posts with common filters and pagination.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', minLength: 1, description: 'The Bluesky search query string.' },
        sort: {
          type: 'string',
          enum: ['top', 'latest'],
          description: 'The ranking order for matching posts.',
        },
        since: {
          type: 'string',
          minLength: 1,
          description: 'Return posts after this ISO date or datetime.',
        },
        until: {
          type: 'string',
          minLength: 1,
          description: 'Return posts before this ISO date or datetime.',
        },
        mentions: { type: 'string', minLength: 1, description: 'A Bluesky handle or DID.' },
        author: { type: 'string', minLength: 1, description: 'A Bluesky handle or DID.' },
        lang: { type: 'string', minLength: 1, description: 'Filter posts by language code.' },
        domain: { type: 'string', minLength: 1, description: 'Filter posts by linked hostname.' },
        url: { type: 'string', description: 'Filter posts by linked URL.', format: 'uri' },
        tag: {
          type: 'array',
          items: { type: 'string', minLength: 1, maxLength: 640, description: 'A hashtag value.' },
          description: 'Filter posts by hashtag values without the hash prefix.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'The maximum number of posts to return.',
        },
        cursor: {
          type: 'string',
          minLength: 1,
          description: 'A cursor returned by Bluesky pagination.',
        },
      },
      additionalProperties: false,
      required: ['q'],
      description: 'Parameters for searching Bluesky posts.',
    },
  },
  {
    tool: 'oc_callerapi_get_phone_number_information',
    service: 'callerapi',
    actionId: 'callerapi.get_phone_number_information',
    description:
      'Look up CallerAPI spam reputation, business details, complaints, and optional HLR carrier data for a phone number.',
    parameters: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          minLength: 1,
          description: 'The phone number to look up. CallerAPI accepts E.164 input.',
        },
        hlr: {
          type: 'boolean',
          description: 'Whether to include HLR carrier data in the CallerAPI lookup.',
        },
      },
      additionalProperties: false,
      required: ['phone'],
      description: 'The input payload for looking up CallerAPI phone number information.',
    },
  },
  {
    tool: 'oc_callerapi_get_user_information',
    service: 'callerapi',
    actionId: 'callerapi.get_user_information',
    description: 'Retrieve the authenticated CallerAPI account email and credit balance.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for retrieving CallerAPI account details.',
    },
  },
  {
    tool: 'oc_callingly_get_agent_schedule',
    service: 'callingly',
    actionId: 'callingly.get_agent_schedule',
    description: 'Retrieve the weekly schedule for one Callingly agent.',
    parameters: {
      type: 'object',
      properties: {
        agentId: { type: 'integer', minimum: 1, description: 'Callingly agent identifier.' },
      },
      additionalProperties: false,
      description: 'Path parameters for retrieving one Callingly agent schedule.',
    },
  },
  {
    tool: 'oc_callingly_get_call',
    service: 'callingly',
    actionId: 'callingly.get_call',
    description: 'Retrieve one Callingly call by ID.',
    parameters: {
      type: 'object',
      properties: {
        callId: { type: 'integer', minimum: 1, description: 'Callingly call identifier.' },
      },
      additionalProperties: false,
      description: 'Path parameters for retrieving one Callingly call.',
    },
  },
  {
    tool: 'oc_callingly_get_lead',
    service: 'callingly',
    actionId: 'callingly.get_lead',
    description: 'Retrieve one Callingly lead by ID.',
    parameters: {
      type: 'object',
      properties: {
        leadId: { type: 'integer', minimum: 1, description: 'Callingly lead identifier.' },
      },
      additionalProperties: false,
      description: 'Path parameters for retrieving one Callingly lead.',
    },
  },
  {
    tool: 'oc_callpage_get_call',
    service: 'callpage',
    actionId: 'callpage.get_call',
    description: 'Get one CallPage call by identifier.',
    parameters: {
      type: 'object',
      properties: {
        call_id: { type: 'integer', minimum: 1, description: 'The CallPage call identifier.' },
      },
      additionalProperties: false,
      description: 'Input parameters for reading a single CallPage call.',
    },
  },
  {
    tool: 'oc_callpage_get_user',
    service: 'callpage',
    actionId: 'callpage.get_user',
    description: 'Get one CallPage user by identifier or email address.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 1, description: 'The CallPage user identifier.' },
        email: { type: 'string', description: 'The CallPage user email address.', format: 'email' },
      },
      additionalProperties: false,
      description: 'Input parameters for reading a single CallPage user.',
      oneOf: [
        { required: ['id'], not: { required: ['email'] } },
        { required: ['email'], not: { required: ['id'] } },
      ],
    },
  },
  {
    tool: 'oc_callpage_get_widget',
    service: 'callpage',
    actionId: 'callpage.get_widget',
    description: 'Get one CallPage widget by identifier.',
    parameters: {
      type: 'object',
      properties: {
        widget_id: { type: 'integer', minimum: 1, description: 'The CallPage widget identifier.' },
      },
      additionalProperties: false,
      description: 'Input parameters for reading a single CallPage widget.',
    },
  },
  {
    tool: 'oc_campaign_cleaner_get_campaign_status',
    service: 'campaign_cleaner',
    actionId: 'campaign_cleaner.get_campaign_status',
    description: 'Fetch the current processing status of one submitted Campaign Cleaner campaign.',
    parameters: {
      type: 'object',
      properties: {
        campaign_id: {
          type: 'string',
          minLength: 1,
          description: 'The Campaign Cleaner campaign identifier.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for referencing one Campaign Cleaner campaign.',
    },
  },
  {
    tool: 'oc_campaign_cleaner_get_campaign',
    service: 'campaign_cleaner',
    actionId: 'campaign_cleaner.get_campaign',
    description: 'Retrieve the full Campaign Cleaner analysis payload for one saved campaign.',
    parameters: {
      type: 'object',
      properties: {
        campaign_id: {
          type: 'string',
          minLength: 1,
          description: 'The Campaign Cleaner campaign identifier.',
        },
        minimize_html: {
          type: 'boolean',
          description: 'Whether the returned campaign HTML should be minimized.',
        },
      },
      additionalProperties: false,
      required: ['campaign_id'],
      description: 'The input payload for retrieving one Campaign Cleaner campaign.',
    },
  },
  {
    tool: 'oc_campaign_cleaner_get_campaign_pdf_analysis',
    service: 'campaign_cleaner',
    actionId: 'campaign_cleaner.get_campaign_pdf_analysis',
    description: 'Download a Campaign Cleaner PDF analysis report and return it as a transit file.',
    parameters: {
      type: 'object',
      properties: {
        campaign_id: {
          type: 'string',
          minLength: 1,
          description: 'The Campaign Cleaner campaign identifier.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for referencing one Campaign Cleaner campaign.',
    },
  },
  {
    tool: 'oc_whatsapp_get_template_status',
    service: 'whatsapp',
    actionId: 'whatsapp.get_template_status',
    description: 'Get status details for a specific message template.',
    parameters: {
      type: 'object',
      properties: {
        template_id: { type: 'string', minLength: 1, description: 'Meta template ID.' },
        fields: {
          type: 'string',
          minLength: 1,
          description: 'Comma-separated list of fields to retrieve.',
        },
      },
      additionalProperties: false,
      required: ['template_id'],
      description: 'Input for reading a WhatsApp template.',
    },
  },
  {
    tool: 'oc_whatsapp_get_business_profile',
    service: 'whatsapp',
    actionId: 'whatsapp.get_business_profile',
    description: 'Get the business profile configured for a WhatsApp Business phone number.',
    parameters: {
      type: 'object',
      properties: {
        phone_number_id: {
          type: 'string',
          minLength: 1,
          description: 'Meta phone number ID for the WhatsApp Business number used by this action.',
        },
        fields: {
          type: 'string',
          minLength: 1,
          description: 'Comma-separated list of fields to retrieve.',
        },
      },
      additionalProperties: false,
      required: ['phone_number_id'],
      description: 'Input for reading a WhatsApp business profile.',
    },
  },
  {
    tool: 'oc_whatsapp_get_media_info',
    service: 'whatsapp',
    actionId: 'whatsapp.get_media_info',
    description: 'Get metadata and a short-lived download URL for uploaded media.',
    parameters: {
      type: 'object',
      properties: { media_id: { type: 'string', minLength: 1, description: 'Meta media ID.' } },
      additionalProperties: false,
      required: ['media_id'],
      description: 'Input for reading media info.',
    },
  },
  {
    tool: 'oc_chatwork_get_contacts',
    service: 'chatwork',
    actionId: 'chatwork.get_contacts',
    description: 'List Chatwork contacts visible to the authenticated account.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'This action does not require additional input.',
    },
  },
  {
    tool: 'oc_chatwork_get_me',
    service: 'chatwork',
    actionId: 'chatwork.get_me',
    description: 'Get the authenticated Chatwork profile.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'This action does not require additional input.',
    },
  },
  {
    tool: 'oc_chatwork_get_message',
    service: 'chatwork',
    actionId: 'chatwork.get_message',
    description: 'Get one message from a Chatwork room.',
    parameters: {
      type: 'object',
      properties: {
        roomId: { type: 'integer', minimum: 1, description: 'The Chatwork room ID.' },
        messageId: { type: 'string', minLength: 1, description: 'The Chatwork message ID.' },
      },
      additionalProperties: false,
      required: ['roomId', 'messageId'],
    },
  },
  {
    tool: 'oc_chorus_get_conversation',
    service: 'chorus',
    actionId: 'chorus.get_conversation',
    description: 'Get a specific Chorus conversation with optional populated fields.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          minLength: 1,
          description: 'The Chorus conversation ID to retrieve.',
        },
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'account',
              'company_name',
              '_created_at',
              '_modified_at',
              'deal',
              'disposition',
              'language',
              'metrics',
              'meeting.id',
              'name',
              'owner',
              'owner.email',
              'participants',
              'private',
              'recording',
              'recording.audio_only',
              'recording.autojoin',
              'recording.autojoin_reason',
              'recording.clusters',
              'recording.duration',
              'recording.end_reason',
              'recording.recordable',
              'recording.schedule_end_time',
              'recording.schedule_start_time',
              'recording.start_time',
              'recording.thumbnails',
              'recording.trackers',
              'recording.utterances',
              'source',
              'status',
              'user_company_name',
            ],
            description: 'A Chorus conversation field to populate.',
          },
          description: 'Chorus conversation fields to populate.',
          minItems: 1,
        },
        forceRegeneration: {
          type: 'boolean',
          description: 'Whether Chorus should regenerate the conversation from latest data.',
        },
        skipSummaryGeneration: {
          type: 'boolean',
          description: 'Whether Chorus should skip summary generation.',
        },
        includeMeetingMetadata: {
          type: 'boolean',
          description:
            'Whether Chorus should include meeting metadata such as provider calendar ID and meeting URL.',
        },
      },
      additionalProperties: false,
      required: ['id'],
      description: 'Input for getting a Chorus conversation.',
    },
  },
  {
    tool: 'oc_chorus_get_current_user',
    service: 'chorus',
    actionId: 'chorus.get_current_user',
    description: 'Get details about the current Chorus API token user.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required for this Chorus action.',
    },
  },
  {
    tool: 'oc_chorus_get_team',
    service: 'chorus',
    actionId: 'chorus.get_team',
    description: 'Get a specific Chorus team by ID.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1, description: 'The Chorus team ID.' } },
      additionalProperties: false,
      description: 'Input for getting a Chorus team.',
    },
  },
  {
    tool: 'oc_circle_get_community',
    service: 'circle',
    actionId: 'circle.get_community',
    description: 'Get details about the Circle community associated with the current API token.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for getting Circle community details.',
    },
  },
  {
    tool: 'oc_circle_get_community_member',
    service: 'circle',
    actionId: 'circle.get_community_member',
    description: 'Get a Circle community member by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 1, description: 'The Circle community member ID.' },
      },
      additionalProperties: false,
      required: ['id'],
      description: 'Action input.',
    },
  },
  {
    tool: 'oc_circle_get_post',
    service: 'circle',
    actionId: 'circle.get_post',
    description: 'Get a Circle basic post by ID.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer', minimum: 1, description: 'The Circle post ID.' } },
      additionalProperties: false,
      required: ['id'],
      description: 'Action input.',
    },
  },
  {
    tool: 'oc_clickmeeting_get_conference',
    service: 'clickmeeting',
    actionId: 'clickmeeting.get_conference',
    description: 'Get details for a ClickMeeting room.',
    parameters: {
      type: 'object',
      properties: {
        roomId: { type: 'integer', minimum: 1, description: 'The ClickMeeting room identifier.' },
      },
      additionalProperties: false,
      description: 'The input payload for getting a ClickMeeting room.',
    },
  },
  {
    tool: 'oc_clickmeeting_get_session',
    service: 'clickmeeting',
    actionId: 'clickmeeting.get_session',
    description: 'Get details for a ClickMeeting room session.',
    parameters: {
      type: 'object',
      properties: {
        roomId: { type: 'integer', minimum: 1, description: 'The ClickMeeting room identifier.' },
        sessionId: {
          type: 'integer',
          minimum: 1,
          description: 'The ClickMeeting room session identifier.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for getting a ClickMeeting room session.',
    },
  },
  {
    tool: 'oc_clickmeeting_list_access_tokens',
    service: 'clickmeeting',
    actionId: 'clickmeeting.list_access_tokens',
    description: 'List generated access tokens for a ClickMeeting room.',
    parameters: {
      type: 'object',
      properties: {
        roomId: { type: 'integer', minimum: 1, description: 'The ClickMeeting room identifier.' },
      },
      additionalProperties: false,
      description: 'The input payload for listing ClickMeeting access tokens.',
    },
  },
  {
    tool: 'oc_clicksend_get_contact_list',
    service: 'clicksend',
    actionId: 'clicksend.get_contact_list',
    description: 'Get one ClickSend contact list by ID.',
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'integer', minimum: 1, description: 'The ClickSend contact list ID.' },
      },
      additionalProperties: false,
      required: ['list_id'],
      description: 'Input for getting a ClickSend contact list.',
    },
  },
  {
    tool: 'oc_clicksend_get_account',
    service: 'clicksend',
    actionId: 'clicksend.get_account',
    description: 'Get the ClickSend account profile associated with the configured credentials.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Input for getting the current ClickSend account.',
    },
  },
];
