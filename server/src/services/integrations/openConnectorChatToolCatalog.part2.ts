/* Reviewed OpenConnector chat tools, part 2 of 7.
 * Data only: the allow-list rationale lives in openConnectorChatToolCatalog.ts.
 * Keep entries in the original reviewed order. */

import type { OpenConnectorChatTool } from './openConnectorChatToolCatalog.types.js';

export const OPEN_CONNECTOR_CHAT_TOOLS_PART_2: OpenConnectorChatTool[] = [
  {
    tool: 'oc_7_shifts_list_departments',
    service: '7_shifts',
    actionId: '7_shifts.list_departments',
    description: 'List 7shifts departments for a company.',
    parameters: {
      type: 'object',
      properties: {
        apiVersion: {
          type: 'string',
          description: 'The 7shifts API version to send as x-api-version.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        companyGuid: {
          type: 'string',
          description: 'The 7shifts company GUID to send as x-company-guid.',
          format: 'uuid',
        },
        company_id: { type: 'integer', description: 'The 7shifts company ID.' },
        modified_since: {
          type: 'string',
          description: 'A date in YYYY-MM-DD format.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        location_id: { type: 'integer', description: 'The 7shifts location ID.' },
        cursor: {
          type: 'string',
          minLength: 1,
          description: 'The cursor for the next or previous page of results.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          description: 'The number of results desired per page.',
        },
      },
      additionalProperties: false,
      required: ['company_id'],
      description: 'The input payload for listing 7shifts departments.',
    },
  },
  {
    tool: 'oc_accredible_certificates_get_credential',
    service: 'accredible_certificates',
    actionId: 'accredible_certificates.get_credential',
    description: 'Get one Accredible credential by credential ID.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          minLength: 1,
          description: 'The Accredible credential identifier.',
          pattern: '\\S',
        },
      },
      additionalProperties: false,
      description: 'The input payload for reading one Accredible credential.',
    },
  },
  {
    tool: 'oc_accredible_certificates_get_group',
    service: 'accredible_certificates',
    actionId: 'accredible_certificates.get_group',
    description: 'Get one Accredible credential group by group ID.',
    parameters: {
      type: 'object',
      properties: {
        group_id: { type: 'integer', minimum: 1, description: 'The Accredible group ID.' },
      },
      additionalProperties: false,
      description: 'The input payload for reading one Accredible group.',
    },
  },
  {
    tool: 'oc_accredible_certificates_list_credentials',
    service: 'accredible_certificates',
    actionId: 'accredible_certificates.list_credentials',
    description: 'List Accredible credentials with documented query filters.',
    parameters: {
      type: 'object',
      properties: {
        group_id: {
          anyOf: [
            { type: 'integer', minimum: 1 },
            { type: 'string', minLength: 1, pattern: '\\S' },
          ],
          description: 'An Accredible ID represented as either a number or string.',
        },
        email: {
          type: 'string',
          description: 'The recipient email address to filter credentials by.',
          format: 'email',
        },
        recipient_id: {
          anyOf: [
            { type: 'integer', minimum: 1 },
            { type: 'string', minLength: 1, pattern: '\\S' },
          ],
          description: 'An Accredible ID represented as either a number or string.',
        },
        license_id: {
          type: 'string',
          minLength: 1,
          description: 'The Accredible license ID to filter credentials by.',
          pattern: '\\S',
        },
        start_date: {
          type: 'string',
          description: 'A date filter in YYYY-MM-DD format.',
          format: 'date',
        },
        end_date: {
          type: 'string',
          description: 'A date filter in YYYY-MM-DD format.',
          format: 'date',
        },
        start_updated_date: {
          type: 'string',
          description: 'A date filter in YYYY-MM-DD format.',
          format: 'date',
        },
        end_updated_date: {
          type: 'string',
          description: 'A date filter in YYYY-MM-DD format.',
          format: 'date',
        },
        page_size: {
          type: 'integer',
          minimum: 1,
          description: 'The number of results to request from Accredible.',
        },
        page: {
          type: 'integer',
          minimum: 1,
          description: 'The page number to request from Accredible.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for listing Accredible credentials.',
    },
  },
  {
    tool: 'oc_acculynx_get_company_settings',
    service: 'acculynx',
    actionId: 'acculynx.get_company_settings',
    description: 'Get the current AccuLynx company settings for the connected location.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for loading company settings.',
    },
  },
  {
    tool: 'oc_acculynx_get_initial_appointment',
    service: 'acculynx',
    actionId: 'acculynx.get_initial_appointment',
    description: 'Get the initial appointment for one AccuLynx job.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'The unique identifier of the job.', format: 'uuid' },
      },
      additionalProperties: false,
      required: ['jobId'],
      description: 'The input payload for loading one job initial appointment.',
    },
  },
  {
    tool: 'oc_acculynx_list_calendar_appointments',
    service: 'acculynx',
    actionId: 'acculynx.list_calendar_appointments',
    description: 'List appointment summaries for one AccuLynx calendar within a date range.',
    parameters: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          description: 'The unique identifier of the calendar.',
          format: 'uuid',
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          description: 'The number of items to return per page.',
        },
        pageStartIndex: {
          type: 'integer',
          minimum: 0,
          description: 'The zero-based index of the first item to return.',
        },
        startDate: {
          type: 'string',
          description: 'The inclusive start date in YYYY-MM-DD format.',
          format: 'date',
        },
        endDate: {
          type: 'string',
          description: 'The inclusive end date in YYYY-MM-DD format.',
          format: 'date',
        },
      },
      additionalProperties: false,
      required: ['calendarId', 'startDate', 'endDate'],
      description: 'The input payload for listing calendar appointments.',
    },
  },
  {
    tool: 'oc_affinity_list_saved_view_list_entries',
    service: 'affinity',
    actionId: 'affinity.list_saved_view_list_entries',
    description: 'List the Affinity list entries returned by one saved view.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'integer', exclusiveMinimum: 0, description: 'The Affinity list ID.' },
        viewId: {
          type: 'integer',
          exclusiveMinimum: 0,
          description: 'The Affinity saved view ID.',
        },
        cursor: {
          type: 'string',
          minLength: 1,
          description: 'The pagination cursor returned by Affinity.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'The number of items to include in the page.',
        },
      },
      additionalProperties: false,
      required: ['listId', 'viewId'],
      description: 'The input payload for listing Affinity saved-view list entries.',
    },
  },
  {
    tool: 'oc_affinity_get_list',
    service: 'affinity',
    actionId: 'affinity.get_list',
    description: 'Get one Affinity list by ID.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'integer', exclusiveMinimum: 0, description: 'The Affinity list ID.' },
      },
      additionalProperties: false,
      required: ['listId'],
      description: 'The input payload for fetching one Affinity list.',
    },
  },
  {
    tool: 'oc_affinity_get_saved_view',
    service: 'affinity',
    actionId: 'affinity.get_saved_view',
    description: 'Get one Affinity saved view by list ID and saved view ID.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'integer', exclusiveMinimum: 0, description: 'The Affinity list ID.' },
        viewId: {
          type: 'integer',
          exclusiveMinimum: 0,
          description: 'The Affinity saved view ID.',
        },
      },
      additionalProperties: false,
      required: ['listId', 'viewId'],
      description: 'The input payload for fetching one Affinity saved view.',
    },
  },
  {
    tool: 'oc_agiled_get_contact',
    service: 'agiled',
    actionId: 'agiled.get_contact',
    description: 'Get one Agiled CRM contact by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', exclusiveMinimum: 0, description: 'Agiled resource ID.' },
      },
      additionalProperties: false,
      description: 'Path parameters for an Agiled resource endpoint.',
    },
  },
  {
    tool: 'oc_agiled_get_project',
    service: 'agiled',
    actionId: 'agiled.get_project',
    description: 'Get one Agiled project by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', exclusiveMinimum: 0, description: 'Agiled resource ID.' },
      },
      additionalProperties: false,
      description: 'Path parameters for an Agiled resource endpoint.',
    },
  },
  {
    tool: 'oc_agiled_get_task',
    service: 'agiled',
    actionId: 'agiled.get_task',
    description: 'Get one Agiled task by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', exclusiveMinimum: 0, description: 'Agiled resource ID.' },
      },
      additionalProperties: false,
      description: 'Path parameters for an Agiled resource endpoint.',
    },
  },
  {
    tool: 'oc_feishu_get_current_user',
    service: 'feishu',
    actionId: 'feishu.get_current_user',
    description:
      'Get the profile of the Feishu user who authorized this connection, using their user_access_token.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required.',
    },
  },
  {
    tool: 'oc_feishu_get_document',
    service: 'feishu',
    actionId: 'feishu.get_document',
    description:
      "Get a Feishu docx document's basic metadata (title and revision) that the authorized user can read.",
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          minLength: 1,
          description: 'The docx document id, from the document URL (.../docx/<document_id>).',
        },
      },
      additionalProperties: false,
      description: 'Identify the document to read.',
    },
  },
  {
    tool: 'oc_feishu_get_document_content',
    service: 'feishu',
    actionId: 'feishu.get_document_content',
    description:
      'Read the full plain-text content of a Feishu docx document the authorized user can access.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          minLength: 1,
          description: 'The docx document id, from the document URL (.../docx/<document_id>).',
        },
        lang: {
          type: 'integer',
          minimum: 0,
          maximum: 1,
          description:
            'Language for @user mentions in the text: 0 = default name, 1 = English name.',
        },
      },
      additionalProperties: false,
      required: ['documentId'],
      description: 'Identify the document to read.',
    },
  },
  {
    tool: 'oc_feishu_app_bot_get_chat',
    service: 'feishu_app_bot',
    actionId: 'feishu_app_bot.get_chat',
    description: 'Fetch one Feishu/Lark chat by chat_id.',
    parameters: {
      type: 'object',
      properties: {
        chatId: { type: 'string', minLength: 1, description: 'The Feishu chat ID to fetch.' },
        userIdType: {
          type: 'string',
          enum: ['open_id', 'union_id', 'user_id'],
          description: 'The user identifier type returned by Feishu read APIs.',
        },
      },
      additionalProperties: false,
      required: ['chatId'],
      description: 'Input for fetching a Feishu chat.',
    },
  },
  {
    tool: 'oc_feishu_app_bot_get_message',
    service: 'feishu_app_bot',
    actionId: 'feishu_app_bot.get_message',
    description: 'Fetch one Feishu/Lark message by message_id.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', minLength: 1, description: 'The Feishu message ID to fetch.' },
        userIdType: {
          type: 'string',
          enum: ['open_id', 'union_id', 'user_id'],
          description: 'The user identifier type returned by Feishu read APIs.',
        },
        cardMsgContentType: {
          type: 'string',
          enum: ['user_card_content'],
          description: 'Return the original card JSON when the target message is a card.',
        },
      },
      additionalProperties: false,
      required: ['messageId'],
      description: 'Input for fetching a Feishu message.',
    },
  },
  {
    tool: 'oc_feishu_app_bot_list_chat_members',
    service: 'feishu_app_bot',
    actionId: 'feishu_app_bot.list_chat_members',
    description: 'List visible members in one Feishu/Lark chat.',
    parameters: {
      type: 'object',
      properties: {
        chatId: { type: 'string', minLength: 1, description: 'The Feishu chat ID to inspect.' },
        memberIdType: {
          type: 'string',
          enum: ['open_id', 'union_id', 'user_id'],
          description: 'The user identifier type returned by Feishu read APIs.',
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'The Feishu page size.',
        },
        pageToken: { type: 'string', minLength: 1, description: 'The Feishu pagination token.' },
      },
      additionalProperties: false,
      required: ['chatId'],
      description: 'Input for listing Feishu chat members.',
    },
  },
  {
    tool: 'oc_netease_mail_get_folder_status',
    service: 'netease_mail',
    actionId: 'netease_mail.get_folder_status',
    description: 'Get lightweight message counters for one NetEase Mail folder.',
    parameters: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          minLength: 1,
          description: 'The IMAP folder path returned by list_folders.',
          default: 'INBOX',
        },
      },
      additionalProperties: false,
      description: 'The input payload for reading one NetEase Mail folder status.',
    },
  },
  {
    tool: 'oc_netease_mail_get_email',
    service: 'netease_mail',
    actionId: 'netease_mail.get_email',
    description: 'Fetch and parse one NetEase Mail message without marking it as read.',
    parameters: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          minLength: 1,
          description: 'The IMAP folder path returned by list_folders.',
          default: 'INBOX',
        },
        uid: { type: 'integer', minimum: 1, description: 'The IMAP UID of the message.' },
      },
      additionalProperties: false,
      required: ['uid'],
      description: 'The input payload for fetching one NetEase Mail email.',
    },
  },
  {
    tool: 'oc_netease_mail_list_folders',
    service: 'netease_mail',
    actionId: 'netease_mail.list_folders',
    description: 'List folders visible to the connected NetEase Mail account.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for listing NetEase Mail folders.',
    },
  },
  {
    tool: 'oc_discordbot_get_application',
    service: 'discordbot',
    actionId: 'discordbot.get_application',
    description: 'Get a Discord application by ID.',
    parameters: {
      type: 'object',
      properties: {
        application_id: {
          type: 'string',
          minLength: 1,
          description: 'A Discord snowflake identifier.',
        },
      },
      additionalProperties: false,
      required: ['application_id'],
      description: 'Input parameters containing an application id.',
    },
  },
  {
    tool: 'oc_discordbot_get_bot_gateway',
    service: 'discordbot',
    actionId: 'discordbot.get_bot_gateway',
    description: 'Get the recommended Discord Gateway URL and sharding metadata for the bot.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required.',
    },
  },
  {
    tool: 'oc_discordbot_get_channel',
    service: 'discordbot',
    actionId: 'discordbot.get_channel',
    description: 'Get a Discord channel by ID.',
    parameters: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          minLength: 1,
          description: 'A Discord snowflake identifier.',
        },
      },
      additionalProperties: false,
      required: ['channel_id'],
      description: 'Input parameters containing a channel id.',
    },
  },
  {
    tool: 'oc_qq_mail_get_folder_status',
    service: 'qq_mail',
    actionId: 'qq_mail.get_folder_status',
    description: 'Get lightweight message counters for one QQ Mail folder.',
    parameters: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          minLength: 1,
          description: 'The IMAP folder path returned by list_folders.',
          default: 'INBOX',
        },
      },
      additionalProperties: false,
      description: 'The input payload for reading one QQ Mail folder status.',
    },
  },
  {
    tool: 'oc_qq_mail_get_email',
    service: 'qq_mail',
    actionId: 'qq_mail.get_email',
    description: 'Fetch and parse one QQ Mail message without marking it as read.',
    parameters: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          minLength: 1,
          description: 'The IMAP folder path returned by list_folders.',
          default: 'INBOX',
        },
        uid: { type: 'integer', minimum: 1, description: 'The IMAP UID of the message.' },
      },
      additionalProperties: false,
      required: ['uid'],
      description: 'The input payload for fetching one QQ Mail email.',
    },
  },
  {
    tool: 'oc_qq_mail_list_folders',
    service: 'qq_mail',
    actionId: 'qq_mail.list_folders',
    description: 'List folders visible to the connected QQ Mail account.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for listing QQ Mail folders.',
    },
  },
  {
    tool: 'oc_gmail_fetch_emails',
    service: 'gmail',
    actionId: 'gmail.fetch_emails',
    description:
      'List Gmail messages with optional query, label, and pagination filters. Use detail to choose IDs, summaries, or full messages.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query.' },
        labelIds: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'Gmail label IDs.',
        },
        includeSpamTrash: { type: 'boolean', description: 'Whether to include Spam and Trash.' },
        detail: {
          type: 'string',
          enum: ['ids', 'summary', 'full'],
          description: 'Message detail level.',
          default: 'summary',
        },
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Maximum number of results to return.',
        },
        pageToken: { type: 'string', description: 'Opaque pagination token returned by Gmail.' },
      },
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_gmail_fetch_message_by_message_id',
    service: 'gmail',
    actionId: 'gmail.fetch_message_by_message_id',
    description: 'Fetch a Gmail message by message ID with a controllable response format.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', minLength: 1, description: 'Gmail message ID.' },
        format: {
          type: 'string',
          enum: ['minimal', 'full', 'raw', 'metadata'],
          description: 'Gmail response format to request.',
        },
      },
      additionalProperties: false,
      required: ['messageId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_gmail_fetch_message_by_thread_id',
    service: 'gmail',
    actionId: 'gmail.fetch_message_by_thread_id',
    description: 'Fetch all messages in a Gmail thread.',
    parameters: {
      type: 'object',
      properties: { threadId: { type: 'string', minLength: 1, description: 'Gmail thread ID.' } },
      additionalProperties: false,
      required: ['threadId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_slack_get_channel_messages',
    service: 'slack',
    actionId: 'slack.get_channel_messages',
    description: 'Get recent messages from a Slack conversation.',
    parameters: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          minLength: 1,
          description: 'The Slack conversation or channel ID.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'The maximum number of messages to return.',
        },
      },
      additionalProperties: false,
      required: ['channelId'],
      description: 'Input parameters for reading Slack conversation history.',
    },
  },
  {
    tool: 'oc_slack_get_conversation',
    service: 'slack',
    actionId: 'slack.get_conversation',
    description: 'Get metadata for a Slack conversation.',
    parameters: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          minLength: 1,
          description: 'The Slack conversation or channel ID.',
        },
        includeLocale: {
          type: 'boolean',
          description: 'Whether Slack should include the locale field.',
        },
        includeNumMembers: {
          type: 'boolean',
          description: 'Whether Slack should include the member count field.',
        },
      },
      additionalProperties: false,
      required: ['channelId'],
      description: 'Input parameters for fetching a Slack conversation.',
    },
  },
  {
    tool: 'oc_slack_get_file',
    service: 'slack',
    actionId: 'slack.get_file',
    description: 'Get metadata for a Slack file.',
    parameters: {
      type: 'object',
      properties: { fileId: { type: 'string', minLength: 1, description: 'The Slack file ID.' } },
      additionalProperties: false,
      required: ['fileId'],
      description: 'Input parameters for fetching a Slack file.',
    },
  },
  {
    tool: 'oc_outlook_get_mailbox_settings',
    service: 'outlook',
    actionId: 'outlook.get_mailbox_settings',
    description:
      'Get the current Outlook mailbox settings, including automatic replies, locale, time zone, and working hours.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Outlook action input.',
    },
  },
  {
    tool: 'oc_outlook_get_message',
    service: 'outlook',
    actionId: 'outlook.get_message',
    description:
      'Get a single Outlook message by message ID, including message metadata and optional body formatting.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', minLength: 1, description: 'Outlook message ID.' },
        select: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'A string value.' },
          description: 'Message fields to request from Microsoft Graph.',
          minItems: 1,
        },
        bodyContentType: {
          type: 'string',
          enum: ['text', 'html'],
          description: 'Preferred Outlook body content type for the response.',
        },
      },
      additionalProperties: false,
      required: ['messageId'],
      description: 'Outlook action input.',
    },
  },
  {
    tool: 'oc_outlook_get_profile',
    service: 'outlook',
    actionId: 'outlook.get_profile',
    description:
      'Get the current Outlook account profile from Microsoft Graph so you can identify the connected mailbox.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Outlook action input.',
    },
  },
  {
    tool: 'oc_discord_get_current_user_application_entitlements',
    service: 'discord',
    actionId: 'discord.get_current_user_application_entitlements',
    description: 'Get entitlements for the current OAuth user under a Discord application.',
    parameters: {
      type: 'object',
      properties: {
        application_id: {
          type: 'string',
          minLength: 1,
          description: 'A Discord snowflake identifier.',
        },
        exclude_ended: {
          type: 'boolean',
          description: 'Whether to exclude entitlements that have already ended.',
        },
        exclude_deleted: {
          type: 'boolean',
          description: 'Whether to exclude entitlements marked as deleted.',
        },
      },
      additionalProperties: false,
      required: ['application_id'],
    },
  },
  {
    tool: 'oc_discord_get_gateway',
    service: 'discord',
    actionId: 'discord.get_gateway',
    description: 'Get a Discord Gateway URL.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input parameters are required.',
    },
  },
  {
    tool: 'oc_discord_get_guild_template',
    service: 'discord',
    actionId: 'discord.get_guild_template',
    description: 'Get a Discord guild template by code.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', minLength: 1, description: 'The guild template code.' },
      },
      additionalProperties: false,
      required: ['code'],
      description: 'Input for retrieving a Discord guild template.',
    },
  },
  {
    tool: 'oc_telegram_get_chat_members_count',
    service: 'telegram',
    actionId: 'telegram.get_chat_members_count',
    description: 'Return the number of members in a chat.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          anyOf: [
            { type: 'integer' },
            { type: 'string', pattern: '^-?\\d+$' },
            { type: 'string', pattern: '^@[A-Za-z0-9_]+$' },
          ],
          description: 'The target Telegram chat ID or channel username.',
        },
      },
      additionalProperties: false,
      required: ['chatId'],
      description: 'Action input.',
    },
  },
  {
    tool: 'oc_telegram_get_business_connection',
    service: 'telegram',
    actionId: 'telegram.get_business_connection',
    description: 'Return the current state and granted rights of a Telegram business connection.',
    parameters: {
      type: 'object',
      properties: {
        businessConnectionId: {
          type: 'string',
          minLength: 1,
          description: 'The unique identifier of the Telegram business connection.',
        },
      },
      additionalProperties: false,
      required: ['businessConnectionId'],
      description: 'Action input.',
    },
  },
  {
    tool: 'oc_telegram_get_chat',
    service: 'telegram',
    actionId: 'telegram.get_chat',
    description: 'Return metadata for a chat the bot can access.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          anyOf: [
            { type: 'integer' },
            { type: 'string', pattern: '^-?\\d+$' },
            { type: 'string', pattern: '^@[A-Za-z0-9_]+$' },
          ],
          description: 'The target Telegram chat ID or channel username.',
        },
      },
      additionalProperties: false,
      required: ['chatId'],
      description: 'Action input.',
    },
  },
  {
    tool: 'oc_twilio_get_account',
    service: 'twilio',
    actionId: 'twilio.get_account',
    description: 'Fetch the current Twilio account profile for the connected credential.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required for this action.',
    },
  },
  {
    tool: 'oc_twilio_get_message',
    service: 'twilio',
    actionId: 'twilio.get_message',
    description: 'Fetch one Twilio message by message SID.',
    parameters: {
      type: 'object',
      properties: {
        messageSid: {
          type: 'string',
          minLength: 1,
          description: 'The Twilio message SID to fetch.',
        },
      },
      additionalProperties: false,
      required: ['messageSid'],
      description: 'The input payload for fetching one Twilio message.',
    },
  },
  {
    tool: 'oc_twilio_list_messages',
    service: 'twilio',
    actionId: 'twilio.list_messages',
    description: 'List SMS or MMS messages for the connected Twilio account.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Only include messages sent to this phone number.' },
        from: { type: 'string', description: 'Only include messages sent from this phone number.' },
        pageSize: {
          type: 'integer',
          minimum: 1,
          description: 'The maximum number of records to return in one page.',
        },
        pageToken: {
          type: 'string',
          description: 'The Twilio page token used to continue a previous listing.',
        },
      },
      additionalProperties: false,
      description: 'The input payload for listing Twilio messages.',
    },
  },
  {
    tool: 'oc_sendgrid_get_account_info',
    service: 'sendgrid',
    actionId: 'sendgrid.get_account_info',
    description: 'Get the current SendGrid account type and sender reputation.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The empty input payload for this action.',
    },
  },
  {
    tool: 'oc_sendgrid_get_user_scopes',
    service: 'sendgrid',
    actionId: 'sendgrid.get_user_scopes',
    description: 'Get the SendGrid API key scopes available to the current credential.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The empty input payload for this action.',
    },
  },
  {
    tool: 'oc_sendgrid_list_transactional_templates',
    service: 'sendgrid',
    actionId: 'sendgrid.list_transactional_templates',
    description: 'List SendGrid transactional templates with pagination metadata.',
    parameters: {
      type: 'object',
      properties: {
        pageSize: {
          type: 'integer',
          minimum: 1,
          description: 'The number of templates to return per page.',
        },
        pageToken: {
          type: 'string',
          minLength: 1,
          description: 'The opaque page token returned by a previous SendGrid templates response.',
        },
        generations: {
          type: 'string',
          enum: ['legacy', 'dynamic', 'legacy,dynamic'],
          description: 'The template generations accepted by the SendGrid templates API.',
        },
      },
      additionalProperties: false,
      description: 'The query parameters for listing SendGrid transactional templates.',
    },
  },
  {
    tool: 'oc_zendesk_get_current_user',
    service: 'zendesk',
    actionId: 'zendesk.get_current_user',
    description: 'Get the current authenticated Zendesk user.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Input parameters for reading the current Zendesk user.',
    },
  },
  {
    tool: 'oc_zendesk_get_organization',
    service: 'zendesk',
    actionId: 'zendesk.get_organization',
    description: 'Get a Zendesk organization by identifier.',
    parameters: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'integer',
          minimum: 1,
          description: 'Zendesk organization identifier.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for reading a single Zendesk organization.',
    },
  },
  {
    tool: 'oc_zendesk_get_ticket',
    service: 'zendesk',
    actionId: 'zendesk.get_ticket',
    description: 'Get a Zendesk ticket and its comments by identifier.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: { type: 'integer', minimum: 1, description: 'Zendesk ticket identifier.' },
      },
      additionalProperties: false,
      description: 'Input parameters for reading a single Zendesk ticket.',
    },
  },
  {
    tool: 'oc_intercom_get_job_status',
    service: 'intercom',
    actionId: 'intercom.get_job_status',
    description: 'Get the status of an Intercom asynchronous job.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', minLength: 1, description: 'Intercom job identifier.' },
      },
      additionalProperties: false,
      description: 'Input parameters for reading Intercom job status.',
    },
  },
  {
    tool: 'oc_intercom_get_admin',
    service: 'intercom',
    actionId: 'intercom.get_admin',
    description: 'Get a single Intercom admin by identifier.',
    parameters: {
      type: 'object',
      properties: {
        adminId: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { type: 'integer', minimum: 0 },
          ],
          description: 'Intercom admin identifier.',
        },
      },
      additionalProperties: false,
      description: 'Input parameters for reading a single Intercom admin.',
    },
  },
];
