/* Reviewed OpenConnector chat tools, part 4 of 7.
 * Data only: the allow-list rationale lives in openConnectorChatToolCatalog.ts.
 * Keep entries in the original reviewed order. */

import type { OpenConnectorChatTool } from './openConnectorChatToolCatalog.types.js';

export const OPEN_CONNECTOR_CHAT_TOOLS_PART_4: OpenConnectorChatTool[] = [
  {
    tool: 'oc_clicksend_get_contact',
    service: 'clicksend',
    actionId: 'clicksend.get_contact',
    description: 'Get one ClickSend contact by list ID and contact ID.',
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'integer', minimum: 1, description: 'The ClickSend contact list ID.' },
        contact_id: { type: 'integer', minimum: 1, description: 'The ClickSend contact ID.' },
      },
      additionalProperties: false,
      required: ['list_id', 'contact_id'],
      description: 'Input for getting a ClickSend contact.',
    },
  },
  {
    tool: 'oc_cloudflare_email_routing_list_destination_addresses',
    service: 'cloudflare_email_routing',
    actionId: 'cloudflare_email_routing.list_destination_addresses',
    description:
      'List Cloudflare Email Routing destination addresses. Use addresses with a non-null verified timestamp for forward actions.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', minLength: 1, description: 'The Cloudflare account ID.' },
        direction: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'The result sort direction.',
        },
        verified: {
          type: 'boolean',
          description: 'Filter by destination address verification status.',
        },
        page: { type: 'integer', minimum: 1, description: 'The result page number.' },
        perPage: { type: 'integer', minimum: 5, maximum: 50, description: 'The page size.' },
      },
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_cloudflare_email_routing_list_routing_rules',
    service: 'cloudflare_email_routing',
    actionId: 'cloudflare_email_routing.list_routing_rules',
    description: 'List Cloudflare Email Routing rules for a zone or account.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: { type: 'string', minLength: 1, description: 'The Cloudflare zone ID.' },
        accountId: { type: 'string', minLength: 1, description: 'The Cloudflare account ID.' },
        enabled: { type: 'boolean', description: 'Filter by enabled routing rules.' },
        page: { type: 'integer', minimum: 1, description: 'The result page number.' },
        perPage: { type: 'integer', minimum: 5, maximum: 50, description: 'The page size.' },
      },
      additionalProperties: false,
      description:
        'The input payload for this action. zoneId and accountId are mutually exclusive.',
      not: { required: ['zoneId', 'accountId'] },
    },
  },
  {
    tool: 'oc_courier_get_list',
    service: 'courier',
    actionId: 'courier.get_list',
    description: 'Return a Courier subscription list by list ID.',
    parameters: {
      type: 'object',
      properties: {
        listId: {
          type: 'string',
          minLength: 1,
          description: 'The Courier list ID.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      description: 'The input payload for reading a Courier subscription list.',
    },
  },
  {
    tool: 'oc_courier_list_list_subscriptions',
    service: 'courier',
    actionId: 'courier.list_list_subscriptions',
    description: 'List subscriptions for a Courier subscription list.',
    parameters: {
      type: 'object',
      properties: {
        listId: {
          type: 'string',
          minLength: 1,
          description: 'The Courier list ID.',
          pattern: '\\S',
        },
        cursor: {
          type: 'string',
          minLength: 1,
          description: 'The Courier pagination cursor for the next page.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      required: ['listId'],
      description: 'The input payload for listing Courier list subscriptions.',
    },
  },
  {
    tool: 'oc_courier_get_profile',
    service: 'courier',
    actionId: 'courier.get_profile',
    description: 'Return a Courier user profile and preferences by user ID.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          minLength: 1,
          description: 'The Courier user ID associated with the profile.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      description: 'The input payload for reading a Courier profile.',
    },
  },
  {
    tool: 'oc_crisp_get_conversation',
    service: 'crisp',
    actionId: 'crisp.get_conversation',
    description: 'Retrieve one Crisp conversation by session ID.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          minLength: 1,
          description: 'The Crisp conversation session identifier.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for retrieving a Crisp conversation.',
    },
  },
  {
    tool: 'oc_crisp_get_website',
    service: 'crisp',
    actionId: 'crisp.get_website',
    description: 'Retrieve the Crisp website connected to the configured token.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description:
        'Input parameters for retrieving the Crisp website connected to this credential.',
    },
  },
  {
    tool: 'oc_crisp_list_conversation_messages',
    service: 'crisp',
    actionId: 'crisp.list_conversation_messages',
    description: 'List messages in a Crisp conversation.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          minLength: 1,
          description: 'The Crisp conversation session identifier.',
        },
        timestampBefore: { type: 'integer', description: 'A Crisp timestamp in milliseconds.' },
        timestampAfter: { type: 'integer', description: 'A Crisp timestamp in milliseconds.' },
        timestampAround: { type: 'integer', description: 'A Crisp timestamp in milliseconds.' },
      },
      additionalProperties: false,
      required: ['sessionId'],
      description: 'Input parameters for listing messages in a Crisp conversation.',
    },
  },
  {
    tool: 'oc_dailybot_get_me',
    service: 'dailybot',
    actionId: 'dailybot.get_me',
    description: 'Get the authenticated Dailybot user context and linked organization.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_dailybot_get_organization',
    service: 'dailybot',
    actionId: 'dailybot.get_organization',
    description: 'Get the Dailybot organization details for the authenticated API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_dailybot_get_team',
    service: 'dailybot',
    actionId: 'dailybot.get_team',
    description: 'Get a specific team from the authenticated Dailybot organization.',
    parameters: {
      type: 'object',
      properties: {
        team_id: { type: 'string', minLength: 1, description: 'The Dailybot team identifier.' },
      },
      additionalProperties: false,
      required: ['team_id'],
      description: 'Action input.',
    },
  },
  {
    tool: 'oc_data247_check_balance',
    service: 'data247',
    actionId: 'data247.check_balance',
    description: 'Check the current Data247 account balance.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Input for checking the Data247 account balance.',
    },
  },
  {
    tool: 'oc_data247_check_dnc',
    service: 'data247',
    actionId: 'data247.check_dnc',
    description: 'Check a phone number against Data247 Do-Not-Call data.',
    parameters: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          minLength: 1,
          maxLength: 40,
          description: 'The phone number to submit to Data247.',
        },
      },
      additionalProperties: false,
      required: ['phone'],
      description: 'Input for a Data247 phone-number lookup.',
    },
  },
  {
    tool: 'oc_data247_get_carrier_type',
    service: 'data247',
    actionId: 'data247.get_carrier_type',
    description: 'Determine whether a USA or Canadian phone number is mobile, landline, or VOIP.',
    parameters: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          minLength: 1,
          maxLength: 40,
          description: 'The phone number to submit to Data247.',
        },
      },
      additionalProperties: false,
      required: ['phone'],
      description: 'Input for a Data247 phone-number lookup.',
    },
  },
  {
    tool: 'oc_discourse_get_topic',
    service: 'discourse',
    actionId: 'discourse.get_topic',
    description: 'Read one Discourse topic and its returned posts.',
    parameters: {
      type: 'object',
      properties: {
        topicId: { type: 'integer', minimum: 1, description: 'The Discourse topic identifier.' },
      },
      additionalProperties: false,
      description: 'Input parameters for reading one Discourse topic.',
    },
  },
  {
    tool: 'oc_discourse_list_categories',
    service: 'discourse',
    actionId: 'discourse.list_categories',
    description: 'List Discourse categories visible to the authenticated API user.',
    parameters: {
      type: 'object',
      properties: {
        includeSubcategories: {
          type: 'boolean',
          description: 'Whether Discourse should include subcategories.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for listing Discourse categories.',
    },
  },
  {
    tool: 'oc_discourse_list_category_topics',
    service: 'discourse',
    actionId: 'discourse.list_category_topics',
    description: 'List topics for one Discourse category.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', minLength: 1, description: 'The Discourse category slug.' },
        categoryId: {
          type: 'integer',
          minimum: 1,
          description: 'The Discourse category identifier.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for listing category topics.',
    },
  },
  {
    tool: 'oc_dixa_get_agent',
    service: 'dixa',
    actionId: 'dixa.get_agent',
    description: 'Get one Dixa agent or admin by ID.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1, description: 'The Dixa user ID.' } },
      additionalProperties: false,
      description: 'Input for retrieving a Dixa user.',
    },
  },
  {
    tool: 'oc_dixa_get_conversation',
    service: 'dixa',
    actionId: 'dixa.get_conversation',
    description: 'Get one Dixa conversation by ID.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'integer', minimum: 1, description: 'The Dixa conversation ID.' },
      },
      additionalProperties: false,
      description: 'Input for retrieving a Dixa conversation.',
    },
  },
  {
    tool: 'oc_dixa_get_end_user',
    service: 'dixa',
    actionId: 'dixa.get_end_user',
    description: 'Get one Dixa end user by ID.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1, description: 'The Dixa user ID.' } },
      additionalProperties: false,
      description: 'Input for retrieving a Dixa user.',
    },
  },
  {
    tool: 'oc_emailable_get_batch_status',
    service: 'emailable',
    actionId: 'emailable.get_batch_status',
    description:
      'Retrieve the latest Emailable status and results for an existing batch verification job.',
    parameters: {
      type: 'object',
      properties: {
        batch_id: {
          type: 'string',
          minLength: 1,
          description: 'The unique batch identifier returned by Emailable batch creation.',
        },
      },
      additionalProperties: false,
      required: ['batch_id'],
      description:
        'Input payload for retrieving the status of an Emailable batch verification job.',
    },
  },
  {
    tool: 'oc_emailable_get_account_info',
    service: 'emailable',
    actionId: 'emailable.get_account_info',
    description:
      'Retrieve Emailable account information including owner email and available credits.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required for this action.',
    },
  },
  {
    tool: 'oc_emaillistverify_get_email_list_progress',
    service: 'emaillistverify',
    actionId: 'emaillistverify.get_email_list_progress',
    description: 'Get the current progress of one uploaded EmailListVerify email list.',
    parameters: {
      type: 'object',
      properties: {
        emailListId: {
          type: 'string',
          minLength: 1,
          description: 'The identifier of the uploaded EmailListVerify email list.',
        },
      },
      additionalProperties: false,
      required: ['emailListId'],
      description: 'Input payload for referencing one uploaded EmailListVerify email list.',
    },
  },
  {
    tool: 'oc_emaillistverify_check_disposable',
    service: 'emaillistverify',
    actionId: 'emaillistverify.check_disposable',
    description: 'Check whether one email domain is disposable with EmailListVerify.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          minLength: 1,
          maxLength: 255,
          description: 'The email domain to check for disposable-email status.',
        },
      },
      additionalProperties: false,
      required: ['domain'],
      description: 'Input payload for checking whether one email domain is disposable.',
    },
  },
  {
    tool: 'oc_emaillistverify_get_credits',
    service: 'emaillistverify',
    actionId: 'emaillistverify.get_credits',
    description: 'Retrieve the available EmailListVerify on-demand and subscription credits.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required for this action.',
    },
  },
  {
    tool: 'oc_emailoctopus_get_list',
    service: 'emailoctopus',
    actionId: 'emailoctopus.get_list',
    description: 'Fetch a single EmailOctopus mailing list by ID.',
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'string', minLength: 1, description: 'EmailOctopus list identifier.' },
      },
      additionalProperties: false,
      description: 'Path parameters for fetching a single EmailOctopus list.',
    },
  },
  {
    tool: 'oc_emailoctopus_get_list_contact',
    service: 'emailoctopus',
    actionId: 'emailoctopus.get_list_contact',
    description: 'Fetch a single contact from an EmailOctopus mailing list.',
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'string', minLength: 1, description: 'EmailOctopus list identifier.' },
        contact_id: {
          type: 'string',
          minLength: 1,
          description: 'EmailOctopus contact identifier.',
        },
      },
      additionalProperties: false,
      description: 'Path parameters for fetching or deleting a single EmailOctopus contact.',
    },
  },
  {
    tool: 'oc_emailoctopus_list_list_contacts',
    service: 'emailoctopus',
    actionId: 'emailoctopus.list_list_contacts',
    description: 'List contacts in a specific EmailOctopus mailing list.',
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'string', minLength: 1, description: 'EmailOctopus list identifier.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of records to return, up to 100.',
        },
        page: {
          type: 'integer',
          minimum: 1,
          description: 'Specific 1-based page number to request.',
        },
      },
      additionalProperties: false,
      required: ['list_id'],
      description: 'Path and query parameters for listing contacts in an EmailOctopus list.',
    },
  },
  {
    tool: 'oc_freshdesk_get_account',
    service: 'freshdesk',
    actionId: 'freshdesk.get_account',
    description: 'Get Freshdesk account details for the current API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Input parameters for reading Freshdesk account details.',
    },
  },
  {
    tool: 'oc_freshdesk_get_ticket',
    service: 'freshdesk',
    actionId: 'freshdesk.get_ticket',
    description: 'Get a single Freshdesk ticket by identifier.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: { type: 'integer', minimum: 1, description: 'Freshdesk ticket identifier.' },
        include: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['requester', 'company', 'stats', 'description'],
            description: 'Freshdesk include token to expand related records in a ticket response.',
          },
          description: 'Freshdesk include tokens to expand related records in ticket responses.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['ticketId'],
      description: 'Input parameters for reading a single Freshdesk ticket.',
    },
  },
  {
    tool: 'oc_freshdesk_list_ticket_conversations',
    service: 'freshdesk',
    actionId: 'freshdesk.list_ticket_conversations',
    description: 'List conversations attached to a Freshdesk ticket.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: { type: 'integer', minimum: 1, description: 'Freshdesk ticket identifier.' },
        page: {
          type: 'integer',
          minimum: 1,
          description: 'Page number for the Freshdesk list request.',
        },
        perPage: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of records to return per Freshdesk page.',
        },
      },
      additionalProperties: false,
      required: ['ticketId'],
      description: 'Input parameters for listing Freshdesk ticket conversations.',
    },
  },
  {
    tool: 'oc_freshservice_get_ticket',
    service: 'freshservice',
    actionId: 'freshservice.get_ticket',
    description: 'Get one Freshservice ticket by identifier with optional include expansions.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'integer',
          minimum: 1,
          description: 'Freshservice ticket identifier or display identifier.',
        },
        include: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'conversations',
              'requester',
              'requested_for',
              'stats',
              'problem',
              'assets',
              'changes',
              'related_tickets',
              'onboarding_context',
              'offboarding_context',
              'journey_requests',
              'journey_data',
            ],
            description:
              'A Freshservice include token used to embed related ticket details in the response.',
          },
          description: 'Freshservice include tokens to expand related records in ticket responses.',
          minItems: 1,
        },
        workspaceId: {
          type: 'integer',
          minimum: 1,
          description:
            'Workspace identifier used for MSP or multi-workspace Freshservice accounts.',
        },
      },
      additionalProperties: false,
      required: ['ticketId'],
      description: 'Input parameters for reading a single Freshservice ticket.',
    },
  },
  {
    tool: 'oc_freshservice_list_locations',
    service: 'freshservice',
    actionId: 'freshservice.list_locations',
    description:
      'List Freshservice locations to help callers resolve account-level location metadata.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
          description: 'Page number for the Freshservice list request.',
        },
        perPage: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of records to return per Freshservice page.',
        },
        workspaceId: {
          type: 'integer',
          minimum: 1,
          description:
            'Workspace identifier used for MSP or multi-workspace Freshservice accounts.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for listing Freshservice locations.',
    },
  },
  {
    tool: 'oc_freshservice_list_service_catalog_items',
    service: 'freshservice',
    actionId: 'freshservice.list_service_catalog_items',
    description:
      'List Freshservice service catalog items so callers can discover item display IDs before placing requests.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
          description: 'Page number for the Freshservice list request.',
        },
        perPage: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of records to return per Freshservice page.',
        },
        searchTerm: {
          type: 'string',
          minLength: 1,
          description: 'Optional search term used to search Freshservice service catalog items.',
        },
        workspaceId: {
          type: 'integer',
          minimum: 1,
          description:
            'Workspace identifier used for MSP or multi-workspace Freshservice accounts.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for listing Freshservice service catalog items.',
    },
  },
  {
    tool: 'oc_front_get_contact',
    service: 'front',
    actionId: 'front.get_contact',
    description: 'Fetch one Front contact by contact ID or documented resource alias.',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          minLength: 1,
          description:
            'The Front contact ID, or a documented resource alias such as source:handle.',
        },
      },
      additionalProperties: false,
      required: ['contactId'],
      description: 'Input for fetching one Front contact.',
    },
  },
  {
    tool: 'oc_front_list_contacts',
    service: 'front',
    actionId: 'front.list_contacts',
    description: 'List Front company contacts with optional cursor pagination and sorting.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          description:
            'Optional Front contact query object string for updated_after and updated_before filters.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of contacts per page.',
        },
        pageToken: {
          type: 'string',
          minLength: 1,
          description: 'Front page token returned by a previous list_contacts call.',
        },
        sortBy: {
          type: 'string',
          enum: ['created_at', 'updated_at'],
          description: 'Field used to sort contacts.',
        },
        sortOrder: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Order by which contacts should be sorted.',
        },
      },
      additionalProperties: false,
      description: 'Input for listing Front contacts.',
    },
  },
  {
    tool: 'oc_front_list_teammates',
    service: 'front',
    actionId: 'front.list_teammates',
    description: 'List Front teammates in the company.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Input for listing Front teammates.',
    },
  },
  {
    tool: 'oc_gleap_get_contact_by_user_id',
    service: 'gleap',
    actionId: 'gleap.get_contact_by_user_id',
    description: 'Get a Gleap contact session by external user ID.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          minLength: 1,
          description: 'External user ID associated with the contact.',
        },
      },
      additionalProperties: false,
      required: ['userId'],
      description: 'Input for retrieving a Gleap contact by user ID.',
    },
  },
  {
    tool: 'oc_gleap_get_current_user',
    service: 'gleap',
    actionId: 'gleap.get_current_user',
    description: 'Get the current Gleap user for the connected API key.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required for this Gleap action.',
    },
  },
  {
    tool: 'oc_gleap_get_ticket',
    service: 'gleap',
    actionId: 'gleap.get_ticket',
    description: 'Get a Gleap ticket by ID.',
    parameters: {
      type: 'object',
      properties: { ticketId: { type: 'string', minLength: 1, description: 'Gleap ticket ID.' } },
      additionalProperties: false,
      required: ['ticketId'],
      description: 'Input for retrieving a Gleap ticket.',
    },
  },
  {
    tool: 'oc_godial_list_contacts_in_list',
    service: 'godial',
    actionId: 'godial.list_contacts_in_list',
    description: 'List all contacts currently stored in one GoDial list.',
    parameters: {
      type: 'object',
      properties: {
        listId: {
          type: 'string',
          minLength: 1,
          description: 'The GoDial list ID whose contacts should be returned.',
        },
      },
      additionalProperties: false,
      description: 'Input for listing contacts in one GoDial list.',
    },
  },
  {
    tool: 'oc_godial_get_contact',
    service: 'godial',
    actionId: 'godial.get_contact',
    description: 'Fetch one GoDial contact by contact ID.',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string', minLength: 1, description: 'The GoDial contact ID to fetch.' },
      },
      additionalProperties: false,
      description: 'Input for reading one GoDial contact.',
    },
  },
  {
    tool: 'oc_godial_list_accounts',
    service: 'godial',
    actionId: 'godial.list_accounts',
    description: 'List GoDial accounts in the current company.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Input for listing GoDial accounts.',
    },
  },
  {
    tool: 'oc_baidu_maps_get_place_detail',
    service: 'baidu_maps',
    actionId: 'baidu_maps.get_place_detail',
    description: 'Look up a Baidu Maps place by its uid.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          minLength: 1,
          description: 'The Baidu Maps place identifier (uid).',
        },
        scope: {
          anyOf: [
            { type: 'string', enum: ['1', '2'] },
            { type: 'integer', enum: [1, 2] },
          ],
          description: 'The detail scope. Baidu accepts either the string or the integer form.',
        },
        coord_type: { type: 'string', description: 'The coordinate system of returned locations.' },
      },
      additionalProperties: false,
      required: ['uid'],
      description: 'Input parameters for place detail lookup.',
    },
  },
  {
    tool: 'oc_baidu_maps_search_places',
    service: 'baidu_maps',
    actionId: 'baidu_maps.search_places',
    description: 'Search Baidu Maps places in a region or city.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'The keyword used to search places.' },
        region: {
          type: 'string',
          minLength: 1,
          description: "The region name to scope the search, for example '北京'.",
        },
        city_limit: {
          type: 'integer',
          description:
            'Whether to restrict results to the supplied region (1) or extend to nearby regions (0).',
        },
        scope: {
          anyOf: [
            { type: 'string', enum: ['1', '2'] },
            { type: 'integer', enum: [1, 2] },
          ],
          description: 'The result scope. Baidu accepts either the string or the integer form.',
        },
        filter: { type: 'string', description: 'Pipe separated industry filtering tags.' },
        coord_type: { type: 'string', description: 'The coordinate system of returned locations.' },
        ret_coordtype: {
          type: 'string',
          description: 'Alias for coord_type used by some Baidu endpoints.',
        },
        page_size: { type: 'integer', minimum: 0, description: 'The page size, 0 to 20.' },
        page_num: { type: 'integer', minimum: 0, description: 'The zero-based page index.' },
      },
      additionalProperties: false,
      required: ['query'],
      description: 'Input parameters for searching places.',
    },
  },
  {
    tool: 'oc_baidu_maps_search_places_around',
    service: 'baidu_maps',
    actionId: 'baidu_maps.search_places_around',
    description: 'Search Baidu Maps places within a radius around a coordinate.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'The keyword used to search places.' },
        location: {
          type: 'string',
          minLength: 1,
          description: 'The search center formatted as latitude,longitude.',
        },
        radius: {
          type: 'integer',
          minimum: 0,
          description: 'The search radius in meters (default 1000, max 50000).',
        },
        radius_limit: {
          type: 'integer',
          description: 'Whether to strictly observe the radius (1) or relax it (0).',
        },
        filter: { type: 'string', description: 'Pipe separated industry filtering tags.' },
        coord_type: { type: 'string', description: 'The coordinate system of returned locations.' },
        ret_coordtype: {
          type: 'string',
          description: 'Alias for coord_type used by some Baidu endpoints.',
        },
        page_size: { type: 'integer', minimum: 0, description: 'The page size, 0 to 20.' },
        page_num: { type: 'integer', minimum: 0, description: 'The zero-based page index.' },
      },
      additionalProperties: false,
      required: ['query', 'location'],
      description: 'Input parameters for circular place search.',
    },
  },
  {
    tool: 'oc_qianfan_get_batch',
    service: 'qianfan',
    actionId: 'qianfan.get_batch',
    description: 'Fetch a Baidu Qianfan batch prediction job by its identifier.',
    parameters: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', minLength: 1, description: 'The batch identifier.' },
      },
      additionalProperties: false,
      required: ['batch_id'],
      description: 'The input payload for a batch lookup action.',
    },
  },
  {
    tool: 'oc_qianfan_get_file_content',
    service: 'qianfan',
    actionId: 'qianfan.get_file_content',
    description: 'Fetch the raw content of a Baidu Qianfan file by its identifier.',
    parameters: {
      type: 'object',
      properties: {
        file_id: { type: 'string', minLength: 1, description: 'The file identifier.' },
      },
      additionalProperties: false,
      required: ['file_id'],
      description: 'The input payload for a file lookup action.',
    },
  },
  {
    tool: 'oc_qianfan_get_response',
    service: 'qianfan',
    actionId: 'qianfan.get_response',
    description: 'Fetch a previously stored Baidu Qianfan response by its identifier.',
    parameters: {
      type: 'object',
      properties: {
        response_id: { type: 'string', minLength: 1, description: 'The response identifier.' },
      },
      additionalProperties: false,
      required: ['response_id'],
      description: 'The input payload for a response lookup action.',
    },
  },
  {
    tool: 'oc_yuandian_check_legal_hallucinations',
    service: 'yuandian',
    actionId: 'yuandian.check_legal_hallucinations',
    description: 'Check legal citations in text for Yuan Dian-detected hallucinations.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          minLength: 1,
          description: 'The legal text to check for citation hallucinations.',
        },
        requestId: {
          type: 'string',
          minLength: 1,
          description: 'Optional caller-supplied request identifier sent as X-Request-ID.',
        },
      },
      additionalProperties: false,
      required: ['text'],
      description: 'Input parameters for checking legal citations in text.',
    },
  },
  {
    tool: 'oc_yuandian_get_case_details',
    service: 'yuandian',
    actionId: 'yuandian.get_case_details',
    description: 'Retrieve Yuan Dian case details by case ID or case number.',
    parameters: {
      type: 'object',
      properties: {
        caseId: { type: 'string', minLength: 1, description: 'Yuan Dian case identifier.' },
        caseNumber: {
          type: 'string',
          minLength: 1,
          description: 'Case number used when no caseId is supplied.',
        },
        type: { type: 'string', enum: ['ptal', 'qwal'], description: 'Case type filter.' },
      },
      additionalProperties: false,
      description:
        'Input parameters for retrieving Yuan Dian case details. Provide caseId or caseNumber.',
    },
  },
  {
    tool: 'oc_yuandian_get_clause_detail',
    service: 'yuandian',
    actionId: 'yuandian.get_clause_detail',
    description: 'Retrieve detail for one Yuan Dian statutory clause.',
    parameters: {
      type: 'object',
      properties: {
        clauseId: { type: 'string', minLength: 1, description: 'Yuan Dian clause identifier.' },
        regulationName: {
          type: 'string',
          minLength: 1,
          description: 'Regulation name used when no clauseId is supplied.',
        },
        clauseNumber: {
          type: 'string',
          minLength: 1,
          description: 'Clause number or name, such as Article 100.',
        },
        referenceDate: {
          type: 'string',
          description: 'Reference date for locating the effective clause version.',
          format: 'date',
        },
      },
      additionalProperties: false,
      description:
        'Input parameters for retrieving one Yuan Dian statutory clause detail. Provide clauseId or both regulationName and clauseNumber.',
    },
  },
];
