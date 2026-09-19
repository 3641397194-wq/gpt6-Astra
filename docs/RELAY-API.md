# 冷咖啡中转 · Codex 接入说明

冷咖啡中转是付费模型服务。把 API 地址和 API Key 接入自己的 Codex 即可使用，无需安装本软件或本地 Skill 文件。根据中转服务说明，内置工作流随请求自动应用；具体工作流与版本以服务端配置为准。

本软件提供接入检查、配置复制和任务发送入口。当前未配置公开工作流目录接口，连接成功仅说明对应 API 已响应，不代表已经验证工作流激活。

## 接入步骤

1. 在 [冷咖啡中转站](https://coldcoffeeai.com/) 按需付费开通服务，并取得 API Key。
2. 在桌面端“冷咖啡中转”页填写 Base URL `https://coldcoffeeai.com/v1` 与 API Key，点击“测试接入状态”。Key 在软件内填写即可。
3. 从服务端返回的模型列表选择真实模型 ID，优先选择可用的 GPT-6 Astra 或 GPT-5.6 Sol。
4. 点击“复制 Codex 配置”，合并到自己的用户级配置文件。该按钮仅复制 TOML，不含 API Key。
5. 使用独立复制按钮取得 API Key 环境变量命令，在 PowerShell 中执行后，从同一个终端启动 `codex`。图形客户端按其接入说明配置提供商与密钥。

“复制 Key 设置命令”会把真实 Key 放入剪贴板。执行后同时设置当前终端与 Windows 用户级环境变量；用户级变量会保存在本机，PowerShell 也可能保留命令历史。请仅在自己的电脑执行，勿把命令或截图发到群聊、仓库或工单。图形客户端需要完全退出并重新启动以加载新环境。下方手写 `$env:` 示例仅设置当前终端与它新启动的子进程。

## Codex 用户级配置

文件位置：`%USERPROFILE%\.codex\config.toml`，其他系统为 `~/.codex/config.toml`。将下面的 `MODEL_ID_FROM_MODELS` 替换为测试连接返回的真实模型 ID；已有配置请合并对应字段，保留其他设置。

```toml
model_provider = "coldcoffee"
model = "MODEL_ID_FROM_MODELS"
# 仅在所选模型支持时启用：
# model_reasoning_effort = "xhigh"

[model_providers.coldcoffee]
name = "冷咖啡中转"
base_url = "https://coldcoffeeai.com/v1"
env_key = "COLDCOFFEE_API_KEY"
wire_api = "responses"
requires_openai_auth = false
```

在 PowerShell 当前会话设置 Key 并启动 Codex：

```powershell
$env:COLDCOFFEE_API_KEY = "YOUR_API_KEY"
codex
```

“完全访问”属于顾客自己的 Codex 本地工具权限，按任务需要设置；它与中转套餐、模型权限、余额分开。高推理档位也应以所选模型支持的值为准。

配置字段来源：[Codex 官方配置参考](https://developers.openai.com/codex/config-reference/)。

## 真实请求与使用状态

| 操作 | 请求 | 说明 |
| --- | --- | --- |
| 测试接入 | `GET /v1/models` | 验证 Key 并读取可用模型；不会生成任务内容。 |
| 读取用量 | `GET /v1/usage` | 展示服务端返回的信息；异常或空值按实际状态显示。 |
| 发送任务 | `POST /v1/responses` | 明确点击发送后才提交，可能按服务规则产生模型费用；当前工作台等待完整结果后展示。 |

请求使用 `Authorization: Bearer <API_KEY>`。桌面端接入时将 Key 保存在当前会话内存，不自动写入磁盘；“复制 Codex 配置”文本不含密钥。独立“复制 Key 设置命令”属于用户主动导出，执行后的本机保存行为见上文。浏览器预览用于查看界面；真实接口操作在桌面端进行。

公开入口与鉴权错误响应已经核对，带有效 Key 的账号成功响应仍待顾客在软件中验证。`/models` 成功仅证明列表请求成功；具体模型生成、用量权限与内置工作流应分别以相应响应和服务说明确认。

## 常见返回

- `401 Invalid API key`：检查 Key 是否完整、有效，以及是否来自当前中转站。
- `404`：检查 Base URL 是否正确包含 `/v1`，以及服务是否提供当前请求的端点。
- 模型列表缺少推荐名称：使用列表内的真实模型 ID，具体可用范围向中转站管理员确认。
- 用量返回为空或报错：界面按实际状态显示，不把空值当作零余额；计费信息可在中转站查看。
- 模型请求失败：结合返回的状态码和错误内容，检查额度、模型 ID 与请求参数。

中转套餐/用量费用与闭源工作流授权费用分开计算。闭源工作流安装到顾客电脑，可搭配自己的订阅或其他兼容中转。需要购买、定制或交付说明，加入 [仓库主页的三个 QQ 群](../README.md#冷咖啡社群) 中任一个，再私聊管理员。
