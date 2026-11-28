// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import SwiftUI
import PhotosUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(CryptoKit)
import CryptoKit
#endif

protocol ChatServing: Sendable {
    func models(for provider: Provider, key: String) async throws -> [String]
    func streamChat(provider: Provider, key: String, model: String, messages: [ChatMessage], system: String) -> AsyncThrowingStream<String, Error>
}

extension OpenAIClient: ChatServing {}

@MainActor
final class AppModel: ObservableObject {
    enum Tab: Hashable {
        case home, chat, work, community
    }

    enum WorkMode: String, CaseIterable, Identifiable {
        case reverse
        case redTeam
        case api
        case game
        case sample
        case report

        var id: String { rawValue }
        var title: String {
            switch self {
            case .reverse: return "REA 逆向与软件分析"
            case .redTeam: return "红队渗透"
            case .api: return "API 审计"
            case .game: return "游戏客户端 / 外挂研究"
            case .sample: return "样本与取证"
            case .report: return "证据报告"
            }
        }
        var icon: String {
            switch self {
            case .reverse: return "magnifyingglass"
            case .redTeam: return "shield.lefthalf.filled"
            case .api: return "point.3.connected.trianglepath.dotted"
            case .game: return "gamecontroller"
            case .sample: return "waveform.path.ecg"
            case .report: return "doc.text.magnifyingglass"
            }
        }
        var summary: String {
            switch self {
            case .reverse: return "拆解程序结构、入口、格式与运行证据"
            case .redTeam: return "梳理资产、身份、请求、状态与复现记录"
            case .api: return "分析接口面、认证、授权和业务状态"
            case .game: return "记录模块、协议、渲染、内存与反作弊观测"
            case .sample: return "整理样本、IOC、时间线与证据链"
            case .report: return "把过程整理成可复制、可审阅的报告"
            }
        }
        var starter: String {
            switch self {
            case .reverse:
                return "目标：TARGET\n类型：PE / ELF / APK / Electron / 脚本\n希望得到：模块清单、入口、关键函数、验证步骤\n现有证据："
            case .redTeam:
                return "范围：TARGET\n资产或入口：HOST\n身份与状态：ROLE_A / ROLE_B\n希望验证：授权、输入、业务流程或复现路径\n现有证据："
            case .api:
                return "接口：HOST\n请求方法与路径：\n认证方式：TOKEN / Cookie / OAuth\n希望检查：认证、授权、输入、状态、日志\n现有请求或响应："
            case .game:
                return "目标：TARGET\n平台与版本：\n模块 / 进程 / 协议：\n研究方向：渲染、内存、偏移、网络或反作弊观测\n现有日志："
            case .sample:
                return "样本：TARGET\n来源与哈希：\n观察时间线：\n希望提取：行为、IOC、YARA 线索、关联证据\n现有日志："
            case .report:
                return "项目：TARGET\n范围：\n方法与证据：\n发现：\n报告读者与格式：Markdown / PDF / 工单\n需要保留的不确定项："
            }
        }
        var systemPrompt: String {
            switch self {
            case .reverse:
                return "你是冷咖啡 REA 逆向分析工作流。把目标、格式、入口、证据、下一步写清楚；需要样本时先列出应提供的文件与哈希。"
            case .redTeam:
                return "你是冷咖啡网络安全红队工作流。按资产、身份、请求、状态、验证点和复现记录组织结果，输出可执行的检查与报告步骤。"
            case .api:
                return "你是冷咖啡 API 安全审计工作流。围绕接口面、认证、授权、输入、业务状态、日志和证据给出结构化分析。"
            case .game:
                return "你是冷咖啡游戏客户端与外挂研究工作流。围绕进程、模块、协议、渲染、内存、偏移、自动化和反作弊观测组织实验记录与代码接口；区分观察事实、推断和待验证项。"
            case .sample:
                return "你是冷咖啡样本分析与数字取证工作流。区分观察事实、推断、IOC、时间线和复核动作，优先保护证据完整性。"
            case .report:
                return "你是冷咖啡证据报告工作流。把输入整理成摘要、范围、方法、发现、复现、影响、修复和附录，保留不确定项。"
            }
        }
    }

