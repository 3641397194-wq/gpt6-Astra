// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

private enum ColdCoffeePalette {
    static let ink = Color(red: 0.10, green: 0.095, blue: 0.13)
    static let cream = Color(red: 0.97, green: 0.945, blue: 0.93)
    static let blush = Color(red: 0.96, green: 0.84, blue: 0.85)
    static let crimson = Color(red: 0.76, green: 0.10, blue: 0.25)
    static let line = Color(red: 0.88, green: 0.82, blue: 0.80)
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        TabView(selection: $model.tab) {
            HomeView()
                .tabItem { Label("首页", systemImage: "house") }
                .tag(AppModel.Tab.home)
            ChatView()
                .tabItem { Label("对话", systemImage: "bubble.left.and.bubble.right") }
                .tag(AppModel.Tab.chat)
            WorkView()
                .tabItem { Label("工作台", systemImage: "wrench.and.screwdriver") }
                .tag(AppModel.Tab.work)
            CommunityView()
                .tabItem { Label("社区", systemImage: "person.3") }
                .tag(AppModel.Tab.community)
        }
        .tint(ColdCoffeePalette.crimson)
        .background(ColdCoffeePalette.cream.ignoresSafeArea())
        .alert("需要处理", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("知道了") { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }
}

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingProvider = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Header(title: "冷咖啡 · iOS", subtitle: "付费 API 中转与模型对话")
                    VStack(alignment: .leading, spacing: 8) {
                        Text("手机端，也能随时接入")
                            .font(.system(size: 30 * model.fontScale, weight: .bold, design: .rounded))
                        Text("选择中转 · 读取模型 · 开始对话")
                            .font(.system(size: 16 * model.fontScale, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                    ProviderCard(provider: model.provider, connected: !model.apiKey.isEmpty) {
                        showingProvider = true
                    }
                    Button {
                        if model.loadModels() != nil { model.tab = .chat }
                    } label: {
                        Label("连接并读取模型  →", systemImage: "arrow.right")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    StatusCard(text: model.status)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("冷咖啡付费中转 · 电脑 / Android / iOS")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Link("访问 coldcoffeeai.com", destination: PublicServices.website)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(ColdCoffeePalette.crimson)
                    }
                }
                .padding(20)
            }
            .background(ColdCoffeePalette.cream)
            .sheet(isPresented: $showingProvider) {
                ProviderSheet()
                    .environmentObject(model)
            }
        }
    }
}

struct ChatView: View {
    @EnvironmentObject private var model: AppModel
    @State private var photosItem: PhotosPickerItem?
    @State private var showingManualModel = false
    @State private var manualModelId = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Image("BrandPortrait")
                        .resizable()
                        .scaledToFill()
                        .frame(width: 30, height: 30)
                        .clipShape(RoundedRectangle(cornerRadius: 9))
                        .accessibilityHidden(true)
                    Text("冷咖啡 · 对话")
                        .font(.title2.bold())
                    Spacer()
                    Menu {
                        ForEach(ModelCatalog.featured, id: \.self) { family in
                            let ids = model.models.filter { ModelCatalog.family(for: $0) == family }
                            if ids.isEmpty {
                                Button("\(family) · \(model.models.isEmpty ? "等待服务商目录" : "服务商未列出")") {}
                                    .disabled(true)
                            } else {
                                ForEach(ids, id: \.self) { id in
                                    Button("\(family) · \(id)") { model.selectModel(id) }
                                }
                            }
                        }
                        Divider()
                        if !model.selectedModel.isEmpty && !model.models.contains(model.selectedModel) {
                            Button("当前使用 · \(model.selectedModel)") {}
                                .disabled(true)
                        }
                        ForEach(model.models.filter { ModelCatalog.family(for: $0) == nil }, id: \.self) { id in
                            Button(id) { model.selectModel(id) }
                        }
                        Button("手动填写模型 ID") {
                            manualModelId = model.selectedModel
                            showingManualModel = true
                        }
                        Button("重新读取模型") { model.loadModels() }
                        Button("清空会话", role: .destructive) { model.clearHistory() }
                    } label: {
                        Label(model.selectedModel.isEmpty ? "选择模型" : model.selectedModel, systemImage: "slider.horizontal.3")
                            .lineLimit(1)
                    }
                    .font(.subheadline.weight(.semibold))
                    .alert("手动填写模型 ID", isPresented: $showingManualModel) {
                        TextField("服务商实际支持的模型 ID", text: $manualModelId)
                        Button("使用此模型") { model.selectModel(manualModelId, manuallyEntered: true) }
                        Button("取消", role: .cancel) {}
                    } message: {
                        Text("请求将使用填写的原始 ID；目录中的 GPT-6.2 选项只使用服务商返回的 ID。")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(ColdCoffeePalette.ink)
                .foregroundStyle(.white)

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            if model.messages.isEmpty {
                                EmptyChat()
                            } else {
                                ForEach(model.messages) { message in
                                    MessageBubble(message: message)
                                        .id(message.id)
                                }
                            }
                        }
                        .padding(20)
                    }
                    .onChange(of: model.messages.count) { _ in
                        if let last = model.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                    }
                }

                if let image = model.pickedImage {
                    HStack {
                        Image(systemName: "photo.fill")
                        Text(image.name)
                        Spacer()
                        Button("移除") { model.pickedImage = nil }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(ColdCoffeePalette.blush)
                }

                HStack(alignment: .bottom, spacing: 10) {
                    PhotosPicker(selection: $photosItem, matching: .images) {
                        Image(systemName: "paperclip")
                            .font(.title3)
                            .frame(width: 38, height: 38)
                            .background(ColdCoffeePalette.blush)
                            .clipShape(Circle())
                    }
                    .onChange(of: photosItem) { item in
                        Task { await model.setImage(item) }
                    }
                    TextField("输入消息…", text: $model.chatDraft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...5)
                        .accessibilityIdentifier("chat-draft")
                    Button {
                        if model.isBusy { model.stop() } else { model.sendDraft() }
                    } label: {
                        Image(systemName: model.isBusy ? "stop.fill" : "arrow.up")
                            .frame(width: 38, height: 38)
                    }
                    .buttonStyle(PrimaryIconButtonStyle())
                    .accessibilityLabel(model.isBusy ? "停止生成" : "发送消息")
                    .accessibilityIdentifier("chat-send")
                }
                .padding(14)
                .background(.thinMaterial)
            }
            .background(ColdCoffeePalette.cream)
        }
    }
}

