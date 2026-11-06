'use strict';

const MESSAGES = Object.freeze({
  PLATFORM: '记忆连接目前支持 Windows 与 macOS；其他席位的本地安装照常使用。',
  APP_MISSING: '请先安装 Grok Bot 桌面版，并打开登录一次。',
  LOGIN_FILE: '未找到有效的 Grok Bot 登录记录，请先在 Grok Bot 中登录。',
  DECRYPT: '系统尚未解开 Grok Bot 登录记录，请使用同一系统账户重新登录 Grok Bot。',
  EXPIRED: 'Grok Bot 登录已过期，请在目标软件重新登录，再点重新检测。',
  AUTH: '登录状态已失效，请重新登录 Grok Bot 后再连接。',
  PERMISSION: '当前账号没有这项接口权限。',
  NETWORK: '服务连接中断，请检查网络后重试。',
  TIMEOUT: '等待超时，请打开 Grok Bot 检查对应对话，再重新读取记忆。',
  CANCELLED: '已停止等待。已经发送的请求仍可能在服务端执行，请重新读取核对。',
  REDIRECT: '接口发生跳转，登录凭证未向跳转地址发送。',
  RESPONSE: '服务端返回格式异常，请更新目标软件后重新检测。',
  RATE_LIMIT: '服务请求过于频繁，请稍后重试。',
  SERVICE: '记忆服务暂时未完成请求，请稍后重试。',
  DELIVERY: 'Bot 尚未接收这条请求，请在 Grok Bot 内查看会话状态。',
  BOT_RESULT: 'Bot 返回了未完成结果，请重新读取记忆核对。',
  BUSY: '有一项记忆操作正在进行，请等待或先停止。',
  NOT_CONNECTED: '请先连接本机 Grok Bot 登录状态。',
  BOT: '请选择当前连接返回的 Bot。',
  INPUT: '请检查内容、范围、属性与确认选项。',
  STALE: '预览已经失效，请重新预览后确认。',
  ACTION: '未知记忆操作。',
});

class MemoryError extends Error {
  constructor(code, checks) {
    super(MESSAGES[code] || MESSAGES.SERVICE);
    this.name = 'MemoryError';
    this.code = MESSAGES[code] ? code : 'SERVICE';
    if (checks) this.checks = checks;
  }
}

// Never expose native stderr, RPC bodies, account profiles or session material.
function publicError(error) {
  return { code: error instanceof MemoryError ? error.code : 'SERVICE',
    message: error instanceof MemoryError ? error.message : MESSAGES.SERVICE };
}

module.exports = { MemoryError, publicError };