    @Published var tab: Tab = .home
    @Published var workMode: WorkMode = .reverse
    @Published var workInput = ""
    @Published var workTarget = ""
    @Published var workHost = ""
    @Published var workObjective = ""
    @Published var workFileName = ""
    @Published var workFileNote = ""
    @Published var workOutput = ""
    @Published var workBusy = false
    @Published var provider: Provider
    @Published var apiKey = ""
    @Published var models: [String] = []
    @Published var selectedModel = ""
    @Published var chatDraft = ""
    @Published var messages: [ChatMessage] = []
    @Published var isBusy = false
    @Published var status = "等待接入"
    @Published var errorMessage: String?
    @Published var colorScheme: ColorScheme?
    @Published var fontScale: CGFloat = 1.0
    @Published var pickedImage: (data: Data, name: String, mime: String)?

    private let keychain: KeychainStore
    private let client: any ChatServing
    private let defaults: UserDefaults
    private let historyKey = "coldcoffee.ios.history.v1"
    private let settingsKey = "coldcoffee.ios.settings.v1"
    private let savedWorkKey = "coldcoffee.ios.work-result.v1"
    private var streamTask: Task<Void, Never>?
    private var activeReplyID: UUID?
    private var modelLoadTask: Task<Void, Never>?
    private var modelLoadID: UUID?
    private var workTask: Task<Void, Never>?

    init(client: any ChatServing = OpenAIClient(), defaults: UserDefaults = .standard, keychain: KeychainStore = KeychainStore()) {
        self.client = client
        self.defaults = defaults
        self.keychain = keychain
        provider = Provider(name: "冷咖啡付费中转", baseURL: PublicServices.api.absoluteString)
        loadSettings()
        do {
            provider.baseURL = try Self.canonicalEndpoint(provider.baseURL)
            apiKey = keychain.get(try Self.credentialAccount(for: provider.baseURL)) ?? ""
        } catch {
            provider = Provider(name: "冷咖啡付费中转", baseURL: PublicServices.api.absoluteString)
            selectedModel = ""
            status = "旧版中转地址需要重新填写"
        }
        provider.hasKey = !apiKey.isEmpty
        if apiKey.isEmpty, let legacy = keychain.get("primary"), !legacy.isEmpty {
            // The old global entry has no trustworthy endpoint binding. Keep it
            // intact, but never send it to whichever provider happens to be selected.
            status = "旧版 Key 已保留在本机，请重新填写并保存以绑定当前中转"
        }
        loadHistory()
        loadSavedWork()
    }