struct CommunityView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Header(title: "冷咖啡 · 社区", subtitle: "中转开通、售后与定制服务")
                    Text("加入冷咖啡社群")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                    Text("开通中转、手机接入和服务咨询都在这里。")
                        .foregroundStyle(.secondary)
                    Card {
                        Text("QQ 四群")
                            .font(.headline)
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                            ForEach(Array(PublicServices.groups.enumerated()), id: \.offset) { _, group in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(group.name).font(.caption.weight(.semibold))
                                    Text(group.number).font(.subheadline.bold()).foregroundStyle(ColdCoffeePalette.crimson)
                                }
                            }
                        }
                    }
                    Card(background: ColdCoffeePalette.ink) {
                        Text("Telegram")
                            .font(.headline)
                            .foregroundStyle(.white)
                        Link("聊天群  ·  t.me/coolcoffeeai", destination: PublicServices.telegram)
                            .foregroundStyle(.white.opacity(0.9))
                        Link("频道    ·  t.me/chachachalkf", destination: PublicServices.channel)
                            .foregroundStyle(.white.opacity(0.9))
                    }
                    Card(background: ColdCoffeePalette.blush) {
                        Text("收费服务")
                            .font(.headline)
                            .foregroundStyle(ColdCoffeePalette.crimson)
                        Text("冷咖啡付费 API 中转\n闭源本机工作流 · 定制开发")
                            .font(.subheadline.weight(.semibold))
                        Text("进 QQ 群私聊管理，沟通方案与报价")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Card {
                        Text("微信入口")
                            .font(.headline)
                        Text("通过 QQ 群联系管理获取最新入口")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(20)
            }
            .background(ColdCoffeePalette.cream)
        }
    }
}

