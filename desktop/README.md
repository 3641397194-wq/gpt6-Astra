# [gpt6 Astra-claude全模型支持-grok4.7-deepseekv4.1-glm5.3-gemini全模型支持破甲越狱](https://github.com/3641397194-wq/gpt6-Astra) Desktop

完整桌面工作台：启动页、指挥台、五档工作档位、五个 BREAK//OPEN 通道、六个模型席位（含 GLM 5.3 与 Gemini全模型支持）、明确目标输入、活动流、结果面板、隔离状态与社群入口。

六个席位的「预览 / 运行 / 检查 / 恢复」都会写入该模型自己的本地指令层：Codex `model_instructions_file`、Claude `CLAUDE.md`、Grok `AGENTS.md` / skills、DeepSeek v4.1 Flash 官方 Harness `$DSH_HOME` / `~/.dsh` 的 `AGENTS.md` / skills、GLM `GLM.md`、Gemini `GEMINI.md`。原稿备份在各自 `cha-backups\`。

## 启动

```powershell
npm install
npm start
```

打包 Windows 便携版：

```powershell
npm run pack:win
```

品牌启动词是 `冷咖啡`，控制词是 `BREAK//OPEN`，当前版本为 `2.3.6`。 DeepSeek 席位已升到 V4.1 短刻度破甲。启动词 `冷咖啡` 会先打出两个 QQ 群号，再打出激活页。工单先口语归一再全自动打到 80 条小类三拍。
