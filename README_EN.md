<div align="center">

<img src="docs/assets/readme-noir-hero.svg" width="100%" alt="ColdBrew Zero dark manga hero" />

<br />

<img src="docs/assets/product-icon.png" width="96" alt="ColdBrew Zero product icon" />

# ColdBrew Zero / CHA

### gpt6 Astra-claude全模型支持-grok4.7-DeepSeek v4.1 Flash 10.17版本-glm5.3全模型支持-gemini全模型支持-MiniMax 3.1 Flash

**BREAK//OPEN** &nbsp;|&nbsp; **ORIGINAL TOOLBOX 3.2.0-preview.6 · THREE-PLATFORM RELEASE IN PREPARATION**

<sub>An original dark-manga visual system built from black ink, bone paper, a single crimson eye, and torn comic panels.</sub>

</div>

<p align="center"><strong>3.2.0-preview.6 is being prepared for Windows, macOS, and Linux.</strong><br /><sub>This version adds the official Harness Desktop protocol path. Eight runtime acceptance checks passed against the official Windows build; release packages remain in preparation.</sub></p>

> **⚠️ Disclaimer · 免责声明**
>
> **This project must NOT be used for any illegal or unlawful activity.** It is provided only for lawful and compliant learning, research, and use in environments you are authorized to operate. Prohibited uses include, without limitation: unauthorized intrusion, attacks, penetration, or data theft; fraud, money laundering, or distributing malware; generating or spreading illegal or harmful content; infringing others' privacy, intellectual property, or other legal rights; and violating applicable laws or the terms of use of third-party platforms and model services.
>
> You are solely responsible for complying with the laws and regulations of your jurisdiction and with the terms of the software and services you use. All actions and consequences arising from the use of this project are borne entirely by the user, and the authors and contributors accept no liability. If you do not agree, do not download, install, or use this project.
>
> **严禁将本项目用于任何违法违纪活动。**本项目仅供合法、合规的学习、研究和在你本人有权操作的环境里使用。包括但不限于：未经授权的入侵、攻击、渗透、窃取数据；诈骗、洗钱、传播恶意程序；生成或传播违法有害内容；侵犯他人隐私、知识产权和其他合法权益；违反所在地法律法规或第三方平台、模型服务的使用条款。使用者须自行遵守所在国家和地区的法律法规及相关服务条款，使用本项目产生的一切行为和后果由使用者自行承担，与项目作者及贡献者无关。如果你不同意以上内容，请不要下载、安装或使用本项目。

---

## 01 / Night Sequence

ColdBrew Zero arranges objective, context, output, and review as four panels. The repository, desktop app, and community channels now share one black, bone-white, and crimson system.

<div align="center">
  <img src="docs/assets/readme-noir-chain.svg" width="100%" alt="Four-panel work sequence" />
</div>

## Quick Start

```bash
python coldbrew.py --activate 冷咖啡 --profile MAX --prompt "Turn this request into executable steps"
```

```bash
python coldbrew.py --activate 冷咖啡 --seat gemini --action deploy --json
python coldbrew.py --activate 冷咖啡 --seat claude --action deploy --json
python coldbrew.py --activate 冷咖啡 --seat grok --action deploy --json
```

```bash
cd desktop
npm ci
npm start
```

Build packages with the platform-specific commands: `npm run pack:win` (Windows portable), `npm run pack:mac` (macOS DMG and ZIP), or `npm run pack:linux` (Linux AppImage and DEB). GitHub Actions builds each platform on native runners, with packaged UI checks and SHA-256 checksums. Version 3.2.0-preview.6 is in release preparation.

All 15 model seats write an original CHA pack or skill into the selected local instruction directory. Backups land in each home's `cha-backups/`. Use `verify` and `restore` for the marked block. See [docs/SEAT-PACKS.md](docs/SEAT-PACKS.md).

IDA user plugins resolve to `%APPDATA%\\Hex-Rays\\IDA Pro\\plugins` on Windows, `~/Library/Application Support/Hex-Rays/IDA Pro/plugins` on macOS, and `~/.idapro/plugins` on Linux. Set `IDAUSR` to override the user directory. The IDA MCP package cache follows each platform's user data directory; set `DOUBAO_USER_SKILLS` or `WORKBUDDY_HOME` when a client uses a custom location.

## 02 / Fifteen AI Models