struct WorkView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingFileImporter = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Header(title: "冷咖啡 · 工作台", subtitle: "手机也能提交可追溯的研究任务")
                    Text("选择一个工作流")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                    Text("连接你的中转后，手机可以提交目标、接口、日志、样本文件和报告要求，流式查看结构化结果；桌面端继续负责本机工具和文件落地。")
                        .foregroundStyle(.secondary)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(AppModel.WorkMode.allCases) { mode in
                            Button {
                                model.workMode = mode
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Image(systemName: mode.icon)
                                        .font(.title3.weight(.semibold))
                                    Text(mode.title)
                                        .font(.subheadline.weight(.bold))
                                        .lineLimit(1)
                                    Text(mode.summary)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                                .frame(maxWidth: .infinity, minHeight: 82, alignment: .leading)
                                .padding(12)
                                .background(model.workMode == mode ? ColdCoffeePalette.blush : Color.white.opacity(0.72))
                                .overlay(RoundedRectangle(cornerRadius: 16).stroke(model.workMode == mode ? ColdCoffeePalette.crimson : ColdCoffeePalette.line, lineWidth: model.workMode == mode ? 2 : 1))
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    HStack {
                        Label(model.workMode.title, systemImage: model.workMode.icon)
                            .font(.headline)
                        Spacer()
                        Button("填入任务模板") { model.applyWorkStarter() }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ColdCoffeePalette.crimson)
                    }
                    Card {
                        TextField("TARGET / 文件名", text: $model.workTarget)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("HOST / 接口地址（可选）", text: $model.workHost)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                        TextField("希望得到的产出（可选）", text: $model.workObjective)
                    }
                    TextEditor(text: $model.workInput)
                        .frame(minHeight: 165)
                        .padding(8)
                        .background(Color.white.opacity(0.8))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(ColdCoffeePalette.line, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(alignment: .topLeading) {
                            if model.workInput.isEmpty {
                                Text("写入 TARGET、HOST、样本路径、接口、日志或希望得到的报告格式…")
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 16)
                                    .allowsHitTesting(false)
                            }
                        }
                    HStack(spacing: 10) {
                        Button {
                            showingFileImporter = true
                        } label: {
                            Label(model.workFileName.isEmpty ? "添加样本 / 日志" : "更换附件", systemImage: "paperclip")
                        }
                        .buttonStyle(.bordered)
                        if !model.workFileName.isEmpty {
                            Text(model.workFileName)
                                .font(.caption)
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Button {
                                model.removeWorkFile()
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                            }
                            .foregroundStyle(ColdCoffeePalette.crimson)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text("文件会先在手机端生成名称、大小和 SHA-256（单个文件不超过 64 MB）；文本类文件会附带有限预览，二进制样本交给桌面端继续落地分析。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 10) {
                        Button {
                            if model.workBusy { model.stopWork() } else { model.runWork() }
                        } label: {
                            Label(model.workBusy ? "停止任务" : "提交任务", systemImage: model.workBusy ? "stop.fill" : "bolt.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        if !model.workOutput.isEmpty {
                            Button {
                                model.copyWorkOutput()
                            } label: {
                                Image(systemName: "doc.on.doc")
                                    .frame(width: 44, height: 44)
                            }
                            .buttonStyle(.bordered)
                            ShareLink(item: model.workOutput) {
                                Image(systemName: "square.and.arrow.up")
                                    .frame(width: 44, height: 44)
                            }
                            .foregroundStyle(ColdCoffeePalette.crimson)
                        }
                    }
                    if !model.workOutput.isEmpty {
                        Card(background: ColdCoffeePalette.ink) {
                            HStack {
                                Text("\(model.workMode.title) · 流式结果")
                                    .font(.headline)
                                    .foregroundStyle(.white)
                                Spacer()
                                Text(model.status)
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.65))
                            }
                            Text(model.workOutput)
                                .font(.callout)
                                .foregroundStyle(.white.opacity(0.95))
                                .textSelection(.enabled)
                            HStack(spacing: 10) {
                                Button("保存到本机") { model.saveWorkOutput() }
                                Button("重新载入") { model.restoreSavedWork() }
                                Button("清空") { model.clearWork() }
                            }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                        }
                    } else {
                        Card {
                            Text("工作台入口")
                                .font(.headline)
                            Text(model.workMode.summary)
                                .font(.subheadline)
                            Text("输入结构化字段后提交，结果会流式回到本机，可复制、保存或分享；Key 和会话资料不会写入公开仓库。")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(20)
            }
            .background(ColdCoffeePalette.cream)
            .fileImporter(
                isPresented: $showingFileImporter,
                allowedContentTypes: [.data, .item, .text, .image, .archive],
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    if let url = urls.first { model.importWorkFile(url: url) }
                case .failure(let error):
                    model.errorMessage = "选择文件失败：\(error.localizedDescription)"
                }
            }
        }
    }
}

