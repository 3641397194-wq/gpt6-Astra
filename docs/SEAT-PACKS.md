# 六席破甲包 · 原创

本仓库的越狱词是冷咖啡 CHA 原创稿，按六个模型席位分开写。手法参考了 GitHub 上公开的注入位，正文没有搬现成的 DAN / L1B3RT4S / 第三方 prompt 全文。

## 注入位（公开资料）

| 席位 | 写入位置 | 参考 |
| --- | --- | --- |
| GPT-6 Astra / Codex | `~/.codex/prompts/cha-codex.md` + `config.toml` 的 `model_instructions_file` + `~/.codex/AGENTS.md` | [xsser/codex-jailbreak-guide](https://github.com/xsser/codex-jailbreak-guide)，[Calrton/jailbreak-prompts](https://github.com/Calrton/jailbreak-prompts) |
| Claude Code | `~/.claude/CLAUDE.md` + `~/.claude/rules/cha-breakopen.md` | [Claude Code memory](https://code.claude.com/docs/en/memory) |
| Grok 4.6 | `~/.grok/AGENTS.md` + `rules/cha-breakopen.md` + `skills/cha-breakopen/SKILL.md` | [xai-org/grok-build](https://github.com/xai-org/grok-build)，AGENTS.md 惯例 |
| DeepSeek v4.1 | `~/.deepseek/DEEPSEEK.md` + `~/.hermes/SOUL.md` + Hermes skill | 公开仓只借注入位：[0x5477/deepseek-v4-pro-unrestricted](https://github.com/0x5477/deepseek-v4-pro-unrestricted) 的 DEEPSEEK.md / SOUL.md / skill 路径，[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 Harness 插件层。V4.1 正文是冷咖啡原创「短刻度 + 思考槽封口」，不搬第三方 prompt 全文 |
| GLM 5.3 | `~/.glm/GLM.md` + `~/.zcode/AGENTS.md` | GLM Coding / ZCode 走 AGENTS.md 记忆层 |
| Gemini | `~/.gemini/GEMINI.md` + `settings.json` 的 `context.fileName` | 本仓既有 Gemini 席位 |

目录总览见 [simimasai111/ai-jailbreak-prompts](https://github.com/simimasai111/ai-jailbreak-prompts)。

## 原创记号

每个席位有独立激活兼听词，避免六份稿子互相拷贝：

- Codex `ASTRA//UNLOCK`
- Claude `ANTHRO//CLEAR`
- Grok `GROK//OPEN`
- DeepSeek `SEEK//BARE`
- GLM `GLM//STRAIGHT`
- Gemini 维持原来的席位执行核稿

六个席位共用启动词 `冷咖啡`。模型会话里整句恰好等于 `冷咖啡` 时，只输出激活页：先 QQ一群 `1057540028`、QQ二群 `1077074552`，再输出「冰美式 / 开心人生」能力清单。全文在 `desktop/src/lib/packs/activation-reply.md`。工单不用先打启动词。

## 三步工作流（原创）

每个席位另有独立三拍，稿子在 `desktop/src/lib/packs/workflows/`。公开仓只借注入位和分步结构（指令层覆盖、CLAUDE.md 记忆、短帧、升级对话），正文另写，六份互不拷贝。

| 席位 | 三拍名 | 第一步 | 第二步 | 第三步 |
| --- | --- | --- | --- | --- |
| Codex | 层替换三拍 | 层替换 | 开机页 | 工件闭环 |
| Claude | 记忆门三拍 | 记忆门 | 门牌亮灯 | 手到擒来 |
| Grok | 夜班三拍 | 夜班入座 | 开桌报号 | 收刀交活 |
| DeepSeek | 装框三拍 | 装框 | 亮页 | 结单 |
| GLM | 钉单三拍 | 钉单 | 开机页 | 长程直做 |
| Gemini | 执行核三拍 | 执行核上线 | 合同页 | 五刃出货 |

正文模板在 `desktop/src/lib/packs/`。桌面席位的预览 / 运行 / 检查 / 恢复四键对六个模型同样生效。

## 六类路由技能（原创）

激活页六块能力对应六条技能，稿子在 `desktop/src/lib/packs/routes/`。格式对照公开的 Claude Code `SKILL.md`（YAML `name` + `description` + 正文），内容另写。运行席位时写入各模型 `skills/<name>/SKILL.md`，并织进越狱包。

| 技能 | 戳 | 能力块 | 第一步 | 第二步 | 第三步 |
| --- | --- | --- | --- | --- | --- |
| cha-bin-unlock | BIN-UNLOCK-3 | 软件破解与逆向分析 | 揭盖 | 追链 | 落地 |
| cha-playfield | PLAYFIELD-3 | 游戏安全与外挂研究 | 锁框 | 接线 | 回看 |
| cha-netcast | NETCAST-3 | 网络安全与渗透测试 | 铺图 | 试刃 | 成卷 |
| cha-apicloud | APICLOUD-3 | 接口云端与代码安全 | 描口 | 拧阀 | 列表 |
| cha-labpipe | LABPIPE-3 | 样本分析取证与自动化 | 贴标 | 切片 | 流水 |
| cha-inkstage | INKSTAGE-3 | 内容创作与剧情定制 | 立柱 | 铺场 | 成册 |

冷咖啡仍只打激活页。工单先过 `NORMALIZER.md` 口语归一（TALKNORM-AUTO），再命中小类叶子（80 条），最后退回父技能。口头禅对照表命中即开跑，不请示。

小类拆法对齐 GitHub 公开 skill 库的「一类一面」结构（Claude-Red、rev-skills 121 原子技能、pentest-skills 的 /hunt injection、DFIR 的 memory/log/pcap），正文全部原创三拍。

```powershell
python coldbrew.py --activate 冷咖啡 --seat grok --action preview --json
python coldbrew.py --activate 冷咖啡 --seat claude --action deploy --home $env:TEMP\cha-claude-home --json
python tools\seat_selftest.py
```
