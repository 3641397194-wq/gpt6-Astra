// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI
import PhotosUI

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
                        model.loadModels()
                        model.tab = .chat
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
    @State private var draft = ""
    @State private var photosItem: PhotosPickerItem?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Text("冷咖啡 · 对话")
                        .font(.title2.bold())
                    Spacer()
                    Menu {
                        Picker("模型", selection: $model.selectedModel) {
                            ForEach(model.models.isEmpty ? [model.selectedModel] : model.models, id: \.self) { Text($0).tag($0) }
                        }
                        Button("重新读取模型") { model.loadModels() }
                        Button("清空会话", role: .destructive) { model.clearHistory() }
                    } label: {
                        Label(model.selectedModel, systemImage: "slider.horizontal.3")
                            .lineLimit(1)
                    }
                    .font(.subheadline.weight(.semibold))
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
                    TextField("输入消息…", text: $draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...5)
                    Button {
                        if model.isBusy { model.stop() } else {
                            let text = draft
                            draft = ""
                            model.send(text)
                        }
                    } label: {
                        Image(systemName: model.isBusy ? "stop.fill" : "arrow.up")
                            .frame(width: 38, height: 38)
                    }
                    .buttonStyle(PrimaryIconButtonStyle())
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
                            ForEach(PublicServices.groups, id: \.number) { group in
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

struct ProviderSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var baseURL = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("当前服务") {
                    Text(model.provider.name)
                    Text(model.provider.baseURL).font(.footnote).foregroundStyle(.secondary)
                    SecureField("自己的 API Key", text: $model.apiKey)
                    Button("保存 Key") { model.saveKey() }
                }
                Section("添加其他 OpenAI 兼容中转") {
                    TextField("名称（可选）", text: $name)
                    TextField("Base URL，例如 https://example.com/v1", text: $baseURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    Button("保存并切换") {
                        model.addProvider(name: name, baseURL: baseURL)
                        dismiss()
                    }
                }
            }
            .navigationTitle("接入设置")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }
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
            Text("冷")
                .font(.title2.bold())
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(ColdCoffeePalette.crimson)
                .clipShape(Circle())
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
                Text(message.role == "assistant" ? "冷咖啡 · 助手" : "你")
                    .font(.caption.bold())
                    .foregroundStyle(message.role == "assistant" ? .white.opacity(0.75) : ColdCoffeePalette.crimson)
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
    @ViewBuilder let content: () -> Content
    init(background: Color = Color.white.opacity(0.72), @ViewBuilder content: @escaping () -> Content) {
        self.background = background
        self.content = content
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12, content: content)
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
