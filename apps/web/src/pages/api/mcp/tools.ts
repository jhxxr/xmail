import type { APIRoute } from "astro"
import { authenticateApiKey, unauthorizedResponse } from "../../../lib/api-auth"
import { MCP_TOOLS } from "../../../lib/mcp-tools"

/**
 * MCP工具列表端点
 * GET /api/mcp/tools
 *
 * 返回所有可用的MCP工具定义
 */
export const GET: APIRoute = async (context) => {
  // 验证API Key
  if (!await authenticateApiKey(context)) {
    return unauthorizedResponse()
  }

  return new Response(JSON.stringify({
    success: true,
    tools: MCP_TOOLS
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  })
}