The 15 model seats are `GPT-6 Astra全模型支持 / Codex`, `Claude Code全模型支持`, `Grok 4.7`, `DeepSeek v4.1 Flash 10.17版本`, `GLM 5.3全模型支持`, `Gemini全模型支持`, `豆包`, `WorkBuddy`, `Cursor`, `MiniMax 3.1 Flash`, `Kimi K3.1`, `Grok Bot`, `Claude Duet`, `ChatGPT Dot`, and `Meta Muse`.

The DeepSeek seat targets the October 17 official Harness `0.2.1-rc.2` on Windows, macOS, and Linux. It installs only under `$DSH_HOME` (default `~/.dsh`), with a short `AGENTS.md` entry and `skills/cha-deepseek/SKILL.md`; the shared `$DSH_AGENTS_HOME` / `~/.agents` root remains untouched. See the [Harness installation notes](docs/SEAT-PACKS.md#deepseek-官方-harness-安装说明).

<div align="center">
  <img src="docs/assets/readme-noir-seats.svg" width="100%" alt="Fifteen AI model seats" />
</div>

## Desktop interface / Install, connect, and stay in touch

Select the model seats you use, install their bundled skills, and check the result in one workbench. Files are backed up before writing and verified afterward; uninstall restores the saved backup.

<p align="center">
  <a href="docs/assets/coldcoffee-workbench-install.png"><img src="docs/assets/coldcoffee-workbench-install.png" width="100%" alt="ColdCoffee Workbench 3.2.0-preview.5 installation page with model seats, skill resources, and installation checks" /></a><br />
  <sub>Installation · Select clients, back up files, install, verify, and restore</sub>
</p>

<table>
  <tr>
    <td width="50%"><a href="docs/assets/coldcoffee-workbench-relay.png"><img src="docs/assets/coldcoffee-workbench-relay.png" width="100%" alt="ColdCoffee relay page with the API address, key field, model selection, and Codex configuration" /></a></td>
    <td width="50%"><a href="docs/assets/coldcoffee-workbench-community.png"><img src="docs/assets/coldcoffee-workbench-community.png" width="100%" alt="ColdCoffee community page with all three QQ groups, Telegram chat, and channel" /></a></td>
  </tr>
  <tr><td align="center"><strong>ColdCoffee relay</strong><br /><sub>Enter a key, choose a model, copy the Codex configuration, and check the connection</sub></td><td align="center"><strong>ColdCoffee community</strong><br /><sub>QQ and Telegram links for usage, support, and paid local customization</sub></td></tr>
</table>

**Enter 冷咖啡 to start:** after installation, restart the target client and send **冷咖啡** as a separate message. DeepSeek Harness also accepts the same word in the companion's activation field.

<sub>These are actual screenshots of the 3.2.0-preview.5 desktop application. Click any screenshot to open the full image.</sub>

## DeepSeek Harness / ColdCoffee workspace

ColdCoffee (冷咖啡) adds an ice-blue skin across the official Harness Desktop / Web interface, an animated opening, and a companion panel for workflows, task records, community, and appearance. It reuses the bundled REA and reverse-skill resources and preserves the original activation word and complete welcome text.

<p align="center">
  <a href="docs/assets/deepseek-harness-opening.png"><img src="docs/assets/deepseek-harness-opening.png" width="100%" alt="ColdCoffee DeepSeek Harness opening with ice-blue artwork, relay and community links" /></a>
</p>

<table>
  <tr>
    <td width="50%"><a href="docs/assets/deepseek-harness-workspace.png"><img src="docs/assets/deepseek-harness-workspace.png" width="100%" alt="Official DeepSeek Harness Web interface with the ColdCoffee skin and companion" /></a></td>
    <td width="50%"><a href="docs/assets/deepseek-harness-community.png"><img src="docs/assets/deepseek-harness-community.png" width="100%" alt="ColdCoffee community panel with all three QQ groups, Telegram and paid service links" /></a></td>
  </tr>
  <tr><td align="center"><sub>Harness Web · Host skin and workspace artwork</sub></td><td align="center"><sub>Community · QQ groups, Telegram chat and channel</sub></td></tr>
</table>

<sub>The three images above preserve the earlier official <code>0.2.1-rc.2</code> Web screenshots. The images below show the Windows Desktop acceptance run for this version.</sub>

### Official Windows Desktop / Workflows and community

<table>
  <tr>
    <td width="50%"><a href="docs/assets/deepseek-harness-desktop-workspace.png"><img src="docs/assets/deepseek-harness-desktop-workspace.png" width="100%" alt="Official Windows Harness Desktop 0.2.1-rc.5 with six existing ColdCoffee workflows and a connected Desktop status" /></a></td>
    <td width="50%"><a href="docs/assets/deepseek-harness-desktop-community.png"><img src="docs/assets/deepseek-harness-desktop-community.png" width="100%" alt="Official Windows Harness Desktop 0.2.1-rc.5 with all three QQ groups, Telegram links, and the relay entry" /></a></td>
  </tr>
  <tr><td align="center"><sub>Windows Desktop · Six existing workflows</sub></td><td align="center"><sub>Windows Desktop · Community and relay</sub></td></tr>
</table>

<sub>These images show an isolated observation copy of the official <code>0.2.1-rc.5</code> bundle. All eight checks passed, including a task completed and recorded by the official SessionController against a local deterministic model fixture. Paid API calls, research findings, and real REA execution remain to be tested. Official Desktop runtime acceptance currently covers Windows; see the plugin guide for the exact scope.</sub>

Install into the Harness data root used by Desktop (default `~/.dsh`, or your custom `$DSH_HOME`). The plugin uses relative `/coldcoffee` requests through the official `dsh-app://app` proxy, with Host authentication handled by the client. Model settings and tool permissions remain in Harness.

The six existing research entries cover Web and API security review, API identity and access review, staged research planning, REA reverse engineering and sample analysis, source review, and evidence/report preparation. Each entry resolves to an installed skill and submits work through the official Harness session service; status and findings follow actual events and tool results.

In the desktop workbench, select **安装到 DeepSeek**, fully quit and reopen official Harness Desktop, or restart Harness Web, and enter **冷咖啡** in the companion. Installation backs up files before writing and verifies them afterward; uninstall restores the same transaction. See the [plugin guide, workflow mapping, and validation scope](docs/DEEPSEEK-PLUGIN.md).

[ColdCoffee paid API relay](https://coldcoffeeai.com/) · Closed-source workflows are paid local installation and customization services; existing subscriptions or another relay may be used. Contact an administrator privately through QQ groups **1057540028**, **1077074552**, or **618179023**. [Telegram chat](https://t.me/coolcoffeeai) · [Telegram channel](https://t.me/chachachalkf).

## 03 / Community Signal

<div align="center">
  <img src="docs/assets/readme-noir-community.svg" width="100%" alt="Community channels" />
</div>

<p align="center">
  <a href="docs/assets/qq-group-1-card.png">
    <img src="docs/assets/qq-group-1-card.png" width="280" alt="QQ discussion QR code, group 1057540028" />
  </a>
  <a href="docs/assets/qq-group-2-card.png">
    <img src="docs/assets/qq-group-2-card.png" width="280" alt="QQ topic QR code, group 1077074552" />
  </a>
  <a href="docs/assets/qq-group-3-card.png">
    <img src="docs/assets/qq-group-3-card.png" width="280" alt="Cool coffeeAI QR code, group 618179023" />
  </a>
</p>

<p align="center">
  Scan to join: <strong>QQ discussion</strong> <code>1057540028</code> &nbsp;|&nbsp; <strong>QQ topic</strong> <code>1077074552</code> &nbsp;|&nbsp; <strong>Cool coffeeAI</strong> <code>618179023</code>
</p>

<p align="center">
  <strong>Telegram chat</strong> <a href="https://t.me/coolcoffeeai"><code>t.me/coolcoffeeai</code></a>
  &nbsp;|&nbsp;
  <strong>Telegram channel</strong> <a href="https://t.me/chachachalkf"><code>t.me/chachachalkf</code></a>
</p>

---

<div align="center">

`CHA / COLD BREW ZERO / BREAK//OPEN / GPT-6 ASTRA / DeepSeek v4.1 Flash 10.17版本 / GLM 5.3全模型支持 / GEMINI / 2.3.6`

</div>

## Original toolbox / Downloads

Release 3.2.0-preview.6: all seven installers are in preparation. Packages are Windows x64 portable EXE, macOS Apple silicon arm64 and Intel x64 DMG/ZIP, and Linux x64 AppImage/DEB. The homepage and desktop UI list 15 AI model seats, including MiniMax 3.1 Flash, Kimi K3.1, Grok Bot, Claude Duet, ChatGPT Dot, and Meta Muse.

[Download all platforms](https://github.com/3641397194-wq/gpt6-Astra/releases/tag/v3.2.0-preview.6) · [Original toolbox and feature scope](docs/original-toolbox.md)

After all platform checks pass, the release will include the seven installers and SHA-256 checksums.

The 16 original tools run inside the application. AI automation provides a real tool/observation loop, with a 19-tool MCP server and an exportable skill. Larger exploitation, ticket/domain and remote-session modules remain future work.