    @discardableResult
    func saveKey() -> Bool {
        do {
            let clean = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
            let account = try Self.credentialAccount(for: provider.baseURL)
            if clean.isEmpty { keychain.delete(account) }
            else { try keychain.set(clean, for: account) }
            apiKey = clean
            provider.hasKey = !clean.isEmpty
            errorMessage = nil
            status = clean.isEmpty ? "等待填写 Key" : "Key 只保存在本机 Keychain"
            saveSettings()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private static func canonicalEndpoint(_ raw: String) throws -> String {
        let normalized = try EndpointNormalizer.normalize(raw)
        guard var components = URLComponents(url: normalized, resolvingAgainstBaseURL: false) else {
            throw ColdCoffeeError.invalidEndpoint
        }
        components.scheme = components.scheme?.lowercased()
        components.host = components.host?.lowercased()
        if components.port == 443 { components.port = nil }
        guard let endpoint = components.url?.absoluteString else { throw ColdCoffeeError.invalidEndpoint }
        return endpoint
    }

    private static func credentialAccount(for raw: String) throws -> String {
        "provider:" + (try canonicalEndpoint(raw))
    }

    @discardableResult
    func addProvider(name: String, baseURL: String) -> Bool {
        do {
            let endpoint = try Self.canonicalEndpoint(baseURL)
            let changedEndpoint = endpoint != (try? Self.canonicalEndpoint(provider.baseURL))
            modelLoadTask?.cancel()
            modelLoadTask = nil
            modelLoadID = nil
            if changedEndpoint {
                if isBusy { stop() }
                apiKey = keychain.get(try Self.credentialAccount(for: endpoint)) ?? ""
            }
            provider = Provider(name: name.isEmpty ? "我的兼容中转" : name, baseURL: endpoint, hasKey: !apiKey.isEmpty)
            models = []
            selectedModel = ""
            errorMessage = nil
            status = "已切换到 \(provider.name)"
            saveSettings()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func loadModels() -> Task<Void, Never>? {
        modelLoadTask?.cancel()
        modelLoadTask = nil
        modelLoadID = nil
        let requestedKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !requestedKey.isEmpty else {
            status = "等待填写 Key"
            errorMessage = ColdCoffeeError.missingKey.localizedDescription
            return nil
        }
        status = "正在读取模型"
        errorMessage = nil
        let requestedProvider = provider
        let requestID = UUID()
        modelLoadID = requestID
        let task = Task {
            defer {
                if modelLoadID == requestID {
                    modelLoadTask = nil
                    modelLoadID = nil
                    if status == "正在读取模型" { status = "等待接入" }
                }
            }
            do {
                let result = try await client.models(for: requestedProvider, key: requestedKey)
                guard isCurrentModelLoad(requestID, providerID: requestedProvider.id, key: requestedKey) else { return }
                models = result
                if selectedModel.isEmpty, let first = result.first {
                    selectedModel = first
                    saveSettings()
                }
                status = result.isEmpty ? "接口已连接，服务商未返回模型列表" : "已读取 \(result.count) 个模型"
            } catch {
                guard isCurrentModelLoad(requestID, providerID: requestedProvider.id, key: requestedKey) else { return }
                status = "读取模型失败"
                errorMessage = error.localizedDescription
            }
        }
        modelLoadTask = task
        return task
    }

    private func isCurrentModelLoad(_ requestID: UUID, providerID: String, key: String) -> Bool {
        !Task.isCancelled && modelLoadID == requestID && provider.id == providerID
            && apiKey.trimmingCharacters(in: .whitespacesAndNewlines) == key
    }

    func selectModel(_ id: String, manuallyEntered: Bool = false) {
        let clean = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, manuallyEntered || models.contains(clean) else {
            errorMessage = "请从服务商目录选择模型，或手动填写实际模型 ID"
            return
        }
        selectedModel = clean
        saveSettings()
    }

    @discardableResult
    func sendDraft() -> Bool {
        let trimmed = chatDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !isBusy, !trimmed.isEmpty || pickedImage != nil else { return false }
        let requestKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !requestKey.isEmpty else {
            errorMessage = ColdCoffeeError.missingKey.localizedDescription
            tab = .home
            return false
        }
        let requestModel = selectedModel
        guard !requestModel.isEmpty else {
            errorMessage = "请先读取模型目录或手动填写模型 ID"
            return false
        }
        let requestProvider = provider
        let attachment = pickedImage
        var message = ChatMessage(role: "user", content: trimmed)
        if let attachment {
            message.imageDataBase64 = attachment.data.base64EncodedString()
            message.imageMimeType = attachment.mime
        }
        messages.append(message)
        chatDraft = ""
        saveHistory()
        let requestMessages = messages
        pickedImage = nil
        isBusy = true
        status = "流式输出中"
        errorMessage = nil
        var assistant = ChatMessage(role: "assistant", content: "")
        messages.append(assistant)
        let replyID = assistant.id
        activeReplyID = replyID
        streamTask = Task {
            do {
                for try await token in client.streamChat(provider: requestProvider, key: requestKey, model: requestModel, messages: requestMessages, system: "你是冷咖啡 iOS 助手，回答清晰、简洁、尊重用户选择。") {
                    guard !Task.isCancelled, activeReplyID == replyID,
                          let index = messages.firstIndex(where: { $0.id == replyID }) else { return }
                    assistant.content += token
                    messages[index] = assistant
                }
                guard !Task.isCancelled, activeReplyID == replyID else { return }
                if assistant.content.isEmpty { throw ColdCoffeeError.provider("服务商已结束连接，没有返回文字；请检查模型和协议") }
                activeReplyID = nil
                streamTask = nil
                isBusy = false
                status = "已完成"
                saveHistory()
            } catch {
                guard !Task.isCancelled, activeReplyID == replyID else { return }
                activeReplyID = nil
                streamTask = nil
                isBusy = false
                status = "请求失败"
                errorMessage = error.localizedDescription
                discardEmptyReply(replyID)
                saveHistory()
            }
        }
        return true
    }

    func stop() {
        let replyID = activeReplyID
        activeReplyID = nil
        streamTask?.cancel()
        streamTask = nil
        if let replyID { discardEmptyReply(replyID) }
        isBusy = false
        status = "已停止"
        saveHistory()
    }

    private func discardEmptyReply(_ replyID: UUID) {
        messages.removeAll { $0.id == replyID && $0.content.isEmpty }
    }

    func runWork() {
        let input = workInput.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasStructuredInput = [workTarget, workHost, workObjective, workFileNote]
            .contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !input.isEmpty || hasStructuredInput else {
            errorMessage = "先写入目标、接口、样本、日志或任务要求"
            return
        }
        guard !apiKey.isEmpty else {
            errorMessage = ColdCoffeeError.missingKey.localizedDescription
            tab = .home
            return
        }
        guard !selectedModel.isEmpty else {
            errorMessage = "请先读取模型目录或手动填写模型 ID"
            return
        }
        workTask?.cancel()
        workOutput = ""
        workBusy = true
        status = "\(workMode.title)执行中"
        let prompt = """
        冷咖啡工作流：\(workMode.title)
        目标：
        \(workTarget.isEmpty ? "TARGET" : workTarget)

        主机或接口：
        \(workHost.isEmpty ? "HOST（如不适用请忽略）" : workHost)

        期望产出：
        \(workObjective.isEmpty ? "按工作流给出结构化结果" : workObjective)

        详细输入：
        \(input)

        附件证据：
        \(workFileNote.isEmpty ? "未附加文件" : workFileNote)

        请先给出范围和前置输入，再按“步骤 → 证据 → 结果 → 下一步”输出。缺少具体值时使用 TARGET、HOST、TOKEN、OFFSET、PAYLOAD、SERIAL 等占位符；不要编造工具输出。
        """
        workTask = Task {
            do {
                let request = ChatMessage(role: "user", content: prompt)
                for try await token in client.streamChat(provider: provider, key: apiKey, model: selectedModel, messages: [request], system: workMode.systemPrompt) {
                    guard !Task.isCancelled else { break }
                    workOutput += token
                }
                guard !Task.isCancelled else { return }
                if workOutput.isEmpty { throw ColdCoffeeError.provider("服务商已结束连接，没有返回文字；请检查模型和协议") }
                workBusy = false
                status = "\(workMode.title)已完成"
                saveWorkOutput()
            } catch {
                workBusy = false
                status = "\(workMode.title)失败"
                errorMessage = error.localizedDescription
            }
        }
    }

    func stopWork() {
        workTask?.cancel()
        workTask = nil
        workBusy = false
        status = "工作流已停止"
    }

    func applyWorkStarter() {
        if workInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            workInput = workMode.starter
        } else {
            workInput += "\n\n" + workMode.starter
        }
    }

    func clearWork() {
        stopWork()
        workInput = ""
        workTarget = ""
        workHost = ""
        workObjective = ""
        workFileName = ""
        workFileNote = ""
        workOutput = ""
        status = "工作台已清空"
    }

    func importWorkFile(url: URL) {
        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing { url.stopAccessingSecurityScopedResource() }
        }
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            let byteCount = (attributes[.size] as? NSNumber)?.int64Value ?? 0
            guard byteCount <= 64 * 1024 * 1024 else {
                throw ColdCoffeeError.provider("文件超过 64 MB，请在桌面端继续处理")
            }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            let size = ByteCountFormatter.string(fromByteCount: Int64(data.count), countStyle: .file)
            let hash: String
            #if canImport(CryptoKit)
            hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            #else
            hash = "HASH_UNAVAILABLE"
            #endif

            let ext = url.pathExtension.lowercased()
            var preview = ""
            let textExtensions = ["txt", "md", "json", "yaml", "yml", "log", "csv", "xml", "swift", "py", "js", "ts", "c", "cpp", "h", "java", "rs", "go"]
            if textExtensions.contains(ext), data.count <= 1_000_000, let text = String(data: data, encoding: .utf8) {
                preview = String(text.prefix(20_000))
            }
            workFileName = url.lastPathComponent
            workFileNote = """
            文件名：\(url.lastPathComponent)
            大小：\(size)
            SHA-256：\(hash)
            \(preview.isEmpty ? "已读取文件元数据；二进制内容由桌面端继续分析。" : "文本预览（前 20,000 字符）：\n\(preview)")
            """
            status = "已加入证据：\(url.lastPathComponent)"
        } catch {
            errorMessage = "读取文件失败：\(error.localizedDescription)"
        }
    }

    func removeWorkFile() {
        workFileName = ""
        workFileNote = ""
    }

    func saveWorkOutput() {
        guard !workOutput.isEmpty else { return }
        let record = SavedWork(mode: workMode.title, target: workTarget, output: workOutput, savedAt: Date())
        if let data = try? JSONEncoder().encode(record) {
            UserDefaults.standard.set(data, forKey: savedWorkKey)
        }
    }

    func restoreSavedWork() {
        guard let data = UserDefaults.standard.data(forKey: savedWorkKey),
              let record = try? JSONDecoder().decode(SavedWork.self, from: data) else { return }
        workOutput = record.output
        workTarget = record.target
        status = "已载入 \(record.mode) 的上次结果"
    }

    func copyWorkOutput() {
        guard !workOutput.isEmpty else { return }
        #if canImport(UIKit)
        UIPasteboard.general.string = workOutput
        status = "结果已复制"
        #endif
    }

    func clearHistory() {
        stop()
        messages.removeAll()
        saveHistory()
    }

    func setImage(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }
            pickedImage = (data: data, name: "图片", mime: item.supportedContentTypes.first?.preferredMIMEType ?? "image/jpeg")
        } catch {
            errorMessage = "读取图片失败：\(error.localizedDescription)"
        }
    }

    private func saveSettings() {
        let record = SettingsRecord(provider: provider, selectedModel: selectedModel, fontScale: fontScale, dark: colorScheme == .dark)
        if let data = try? JSONEncoder().encode(record) {
            defaults.set(data, forKey: settingsKey)
        }
    }

    private func loadSettings() {
        guard let data = defaults.data(forKey: settingsKey),
              let record = try? JSONDecoder().decode(SettingsRecord.self, from: data) else { return }
        provider = record.provider
        selectedModel = record.selectedModel
        fontScale = record.fontScale
        colorScheme = record.dark ? .dark : nil
        provider.hasKey = !apiKey.isEmpty
    }

    private func saveHistory() {
        guard let data = try? JSONEncoder().encode(messages) else { return }
        defaults.set(data, forKey: historyKey)
    }

    private func loadHistory() {
        guard let data = defaults.data(forKey: historyKey),
              let saved = try? JSONDecoder().decode([ChatMessage].self, from: data) else { return }
        messages = saved.filter { $0.role != "assistant" || !$0.content.isEmpty }
    }

    private func loadSavedWork() {
        guard let data = UserDefaults.standard.data(forKey: savedWorkKey),
              let record = try? JSONDecoder().decode(SavedWork.self, from: data) else { return }
        workOutput = record.output
    }
}

private struct SettingsRecord: Codable {
    var provider: Provider
    var selectedModel: String
    var fontScale: CGFloat
    var dark: Bool
}

private struct SavedWork: Codable {
    var mode: String
    var target: String
    var output: String
    var savedAt: Date
}