struct ProviderSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var baseURL = ""
    @State private var providerError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("当前服务") {
                    Text(model.provider.name)
                    Text(model.provider.baseURL).font(.footnote).foregroundStyle(.secondary)
                    SecureField("自己的 API Key", text: $model.apiKey)
                    Button("保存 Key") {
                        if !model.saveKey() {
                            providerError = model.errorMessage
                            model.errorMessage = nil
                        }
                    }
                }
                Section("添加其他 OpenAI 兼容中转") {
                    TextField("名称（可选）", text: $name)
                    TextField("Base URL，例如 https://example.com/v1", text: $baseURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    Button("保存并切换") {
                        if model.addProvider(name: name, baseURL: baseURL) { dismiss() }
                        else {
                            providerError = model.errorMessage
                            model.errorMessage = nil
                        }
                    }
                }
            }
            .navigationTitle("接入设置")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }
            .alert("需要处理", isPresented: Binding(get: { providerError != nil }, set: { if !$0 { providerError = nil } })) {
                Button("知道了") { providerError = nil }
            } message: {
                Text(providerError ?? "")
            }
        }
    }
}

private struct Header: View {
    let title: String
    let subtitle: String
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.title2.bold())
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            Image("BrandPortrait")
                .resizable()
                .scaledToFill()
                .frame(width: 48, height: 48)
                .clipShape(Circle())
                .accessibilityHidden(true)
        }
    }
}

private struct ProviderCard: View {
    let provider: Provider
    let connected: Bool
    let action: () -> Void
    var body: some View {
        Card {
            HStack(alignment: .top) {
                Text("冷")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(ColdCoffeePalette.ink)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 4) {
                    Text(provider.name).font(.headline)
                    Text(provider.baseURL).font(.footnote).foregroundStyle(ColdCoffeePalette.crimson)
                    Text("自己的 Key 只保存在本机 Keychain。").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(connected ? "已配置" : "待配置")
                    .font(.caption.bold())
                    .foregroundStyle(ColdCoffeePalette.crimson)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(ColdCoffeePalette.blush)
                    .clipShape(Capsule())
            }
            Button("管理中转") { action() }
                .buttonStyle(.borderless)
                .foregroundStyle(ColdCoffeePalette.crimson)
        }
    }
}

private struct StatusCard: View {
    let text: String
    var body: some View {
        Card(background: ColdCoffeePalette.ink) {
            Text("今日状态").font(.subheadline.weight(.semibold)).foregroundStyle(.white.opacity(0.8))
            Text(text).font(.headline).foregroundStyle(.white)
            Text("Key 只用于你配置的服务商请求，不写入公开仓库。")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.65))
        }
    }
}

private struct EmptyChat: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("开始一段冷咖啡对话").font(.title3.bold())
            Text("先在首页接入中转、读取模型，再回来发送消息。")
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 44)
    }
}

private struct MessageBubble: View {
    let message: ChatMessage
    var body: some View {
        HStack {
            if message.role == "assistant" { Spacer(minLength: 45) }
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 6) {
                    if message.role == "assistant" {
                        Image("BrandPortrait")
                            .resizable()
                            .scaledToFill()
                            .frame(width: 20, height: 20)
                            .clipShape(RoundedRectangle(cornerRadius: 5))
                            .accessibilityHidden(true)
                    }
                    Text(message.role == "assistant" ? "冷咖啡 · 助手" : "你")
                        .font(.caption.bold())
                        .foregroundStyle(message.role == "assistant" ? .white.opacity(0.75) : ColdCoffeePalette.crimson)
                }
                Text(message.content.isEmpty ? "…" : message.content)
                    .font(.body)
                    .foregroundStyle(message.role == "assistant" ? .white : ColdCoffeePalette.ink)
                if message.imageDataBase64 != nil {
                    Label("已附加图片", systemImage: "photo")
                        .font(.caption)
                        .foregroundStyle(message.role == "assistant" ? .white.opacity(0.7) : .secondary)
                }
            }
            .padding(14)
            .background(message.role == "assistant" ? ColdCoffeePalette.ink : Color.white.opacity(0.8))
            .clipShape(RoundedRectangle(cornerRadius: 18))
            if message.role != "assistant" { Spacer(minLength: 45) }
        }
    }
}

private struct Card<Content: View>: View {
    let background: Color
    let content: Content
    init(background: Color = Color.white.opacity(0.72), @ViewBuilder content: @escaping () -> Content) {
        self.background = background
        self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            content
        }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background)
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(ColdCoffeePalette.line.opacity(0.8), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

private struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, 15)
            .background(ColdCoffeePalette.crimson.opacity(configuration.isPressed ? 0.75 : 1))
            .foregroundStyle(.white)
            .font(.headline)
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct PrimaryIconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.white)
            .background(ColdCoffeePalette.crimson.opacity(configuration.isPressed ? 0.75 : 1))
            .clipShape(Circle())
    }
}
