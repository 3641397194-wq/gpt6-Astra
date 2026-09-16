<div align="center">
  <img src="docs/assets/coldcoffee-cover-v3.png" width="100%" alt="冷咖啡原创黑白漫画主视觉" />
  <h1>冷咖啡 · 破甲工作台</h1>
  <p><strong>六模型席位 · 五档工作模式 · 本地任务构建 · 会话版本对比</strong></p>
  <p>保留冷咖啡的直接与锋利，让任务更明确，让输出有据可查。</p>
  <p><a href="#软件界面">软件界面</a> · <a href="#上手使用">上手使用</a> · <a href="#模型席位">模型席位</a> · <a href="#冷咖啡社群">三个 QQ 群</a></p>
  <p><sub>3.0.0-preview.2 · 本地预览版 · 尚未验证真实模型突破效果</sub></p>
</div>

<blockquote>
<p><strong>启动口令：<code>冷咖啡</code></strong></p>
<p>完成安装与接入后，在目标软件的对话框里<strong>单独发送「冷咖啡」</strong>。不要只打开安装器，也不要把口令夹在一大段话里。</p>
<p>接入严格控制层时，未输入口令保持待机；安装完成不等于已激活。原版兼容部署与严格开关的接入说明见 <a href="docs/ACTIVATION.md">启动说明</a>。</p>
</blockquote>

<h2 id="软件界面">软件界面</h2>
<p>不是一张概念图。下图来自这次新版界面的实际运行：左侧选择席位，输入冷咖啡验证会话开关，查看词包与文件差异，再确认真实写入。</p>
<img src="docs/assets/workbench-avatar-cc4af119d023.png" width="100%" alt="冷咖啡新版软件实机界面：任务构建与交付预览" />
<table>
<tr><th align="left">构建更清楚</th><th align="left">版本看得见</th><th align="left">输出可检查</th></tr>
<tr><td>原词包保持不变。桌面端自动识别配置目录并展示差异，确认写入前自动备份；也支持手动选择。</td><td>部署历史保存在所选目录，可按版本恢复。文件在部署后被改动时中止恢复，保留现场。</td><td>逐文件核对 SHA-256。另提供 JSON、代码围栏与必含词检查，不预填成功率。</td></tr>
</table>
<p><strong>边界说明：</strong>席位选择是任务模板配置，不代表模型已连接；本地构建不会向模型发请求。任务模板的会话记录保存在内存，刷新后清空；部署备份单独保存在所选目录。文本条件通过不等于模型突破或代码正确。</p>

<h2 id="上手使用">上手使用</h2>
<ol>
<li><strong>选模型与目录：</strong>选择模型席位和明确的目标目录，预览将写入的原版词包与文件差异。</li>
<li><strong>确认安装：</strong>确认备份并写入，检查配置文件。严格开关需目标客户端接入消息处理层；浏览器专用目录用于演示，不是客户端真实配置目录。</li>
<li><strong>输入口令：</strong>重新加载对应客户端后，在对话框单独发送 <code>冷咖啡</code>，显示原欢迎页后再开始任务。</li>
</ol>
<p>从项目根目录启动桌面端（需要 Node.js 和 npm）：</p>
<pre><code>cd desktop
npm ci
npm start</code></pre>
<p>运行新功能测试：</p>
<pre><code>cd desktop
npm test</code></pre>
<p>从项目根目录启动浏览器预览（需要 Node.js；此启动入口还需 Python 3.9+）：</p>
<pre><code>python tools/preview/server.py</code></pre>
<p>浏览器访问本机端口 8772 的 <code>/readme-preview</code> 查看本页，访问 <code>/workbench/</code> 操作新版工作台。浏览器与桌面端复用同一套界面和任务构建代码。</p>
<details><summary>已有用户：原版席位工具与本次升级范围</summary>
<p>原版席位包与根目录命令行入口保留，新界面已接入独立事务式部署、检查和版本恢复，桌面端启动和切换席位时自动定位环境变量或约定配置目录，只预览不静默写入。DeepSeek 支持 Hermes 实际目录，GLM 支持 ZCode 实际目录。确认后安装清单文件；网页预览仅操作演示目录。</p>
<p>原有命令行参数见 <code>python coldbrew.py --help</code>；原有席位文档见 <a href="docs/SEAT-PACKS.md">席位包说明</a>。严格启动适配器与原版兼容部署分开：第三方客户端必须接入消息处理层，原版提示词文件自身不是强制开关。详见 docs/ACTIVATION.md。</p>
</details>

<h2 id="模型席位">模型席位</h2>
<table>
<tr><th>GPT-6 Astra</th><th>Claude Code</th><th>Grok 4.6</th></tr>
<tr><td>目标 · 实现 · 验收</td><td>约束 · 结构 · 复核</td><td>问题 · 产物 · 待验证项</td></tr>
<tr><th>DeepSeek v4.1</th><th>GLM 5.3</th><th>Gemini</th></tr>
<tr><td>拆分 · 复现 · 检查</td><td>条目 · 推进 · 交付</td><td>素材 · 组织 · 验证</td></tr>
</table>
<p>以上是仓库中的席位名称与组织方式，不是提供商的模型可用性保证。</p>

<h2 id="冷咖啡社群">冷咖啡社群</h2>
<p>交流用法，讨论模型，分享作品。三个 QQ 群统一展示，点击二维码查看原图。</p>
<table>
<tr><th>QQ 交流群</th><th>QQ 专题群</th><th>Cool coffeeAI 交流</th></tr>
<tr><td align="center"><a href="docs/assets/qq-group-1-card.png"><img src="docs/assets/qq-group-1-card.png" width="220" alt="QQ 交流群二维码" /></a></td><td align="center"><a href="docs/assets/qq-group-2-card.png"><img src="docs/assets/qq-group-2-card.png" width="220" alt="QQ 专题群二维码" /></a></td><td align="center"><a href="docs/assets/qq-group-3-card.png"><img src="docs/assets/qq-group-3-card.png" width="220" alt="Cool coffeeAI 交流群二维码" /></a></td></tr>
<tr><td align="center"><code>1057540028</code></td><td align="center"><code>1077074552</code></td><td align="center"><code>618179023</code></td></tr>
</table>
<hr />
<p align="center"><strong>冷咖啡</strong> · 把想法做出来，把作品留下来。</p>
