/**
 * MCP工具定义
 * Model Context Protocol (MCP) 工具接口定义
 */

export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
      default?: any
      minimum?: number
      maximum?: number
    }>
    required: string[]
  }
}

/**
 * 所有可用的MCP工具定义
 */
export const MCP_TOOLS: MCPTool[] = [
  // ========== 验证码相关 ==========
  {
    name: "get_verification_code",
    description: "从指定邮箱获取最新的验证码。支持4-8位数字或字母数字混合验证码，自动过滤日期、电话号码等干扰信息。无论是否提取到验证码，都会返回完整的邮件内容（包括text和html），方便AI进行二次分析。",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "邮箱地址，例如: test@example.com"
        },
        seconds: {
          type: "number",
          description: "查询最近N秒内的邮件，默认600秒（10分钟），最大86400秒（24小时）",
          default: 600,
          minimum: 0,
          maximum: 86400
        }
      },
      required: ["mailbox"]
    }
  },

  // ========== 用户管理 ==========
  {
    name: "create_user",
    description: "创建新用户并生成唯一的访问token（格式: xmail_user_xxx）。用户可以通过此token访问分配给他们的邮箱。",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "用户名称"
        },
        note: {
          type: "string",
          description: "备注信息"
        }
      },
      required: []
    }
  },
  {
    name: "list_users",
    description: "列出所有用户，支持分页。返回用户ID、token、名称、状态等信息。",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "返回的最大用户数，默认50",
          default: 50,
          minimum: 1,
          maximum: 200
        },
        offset: {
          type: "number",
          description: "跳过的用户数（用于分页），默认0",
          default: 0,
          minimum: 0
        }
      },
      required: []
    }
  },
  {
    name: "get_user",
    description: "根据用户ID或token获取用户详细信息。",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "用户ID"
        },
        token: {
          type: "string",
          description: "用户token（xmail_user_xxx）"
        }
      },
      required: []
    }
  },
  {
    name: "update_user",
    description: "更新用户信息，可以修改名称、备注或激活状态。",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "用户ID"
        },
        name: {
          type: "string",
          description: "新的用户名称"
        },
        note: {
          type: "string",
          description: "新的备注信息"
        },
        isActive: {
          type: "boolean",
          description: "是否激活用户"
        }
      },
      required: ["id"]
    }
  },
  {
    name: "delete_user",
    description: "删除用户及其关联的邮箱分配。注意：这将解除该用户对所有邮箱的访问权限。",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "用户ID"
        }
      },
      required: ["id"]
    }
  },

  // ========== 邮箱管理 ==========
  {
    name: "create_mailbox",
    description: "创建单个邮箱并自动生成随机密码。返回邮箱地址和生成的密码。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "邮箱地址，例如: user@example.com"
        },
        note: {
          type: "string",
          description: "备注信息"
        }
      },
      required: ["address"]
    }
  },
  {
    name: "create_mailboxes_batch",
    description: "批量创建多个邮箱，每个邮箱自动生成随机密码。适合大规模邮箱生成场景。",
    inputSchema: {
      type: "object",
      properties: {
        addresses: {
          type: "array",
          description: "邮箱地址数组，例如: [\"user1@example.com\", \"user2@example.com\"]"
        }
      },
      required: ["addresses"]
    }
  },
  {
    name: "list_mailboxes",
    description: "列出邮箱，支持多种筛选条件和分页。可以按用户ID、共享状态、分配状态等条件过滤。",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "返回的最大邮箱数，默认50",
          default: 50,
          minimum: 1,
          maximum: 200
        },
        offset: {
          type: "number",
          description: "跳过的邮箱数（用于分页），默认0",
          default: 0,
          minimum: 0
        },
        unassignedOnly: {
          type: "boolean",
          description: "仅返回未分配的邮箱",
          default: false
        },
        userId: {
          type: "string",
          description: "仅返回分配给指定用户的邮箱"
        },
        sharedOnly: {
          type: "boolean",
          description: "仅返回共享邮箱",
          default: false
        }
      },
      required: []
    }
  },
  {
    name: "get_mailbox",
    description: "获取单个邮箱的详细信息，包括分配状态、密码状态、过期时间等。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "邮箱地址"
        }
      },
      required: ["address"]
    }
  },
  {
    name: "delete_mailbox",
    description: "软删除邮箱（可恢复）。邮箱将被标记为已删除但不会从数据库中移除。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "邮箱地址"
        }
      },
      required: ["address"]
    }
  },
  {
    name: "restore_mailbox",
    description: "恢复已删除的邮箱。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "邮箱地址"
        }
      },
      required: ["address"]
    }
  },
  {
    name: "list_deleted_mailboxes",
    description: "列出所有已删除的邮箱，支持分页。用于回收站功能。",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "返回的最大邮箱数，默认50",
          default: 50
        },
        offset: {
          type: "number",
          description: "跳过的邮箱数（用于分页），默认0",
          default: 0
        }
      },
      required: []
    }
  },
  {
    name: "assign_mailbox_to_user",
    description: "将邮箱分配给用户。如果userId为null，则解除分配。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "邮箱地址"
        },
        userId: {
          type: "string",
          description: "用户ID，传null可解除分配"
        }
      },
      required: ["address"]
    }
  },
  {
    name: "assign_mailboxes_to_user",
    description: "批量将多个邮箱分配给一个用户。",
    inputSchema: {
      type: "object",
      properties: {
        addresses: {
          type: "array",
          description: "邮箱地址数组"
        },
        userId: {
          type: "string",
          description: "用户ID"
        }
      },
      required: ["addresses", "userId"]
    }
  },
  {
    name: "set_mailbox_password",
    description: "为邮箱设置新密码。密码将被哈希存储，同时保留加密的明文副本以便恢复。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "邮箱地址"
        },
        password: {
          type: "string",
          description: "新密码"
        }
      },
      required: ["address", "password"]
    }
  },
  {
    name: "get_mailbox_password",
    description: "获取邮箱的明文密码（如果存在）。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "邮箱地址"
        }
      },
      required: ["address"]
    }
  },
  {
    name: "set_mailbox_shared",
    description: "设置邮箱的共享状态。共享邮箱可以分配给多个用户。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "邮箱地址"
        },
        isShared: {
          type: "boolean",
          description: "是否设置为共享邮箱"
        }
      },
      required: ["address", "isShared"]
    }
  },
  {
    name: "add_user_to_shared_mailbox",
    description: "将用户添加到共享邮箱的访问列表。邮箱必须是共享邮箱。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "共享邮箱地址"
        },
        userId: {
          type: "string",
          description: "用户ID"
        }
      },
      required: ["address", "userId"]
    }
  },
  {
    name: "remove_user_from_shared_mailbox",
    description: "从共享邮箱的访问列表中移除用户。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "共享邮箱地址"
        },
        userId: {
          type: "string",
          description: "用户ID"
        }
      },
      required: ["address", "userId"]
    }
  },
  {
    name: "get_shared_mailbox_users",
    description: "获取共享邮箱的所有用户列表。",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "共享邮箱地址"
        }
      },
      required: ["address"]
    }
  },

  // ========== 邮件查询 ==========
  {
    name: "list_emails",
    description: "列出指定邮箱的邮件，按时间倒序排列。支持分页。",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "邮箱地址"
        },
        limit: {
          type: "number",
          description: "返回的最大邮件数，默认50",
          default: 50,
          minimum: 1,
          maximum: 200
        },
        offset: {
          type: "number",
          description: "跳过的邮件数（用于分页），默认0",
          default: 0,
          minimum: 0
        }
      },
      required: ["mailbox"]
    }
  },
  {
    name: "get_email",
    description: "获取单个邮件的完整内容，包括HTML、纯文本、头部信息等。",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "邮件ID"
        }
      },
      required: ["id"]
    }
  },
  {
    name: "get_mailbox_stats",
    description: "获取邮箱的统计信息，包括总邮件数和未读邮件数。",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "邮箱地址"
        }
      },
      required: ["mailbox"]
    }
  },
  {
    name: "list_all_emails",
    description: "列出所有邮箱的邮件（管理员功能），支持分页。",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "返回的最大邮件数，默认50",
          default: 50
        },
        offset: {
          type: "number",
          description: "跳过的邮件数（用于分页），默认0",
          default: 0
        }
      },
      required: []
    }
  },
  {
    name: "search_emails",
    description: "高级邮件搜索。支持按发件人、主题、内容、时间范围、状态等多条件组合搜索。",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "邮箱地址（可选），如果不提供则搜索所有邮箱"
        },
        from: {
          type: "string",
          description: "发件人地址或名称（模糊匹配）"
        },
        subject: {
          type: "string",
          description: "邮件主题关键词（模糊匹配）"
        },
        content: {
          type: "string",
          description: "邮件内容关键词（在text和html中搜索）"
        },
        startTime: {
          type: "number",
          description: "开始时间戳（Unix时间，单位：秒），只返回此时间之后的邮件"
        },
        endTime: {
          type: "number",
          description: "结束时间戳（Unix时间，单位：秒），只返回此时间之前的邮件"
        },
        isRead: {
          type: "boolean",
          description: "是否已读（true=已读，false=未读，不设置=全部）"
        },
        isStarred: {
          type: "boolean",
          description: "是否加星标（true=已加星，false=未加星，不设置=全部）"
        },
        limit: {
          type: "number",
          description: "返回的最大邮件数，默认50",
          default: 50,
          minimum: 1,
          maximum: 200
        },
        offset: {
          type: "number",
          description: "跳过的邮件数（用于分页），默认0",
          default: 0,
          minimum: 0
        }
      },
      required: []
    }
  },
  {
    name: "search_verification_codes",
    description: "在多个邮箱中搜索验证码。自动从匹配条件的邮件中提取验证码，适合批量查询场景。",
    inputSchema: {
      type: "object",
      properties: {
        mailboxes: {
          type: "array",
          description: "要搜索的邮箱地址列表，例如: [\"user1@example.com\", \"user2@example.com\"]"
        },
        from: {
          type: "string",
          description: "发件人过滤（可选），例如: \"noreply@github.com\""
        },
        subject: {
          type: "string",
          description: "主题关键词过滤（可选），例如: \"verification\""
        },
        seconds: {
          type: "number",
          description: "查询最近N秒内的邮件，默认600秒",
          default: 600,
          minimum: 0,
          maximum: 86400
        }
      },
      required: ["mailboxes"]
    }
  },

  // ========== 邮件操作 ==========
  {
    name: "mark_email_as_read",
    description: "将指定邮件标记为已读。",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "邮件ID"
        }
      },
      required: ["id"]
    }
  },
  {
    name: "toggle_email_star",
    description: "切换邮件的星标状态。如果已加星标则取消，如果未加星标则添加。",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "邮件ID"
        },
        isStarred: {
          type: "boolean",
          description: "是否加星标"
        }
      },
      required: ["id", "isStarred"]
    }
  },
  {
    name: "list_starred_emails",
    description: "列出所有已加星标的邮件。可以按邮箱筛选。",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "邮箱地址（可选），如果提供则只返回该邮箱的星标邮件"
        }
      },
      required: []
    }
  },
  {
    name: "delete_email",
    description: "永久删除指定邮件。注意：此操作不可恢复。",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "邮件ID"
        }
      },
      required: ["id"]
    }
  },
  {
    name: "delete_old_emails",
    description: "批量删除超过指定天数的旧邮件。用于定期清理邮箱。",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "删除多少天之前的邮件，例如：30表示删除30天前的所有邮件",
          minimum: 1,
          maximum: 365
        }
      },
      required: ["days"]
    }
  },

  // ========== 服务模板管理 ==========
  {
    name: "create_service_template",
    description: "创建服务模板。服务模板可以关联到邮箱，提供快捷登录链接。",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "服务名称，例如: GitHub"
        },
        loginUrl: {
          type: "string",
          description: "登录URL，例如: https://github.com/login"
        },
        note: {
          type: "string",
          description: "备注信息"
        }
      },
      required: ["name", "loginUrl"]
    }
  },
  {
    name: "list_service_templates",
    description: "列出所有可用的服务模板。",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "add_service_to_mailbox",
    description: "将服务模板关联到邮箱。可以设置过期时间。",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "邮箱地址"
        },
        templateId: {
          type: "string",
          description: "服务模板ID"
        },
        expiresAt: {
          type: "number",
          description: "过期时间戳（Unix时间，单位：秒）"
        }
      },
      required: ["mailbox", "templateId"]
    }
  },
  {
    name: "get_mailbox_services",
    description: "获取邮箱关联的所有服务列表。",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "邮箱地址"
        }
      },
      required: ["mailbox"]
    }
  },

  // ========== 统计 ==========
  {
    name: "get_stats",
    description: "获取系统总体统计信息，包括用户数、邮箱数、未分配邮箱数和邮件总数。",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "count_users",
    description: "获取用户总数。",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "count_mailboxes",
    description: "获取邮箱总数（不包括已删除）。",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "count_emails",
    description: "获取邮件总数。",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "count_unassigned_mailboxes",
    description: "获取未分配邮箱的数量。",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "count_deleted_mailboxes",
    description: "获取已删除邮箱的数量。",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },

  // ========== 日志和审计 ==========
  {
    name: "get_logs",
    description: "获取管理员操作日志，用于审计和追踪系统操作记录。",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "返回的最大日志条数，默认50",
          default: 50,
          minimum: 1,
          maximum: 200
        },
        offset: {
          type: "number",
          description: "跳过的日志条数（用于分页），默认0",
          default: 0,
          minimum: 0
        }
      },
      required: []
    }
  },

  // ========== 自定义扩展 ==========
  {
    name: "add_custom_service_to_mailbox",
    description: "为邮箱添加自定义服务（不使用模板）。可以直接指定服务名称和登录URL。",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "邮箱地址"
        },
        name: {
          type: "string",
          description: "自定义服务名称，例如: 内部系统"
        },
        loginUrl: {
          type: "string",
          description: "登录URL"
        },
        note: {
          type: "string",
          description: "备注信息"
        },
        expiresAt: {
          type: "number",
          description: "过期时间戳（Unix时间，单位：秒）"
        }
      },
      required: ["mailbox", "name", "loginUrl"]
    }
  },
  {
    name: "remove_service_from_mailbox",
    description: "从邮箱移除关联的服务。",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: {
          type: "string",
          description: "服务ID（从get_mailbox_services获取）"
        }
      },
      required: ["serviceId"]
    }
  },
  {
    name: "update_service_expiration",
    description: "更新邮箱服务的过期时间。",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: {
          type: "string",
          description: "服务ID"
        },
        expiresAt: {
          type: "number",
          description: "新的过期时间戳（Unix时间，单位：秒），传null表示永不过期"
        }
      },
      required: ["serviceId"]
    }
  },
  {
    name: "batch_bind_services_to_mailboxes",
    description: "批量为多个邮箱绑定服务模板。支持同时绑定多个模板和自定义服务。",
    inputSchema: {
      type: "object",
      properties: {
        mailboxes: {
          type: "array",
          description: "邮箱地址数组"
        },
        templateIds: {
          type: "array",
          description: "服务模板ID数组（可选）"
        },
        customServices: {
          type: "array",
          description: "自定义服务数组（可选），每个对象包含name和loginUrl字段"
        }
      },
      required: ["mailboxes"]
    }
  }
]
