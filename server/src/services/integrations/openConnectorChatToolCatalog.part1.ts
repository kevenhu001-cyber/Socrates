/* Reviewed OpenConnector chat tools, part 1 of 7.
 * Data only: the allow-list rationale lives in openConnectorChatToolCatalog.ts.
 * Keep entries in the original reviewed order. */

import type { OpenConnectorChatTool } from './openConnectorChatToolCatalog.types.js';

export const OPEN_CONNECTOR_CHAT_TOOLS_PART_1: OpenConnectorChatTool[] = [
  {
    tool: 'oc_googlecalendar_get_calendar_list_entry',
    service: 'googlecalendar',
    actionId: 'googlecalendar.get_calendar_list_entry',
    description: 'Fetch one Google Calendar list entry by calendar ID.',
    parameters: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          minLength: 1,
          description: 'Google Calendar ID. Omit to use the primary calendar when supported.',
        },
      },
      additionalProperties: false,
      required: ['calendarId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_googlecalendar_find_event',
    service: 'googlecalendar',
    actionId: 'googlecalendar.find_event',
    description: 'Search events in a Google Calendar using a query string.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'Full-text search query for events.' },
        calendarId: {
          type: 'string',
          minLength: 1,
          description: 'Google Calendar ID. Omit to use the primary calendar when supported.',
        },
        timeMin: { type: 'string', description: 'RFC 3339 timestamp.', format: 'date-time' },
        timeMax: { type: 'string', description: 'RFC 3339 timestamp.', format: 'date-time' },
        updatedMin: { type: 'string', description: 'RFC 3339 timestamp.', format: 'date-time' },
        eventTypes: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
          ],
          description: 'One string or an array of strings.',
        },
        orderBy: { type: 'string', description: 'Sort order.' },
        singleEvents: { type: 'boolean', description: 'Expand recurring events.' },
        showDeleted: { type: 'boolean', description: 'Include deleted events.' },
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 2500,
          description: 'Maximum events to return.',
        },
        pageToken: { type: 'string', description: 'Page token.' },
      },
      additionalProperties: false,
      required: ['query'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_googlecalendar_find_free_slots',
    service: 'googlecalendar',
    actionId: 'googlecalendar.find_free_slots',
    description: 'Derive free slots from Google Calendar freeBusy data.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          anyOf: [
            { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
            {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: { type: 'string', minLength: 1 } },
                additionalProperties: false,
                required: ['id'],
              },
              minItems: 1,
            },
          ],
          description: 'Calendar or group IDs to include in the freeBusy query.',
        },
        timeMin: { type: 'string', description: 'RFC 3339 timestamp.', format: 'date-time' },
        timeMax: { type: 'string', description: 'RFC 3339 timestamp.', format: 'date-time' },
        timeZone: { type: 'string', description: 'Response time zone.' },
        groupExpansionMax: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum calendars to expand per group.',
        },
        calendarExpansionMax: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum calendars to return after expansion.',
        },
      },
      additionalProperties: false,
      required: ['items', 'timeMin', 'timeMax'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_ticktick_get_habit',
    service: 'ticktick',
    actionId: 'ticktick.get_habit',
    description: 'Get a TickTick habit by its habit ID.',
    parameters: {
      type: 'object',
      properties: {
        habitId: { type: 'string', minLength: 1, description: 'The TickTick habit ID.' },
      },
      additionalProperties: false,
    },
  },
  {
    tool: 'oc_ticktick_get_project_by_id',
    service: 'ticktick',
    actionId: 'ticktick.get_project_by_id',
    description: 'Get a TickTick project by its project ID.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'The TickTick project ID.' },
      },
      additionalProperties: false,
      description: 'TickTick project lookup input.',
    },
  },
  {
    tool: 'oc_ticktick_get_project_with_data',
    service: 'ticktick',
    actionId: 'ticktick.get_project_with_data',
    description: 'Get a TickTick project together with its undone tasks and columns.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'The TickTick project ID.' },
      },
      additionalProperties: false,
      description: 'TickTick project lookup input.',
    },
  },
  {
    tool: 'oc_amap_get_place_detail',
    service: 'amap',
    actionId: 'amap.get_place_detail',
    description: 'Get place details by id.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The place identifier.' },
        showFields: { type: 'string', description: 'The requested output fields.' },
      },
      additionalProperties: false,
      required: ['id'],
      description: 'The input parameters for fetching place details.',
    },
  },
  {
    tool: 'oc_amap_search_places',
    service: 'amap',
    actionId: 'amap.search_places',
    description: 'Search places by keyword.',
    parameters: {
      type: 'object',
      properties: {
        keywords: { type: 'string', description: 'The keywords used to search places.' },
        region: { type: 'string', description: 'The optional region filter.' },
        cityLimit: { type: 'boolean', description: 'Whether to limit results to the region.' },
        types: { type: 'string', description: 'The optional place type filter.' },
        pageNum: { type: 'integer', description: 'The page number to fetch.' },
        pageSize: { type: 'integer', description: 'The page size to fetch.' },
        showFields: { type: 'string', description: 'The requested output fields.' },
      },
      additionalProperties: false,
      required: ['keywords'],
      description: 'The input parameters for searching places by keyword.',
    },
  },
  {
    tool: 'oc_amap_search_places_around',
    service: 'amap',
    actionId: 'amap.search_places_around',
    description: 'Search places around a location.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'The center coordinate for the search.' },
        radius: { type: 'integer', description: 'The search radius in meters.' },
        keywords: { type: 'string', description: 'The optional keyword filter.' },
        types: { type: 'string', description: 'The optional place type filter.' },
        sortRule: { type: 'string', description: 'The optional sort rule.' },
        pageNum: { type: 'integer', description: 'The page number to fetch.' },
        pageSize: { type: 'integer', description: 'The page size to fetch.' },
        showFields: { type: 'string', description: 'The requested output fields.' },
      },
      additionalProperties: false,
      required: ['location'],
      description: 'The input parameters for searching places around a location.',
    },
  },
  {
    tool: 'oc_mcdonalds_cn_get_cities',
    service: 'mcdonalds_cn',
    actionId: 'mcdonalds_cn.get_cities',
    description: "Get McDonald's China cities that support restaurant and menu lookup.",
    parameters: {
      type: 'object',
      properties: {
        getCurrent: {
          type: 'string',
          enum: ['0', '1'],
          description: "McDonald's China flag value: 0 for no, 1 for yes.",
        },
      },
      additionalProperties: false,
      description: 'City lookup options.',
    },
  },
  {
    tool: 'oc_mcdonalds_cn_get_menu',
    service: 'mcdonalds_cn',
    actionId: 'mcdonalds_cn.get_menu',
    description: "Get a McDonald's China store menu for an order type, daypart, and sales channel.",
    parameters: {
      type: 'object',
      properties: {
        storeCode: { type: 'string', minLength: 1, description: 'Store code.' },
        channelCode: { type: 'string', minLength: 1, description: 'Sales channel code.' },
        orderType: { type: 'integer', description: 'Order type.' },
        dayPartCode: { type: 'integer', description: 'Daypart code.' },
        beCode: {
          type: 'string',
          minLength: 1,
          description: "A McDonald's China query parameter value.",
        },
        date: {
          type: 'string',
          description:
            "Date in yyyyMMdd format. When omitted, McDonald's China defaults to the current day.",
          pattern: '^\\d{8}$',
        },
        time: {
          type: 'string',
          description:
            "Time in HH:mm format. When omitted, McDonald's China defaults to the current time.",
          pattern: '^\\d{2}:\\d{2}$',
        },
        isGroupMeal: {
          type: 'integer',
          minimum: 0,
          maximum: 1,
          description: 'Group meal flag: 0 for no, 1 for yes.',
        },
      },
      additionalProperties: false,
      required: ['storeCode', 'channelCode', 'orderType', 'dayPartCode'],
      description: 'Menu lookup input.',
    },
  },
  {
    tool: 'oc_mcdonalds_cn_get_product_detail',
    service: 'mcdonalds_cn',
    actionId: 'mcdonalds_cn.get_product_detail',
    description: "Get detailed McDonald's China menu product information.",
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', minLength: 1, description: 'Product code.' },
        storeCode: { type: 'string', minLength: 1, description: 'Store code.' },
        channelCode: { type: 'string', minLength: 1, description: 'Sales channel code.' },
        daypartCode: {
          type: 'string',
          minLength: 1,
          description: "A McDonald's China query parameter value.",
        },
        orderType: {
          type: 'string',
          minLength: 1,
          description: "A McDonald's China query parameter value.",
        },
        beCode: {
          type: 'string',
          minLength: 1,
          description: "A McDonald's China query parameter value.",
        },
        cardId: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
        date: {
          type: 'string',
          description:
            "Date in yyyyMMdd format. When omitted, McDonald's China defaults to the current day.",
          pattern: '^\\d{8}$',
        },
        time: {
          type: 'string',
          description:
            "Time in HH:mm format. When omitted, McDonald's China defaults to the current time.",
          pattern: '^\\d{2}:\\d{2}$',
        },
        isGroupMeal: {
          type: 'string',
          enum: ['0', '1'],
          description: "McDonald's China flag value: 0 for no, 1 for yes.",
        },
      },
      additionalProperties: false,
      required: ['code', 'storeCode', 'channelCode', 'daypartCode', 'orderType'],
      description: 'Product detail lookup input.',
    },
  },
  {
    tool: 'oc_luckin_coffee_queryShopList',
    service: 'luckin_coffee',
    actionId: 'luckin_coffee.queryShopList',
    description: 'Find nearby Luckin Coffee stores using a location and optional store name.',
    parameters: {
      type: 'object',
      properties: {
        deptName: { type: 'string', description: 'An optional store-name filter.' },
        longitude: {
          type: 'number',
          minimum: -180,
          maximum: 180,
          description: 'Longitude in decimal degrees.',
        },
        latitude: {
          type: 'number',
          minimum: -90,
          maximum: 90,
          description: 'Latitude in decimal degrees.',
        },
      },
      additionalProperties: false,
      required: ['longitude', 'latitude'],
      description: 'Input for finding Luckin Coffee stores.',
    },
  },
  {
    tool: 'oc_luckin_coffee_previewOrder',
    service: 'luckin_coffee',
    actionId: 'luckin_coffee.previewOrder',
    description:
      'Preview a Luckin Coffee order, including prices and available coupons, without creating it.',
    parameters: {
      type: 'object',
      properties: {
        deptId: {
          type: 'integer',
          minimum: 1,
          description: 'The Luckin Coffee store ID returned by `queryShopList`.',
        },
        productList: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              amount: { type: 'integer', minimum: 1, description: 'The quantity to order.' },
              productId: {
                type: 'integer',
                minimum: 1,
                description: 'The Luckin Coffee product ID.',
              },
              skuCode: { type: 'string', minLength: 1, description: 'The exact product SKU code.' },
            },
            additionalProperties: false,
            required: ['amount', 'productId', 'skuCode'],
            description: 'One configured product in an order.',
          },
          description: 'The configured products to preview.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['deptId', 'productList'],
      description: 'Input for previewing an order.',
    },
  },
  {
    tool: 'oc_luckin_coffee_queryOrderDetailInfo',
    service: 'luckin_coffee',
    actionId: 'luckin_coffee.queryOrderDetailInfo',
    description:
      'Get the current status, pickup details, products, payment, and delivery information for an order.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          minLength: 1,
          description: 'The lossless order ID string returned by `createOrder`.',
        },
      },
      additionalProperties: false,
      required: ['orderId'],
      description: 'Input for reading Luckin Coffee order details.',
    },
  },
  {
    tool: 'oc_tencent_docs_get_current_user',
    service: 'tencent_docs',
    actionId: 'tencent_docs.get_current_user',
    description: 'Get the current Tencent Docs user profile for the OAuth access token.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'No input is required to get the current Tencent Docs user.',
    },
  },
  {
    tool: 'oc_tencent_docs_get_doc_content',
    service: 'tencent_docs',
    actionId: 'tencent_docs.get_doc_content',
    description: 'Get the structured content and version of a Tencent Docs document.',
    parameters: {
      type: 'object',
      properties: {
        fileID: { type: 'string', minLength: 1, description: 'The Tencent Docs file ID.' },
      },
      additionalProperties: false,
      description: 'Input containing a Tencent Docs file ID.',
    },
  },
  {
    tool: 'oc_tencent_docs_get_export_progress',
    service: 'tencent_docs',
    actionId: 'tencent_docs.get_export_progress',
    description:
      'Check a Tencent Docs asynchronous export operation and return the download URL when ready.',
    parameters: {
      type: 'object',
      properties: {
        exportHandle: {
          type: 'string',
          minLength: 1,
          description: 'The opaque export handle returned by start_export.',
        },
        fileID: {
          type: 'string',
          minLength: 1,
          description: 'The Tencent Docs file ID being exported.',
        },
        operationID: {
          type: 'string',
          minLength: 1,
          description: 'The export operation ID returned by start_export.',
        },
      },
      additionalProperties: false,
      description:
        'Input for checking Tencent Docs export progress. Provide exportHandle, or both fileID and operationID.',
    },
  },
  {
    tool: 'oc_airtable_get_base_collaborators',
    service: 'airtable',
    actionId: 'airtable.get_base_collaborators',
    description:
      'Read Airtable base metadata, including workspaceId and optional collaborator details.',
    parameters: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          minLength: 1,
          description: 'Base ID in the format appXXXXXXXXXXXXXX.',
        },
        include: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['collaborators', 'inviteLinks', 'interfaces', 'packages'],
          },
          description: 'Optional Airtable base collaboration details to include.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['baseId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_airtable_get_base_schema',
    service: 'airtable',
    actionId: 'airtable.get_base_schema',
    description: 'Read Airtable table, field, and view schema for a specific base.',
    parameters: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          minLength: 1,
          description: 'Base ID in the format appXXXXXXXXXXXXXX.',
        },
        include: {
          type: 'array',
          items: { const: 'visibleFieldIds', type: 'string' },
          description: 'Optional Airtable schema details to include in table views.',
          minItems: 1,
          maxItems: 1,
        },
      },
      additionalProperties: false,
      required: ['baseId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_airtable_get_record',
    service: 'airtable',
    actionId: 'airtable.get_record',
    description: 'Read a single Airtable record by record ID.',
    parameters: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          minLength: 1,
          description: 'Base ID in the format appXXXXXXXXXXXXXX.',
        },
        tableIdOrName: {
          type: 'string',
          minLength: 1,
          description: 'Table ID or table name accepted by the Airtable path parameter.',
        },
        cellFormat: {
          type: 'string',
          enum: ['json', 'string'],
          description: 'Cell format accepted by Airtable for read operations.',
        },
        timeZone: {
          type: 'string',
          minLength: 1,
          description: 'Timezone string sent to Airtable when cellFormat is string.',
        },
        userLocale: {
          type: 'string',
          minLength: 1,
          description: 'User locale sent to Airtable when cellFormat is string.',
        },
        returnFieldsByFieldId: {
          type: 'boolean',
          description:
            'Whether Airtable should return field IDs instead of field names in record objects.',
        },
        includeDateDependencyMetadata: {
          type: 'boolean',
          description:
            'Whether Airtable should return date dependency metadata for linked record fields.',
        },
        recordId: {
          type: 'string',
          minLength: 1,
          description: 'Record ID in the format recXXXXXXXXXXXXXX.',
        },
      },
      additionalProperties: false,
      required: ['baseId', 'tableIdOrName', 'recordId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_trello_get_board',
    service: 'trello',
    actionId: 'trello.get_board',
    description: 'Get a Trello board by ID.',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string', minLength: 1, description: 'Trello board ID.' },
        fields: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1,
            description: 'One Trello field name to include in the response.',
          },
          description: 'Comma-joined Trello fields to request from the REST API.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['boardId'],
      description: 'Input parameters for retrieving a Trello board.',
    },
  },
  {
    tool: 'oc_trello_get_card',
    service: 'trello',
    actionId: 'trello.get_card',
    description: 'Get a Trello card by ID or short link.',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', minLength: 1, description: 'Trello card ID or short link.' },
        fields: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1,
            description: 'One Trello field name to include in the response.',
          },
          description: 'Comma-joined Trello fields to request from the REST API.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['cardId'],
      description: 'Input parameters for retrieving a Trello card.',
    },
  },
  {
    tool: 'oc_trello_get_member',
    service: 'trello',
    actionId: 'trello.get_member',
    description: 'Get a Trello member, defaulting to the authenticated member.',
    parameters: {
      type: 'object',
      properties: {
        memberId: {
          type: 'string',
          minLength: 1,
          description: 'Trello member ID or the me shortcut. Defaults to me.',
        },
        fields: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1,
            description: 'One Trello field name to include in the response.',
          },
          description: 'Comma-joined Trello fields to request from the REST API.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      description: 'Input parameters for retrieving a Trello member.',
    },
  },
  {
    tool: 'oc_asana_get_project',
    service: 'asana',
    actionId: 'asana.get_project',
    description: 'Get a single Asana project by gid.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'The Asana project gid.' },
        includeFields: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'An Asana field name.' },
          description: 'Additional Asana fields to request via opt_fields.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['projectId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_asana_get_task',
    service: 'asana',
    actionId: 'asana.get_task',
    description: 'Get a single Asana task by gid.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1, description: 'The Asana task gid.' },
        includeFields: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'An Asana field name.' },
          description: 'Additional Asana fields to request via opt_fields.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['taskId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_asana_get_workspace',
    service: 'asana',
    actionId: 'asana.get_workspace',
    description: 'Get a single Asana workspace by gid.',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', minLength: 1, description: 'The Asana workspace gid.' },
        includeFields: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'An Asana field name.' },
          description: 'Additional Asana fields to request via opt_fields.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['workspaceId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_jira_get_issue',
    service: 'jira',
    actionId: 'jira.get_issue',
    description: 'Get one Jira issue by issue ID or key.',
    parameters: {
      type: 'object',
      properties: {
        issueIdOrKey: { type: 'string', minLength: 1, description: 'Jira issue ID or key.' },
        includeFields: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'Jira field ID or name.' },
          description: 'Additional Jira issue fields.',
          minItems: 1,
        },
        expand: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'Jira expand token.' },
          description: 'Additional Jira expand tokens.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['issueIdOrKey'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_jira_get_project',
    service: 'jira',
    actionId: 'jira.get_project',
    description: 'Get one Jira project by project ID or key.',
    parameters: {
      type: 'object',
      properties: {
        projectIdOrKey: { type: 'string', minLength: 1, description: 'Jira project ID or key.' },
        expand: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'Jira expand token.' },
          description: 'Additional Jira expand tokens.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['projectIdOrKey'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_jira_list_issue_comments',
    service: 'jira',
    actionId: 'jira.list_issue_comments',
    description: 'List comments for one Jira issue.',
    parameters: {
      type: 'object',
      properties: {
        issueIdOrKey: { type: 'string', minLength: 1, description: 'Jira issue ID or key.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum items to return in one Jira page.',
        },
        cursor: {
          type: 'string',
          pattern: '^\\d+$',
          description: 'StartAt pagination cursor as a non-negative integer string.',
        },
        expand: {
          type: 'array',
          items: { type: 'string', minLength: 1, description: 'Jira expand token.' },
          description: 'Additional Jira expand tokens.',
          minItems: 1,
        },
      },
      additionalProperties: false,
      required: ['issueIdOrKey'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_linear_get_all_linear_teams',
    service: 'linear',
    actionId: 'linear.get_all_linear_teams',
    description: 'Lists all Linear team basic information accessible with the current credentials.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_linear_get_attachment',
    service: 'linear',
    actionId: 'linear.get_attachment',
    description: 'Retrieve a Linear attachment based on the issue and attachment ID or file name.',
    parameters: {
      type: 'object',
      properties: {
        issue_id: { type: 'string', minLength: 1, description: 'Linear resource ID.' },
        attachment_id: { type: 'string', minLength: 1, description: 'Linear resource ID.' },
        file_name: { type: 'string', minLength: 1, description: 'Attachment file name or title.' },
      },
      additionalProperties: false,
      required: ['issue_id'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_linear_get_current_user',
    service: 'linear',
    actionId: 'linear.get_current_user',
    description: 'Get the currently authenticated Linear user profile.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_clickup_get_list',
    service: 'clickup',
    actionId: 'clickup.get_list',
    description: 'Get a ClickUp list by list ID.',
    parameters: {
      type: 'object',
      properties: { listId: { type: 'string', minLength: 1, description: 'The ClickUp list ID.' } },
      additionalProperties: false,
      required: ['listId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_clickup_get_list_custom_fields',
    service: 'clickup',
    actionId: 'clickup.get_list_custom_fields',
    description: 'Get the ClickUp custom fields available on a list.',
    parameters: {
      type: 'object',
      properties: { listId: { type: 'string', minLength: 1, description: 'The ClickUp list ID.' } },
      additionalProperties: false,
      required: ['listId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_clickup_get_list_members',
    service: 'clickup',
    actionId: 'clickup.get_list_members',
    description: 'Get the ClickUp members with explicit access to a list.',
    parameters: {
      type: 'object',
      properties: { listId: { type: 'string', minLength: 1, description: 'The ClickUp list ID.' } },
      additionalProperties: false,
      required: ['listId'],
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_monday_find_items_by_column_values',
    service: 'monday',
    actionId: 'monday.find_items_by_column_values',
    description: 'Find Monday items on a board by matching explicit column values.',
    parameters: {
      type: 'object',
      properties: {
        board_id: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { type: 'integer', minimum: 1 },
          ],
          description: 'A Monday identifier.',
        },
        column_id: { type: 'string', minLength: 1, description: 'The column identifier.' },
        column_values: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'A non-empty list of strings.',
          minItems: 1,
        },
        limit: { type: 'integer', minimum: 1, description: 'Page size.' },
      },
      additionalProperties: false,
      required: ['board_id', 'column_id', 'column_values'],
      description: 'The input payload for finding Monday items by column values.',
    },
  },
  {
    tool: 'oc_monday_get_board_memberships',
    service: 'monday',
    actionId: 'monday.get_board_memberships',
    description: 'Retrieve Monday board user and team memberships.',
    parameters: {
      type: 'object',
      properties: {
        board_id: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { type: 'integer', minimum: 1 },
          ],
          description: 'A Monday identifier.',
        },
        limit: { type: 'integer', minimum: 1, description: 'Page size.' },
        page: { type: 'integer', minimum: 1, description: 'Page number.' },
      },
      additionalProperties: false,
      required: ['board_id'],
      description: 'The input payload for retrieving Monday board memberships.',
    },
  },
  {
    tool: 'oc_monday_get_current_user',
    service: 'monday',
    actionId: 'monday.get_current_user',
    description: 'Retrieve the Monday user associated with the current personal API token.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'The input payload for this action.',
    },
  },
  {
    tool: 'oc_pipedrive_get_activity',
    service: 'pipedrive',
    actionId: 'pipedrive.get_activity',
    description: 'Get one Pipedrive activity by activity ID.',
    parameters: {
      type: 'object',
      properties: {
        activityId: {
          type: 'integer',
          minimum: 1,
          description: 'The Pipedrive activity ID to retrieve.',
        },
      },
      additionalProperties: false,
      description: 'Input for The Pipedrive activity ID to retrieve..',
    },
  },
  {
    tool: 'oc_pipedrive_get_deal',
    service: 'pipedrive',
    actionId: 'pipedrive.get_deal',
    description: 'Get one Pipedrive deal by deal ID.',
    parameters: {
      type: 'object',
      properties: {
        dealId: { type: 'integer', minimum: 1, description: 'The Pipedrive deal ID to retrieve.' },
      },
      additionalProperties: false,
      description: 'Input for The Pipedrive deal ID to retrieve..',
    },
  },
  {
    tool: 'oc_pipedrive_get_organization',
    service: 'pipedrive',
    actionId: 'pipedrive.get_organization',
    description: 'Get one Pipedrive organization by organization ID.',
    parameters: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'integer',
          minimum: 1,
          description: 'The Pipedrive organization ID to retrieve.',
        },
      },
      additionalProperties: false,
      description: 'Input for The Pipedrive organization ID to retrieve..',
    },
  },
  {
    tool: 'oc_one_password_get_health',
    service: 'one_password',
    actionId: 'one_password.get_health',
    description: 'Get health details for the configured 1Password Connect Server.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'This action does not require any input parameters.',
    },
  },
  {
    tool: 'oc_one_password_get_item',
    service: 'one_password',
    actionId: 'one_password.get_item',
    description: 'Get one full 1Password item by vault UUID and item UUID.',
    parameters: {
      type: 'object',
      properties: {
        vaultId: { type: 'string', minLength: 1, description: 'The 1Password vault UUID.' },
        itemId: { type: 'string', minLength: 1, description: 'The 1Password item UUID.' },
      },
      additionalProperties: false,
      required: ['vaultId', 'itemId'],
      description: 'The input payload for reading one 1Password item.',
    },
  },
  {
    tool: 'oc_one_password_get_vault',
    service: 'one_password',
    actionId: 'one_password.get_vault',
    description: 'Get details for one 1Password vault by UUID.',
    parameters: {
      type: 'object',
      properties: {
        vaultId: { type: 'string', minLength: 1, description: 'The 1Password vault UUID.' },
      },
      additionalProperties: false,
      required: ['vaultId'],
      description: 'The input payload for reading one 1Password vault.',
    },
  },
  {
    tool: 'oc_7_shifts_get_company',
    service: '7_shifts',
    actionId: '7_shifts.get_company',
    description: 'Retrieve one 7shifts company by ID.',
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
        id: { type: 'integer', description: 'The 7shifts company ID.' },
      },
      additionalProperties: false,
      required: ['id'],
      description: 'The input payload for retrieving a 7shifts company.',
    },
  },
  {
    tool: 'oc_7_shifts_list_companies',
    service: '7_shifts',
    actionId: '7_shifts.list_companies',
    description: 'List 7shifts companies available to the access token.',
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
        modified_since: {
          type: 'string',
          description: 'A date in YYYY-MM-DD format.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
      },
      additionalProperties: false,
      description: 'The input payload for listing 7shifts companies.',
    },
  },
];
