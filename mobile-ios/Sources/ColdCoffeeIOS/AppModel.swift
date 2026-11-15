// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import SwiftUI
import PhotosUI

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
            case .reverse: return "REA 逆向分析"
            case .redTeam: return "红队渗透"
            case .api: return "API 审计"
            case .game: return "游戏客户端研究"
            case .sample: return "样本与取证"
            case .report: return "证据报告"
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
                return "你是冷咖啡游戏客户端研究工作流。围绕进程、模块、协议、渲染、内存、偏移和反作弊观测组织实验记录与代码接口。"
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
    @Published var workOutput = ""
    @Published var workBusy = false
    @Published var provider: Provider
    @Published var apiKey = ""
    @Published var models: [String] = []
    @Published var selectedModel = "gpt-6-Astra"
    @Published var messages: [ChatMessage] = []
    @Published var isBusy = false
    @Published var status = "等待接入"
    @Published var errorMessage: String?
    @Published var colorScheme: ColorScheme?
    @Published var fontScale: CGFloat = 1.0
    @Published var pickedImage: (data: Data, name: String, mime: String)?

    private let keychain = KeychainStore()
    private let client = OpenAIClient()
    private let historyKey = "coldcoffee.ios.history.v1"
    private let settingsKey = "coldcoffee.ios.settings.v1"
    private var streamTask: Task<Void, Never>?
    private var workTask: Task<Void, Never>?

    init() {
        provider = Provider(name: "冷咖啡付费中转", baseURL: PublicServices.api.absoluteString)
        apiKey = keychain.get("primary") ?? ""
        loadSettings()
        loadHistory()
    }

    func saveKey() {
        do {
            try keychain.set(apiKey.trimmingCharacters(in: .whitespacesAndNewlines), for: "primary")
            provider.hasKey = !apiKey.isEmpty
            status = apiKey.isEmpty ? "等待填写 Key" : "Key 只保存在本机 Keychain"
            saveSettings()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addProvider(name: String, baseURL: String) {
        do {
            let url = try EndpointNormalizer.normalize(baseURL)
            provider = Provider(name: name.isEmpty ? "我的兼容中转" : name, baseURL: url.absoluteString, hasKey: !apiKey.isEmpty)
            status = "已切换到 \(provider.name)"
            saveSettings()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadModels() {
        guard !apiKey.isEmpty else {
            errorMessage = ColdCoffeeError.missingKey.localizedDescription
            return
        }
        status = "正在读取模型"
        errorMessage = nil
        Task {
            do {
                let result = try await client.models(for: provider, key: apiKey)
                models = result
                if let first = result.first, !result.contains(selectedModel) { selectedModel = first }
                status = result.isEmpty ? "接口已连接，服务商未返回模型列表" : "已读取 \(result.count) 个模型"
            } catch {
                status = "读取模型失败"
                errorMessage = error.localizedDescription
            }
        }
    }

    func send(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || pickedImage != nil else { return }
        guard !apiKey.isEmpty else {
            errorMessage = ColdCoffeeError.missingKey.localizedDescription
            tab = .home
            return
        }
        let attachment = pickedImage
        var message = ChatMessage(role: "user", content: trimmed)
        if let attachment {
            message.imageDataBase64 = attachment.data.base64EncodedString()
            message.imageMimeType = attachment.mime
        }
        messages.append(message)
        saveHistory()
        pickedImage = nil
        isBusy = true
        status = "流式输出中"
        errorMessage = nil
        var assistant = ChatMessage(role: "assistant", content: "")
        messages.append(assistant)
        let assistantIndex = messages.count - 1
        streamTask?.cancel()
        streamTask = Task {
            do {
                for try await token in client.streamChat(provider: provider, key: apiKey, model: selectedModel, messages: Array(messages.dropLast()), system: "你是冷咖啡 iOS 助手，回答清晰、简洁、尊重用户选择。") {
                    guard !Task.isCancelled else { break }
                    assistant.content += token
                    messages[assistantIndex] = assistant
                }
                if assistant.content.isEmpty { assistant.content = "服务商已结束连接，没有返回文字。" }
                messages[assistantIndex] = assistant
                isBusy = false
                status = "已完成"
                saveHistory()
            } catch {
                isBusy = false
                status = "请求失败"
                errorMessage = error.localizedDescription
                if messages.indices.contains(assistantIndex), messages[assistantIndex].content.isEmpty {
                    messages.remove(at: assistantIndex)
                }
            }
        }
    }

    func stop() {
        streamTask?.cancel()
        streamTask = nil
        isBusy = false
        status = "已停止"
        saveHistory()
    }

    func runWork() {
        let input = workInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else {
            errorMessage = "先写入目标、文件、日志或任务要求"
            return
        }
        guard !apiKey.isEmpty else {
            errorMessage = ColdCoffeeError.missingKey.localizedDescription
            tab = .home
            return
        }
        workTask?.cancel()
        workOutput = ""
        workBusy = true
        status = "\(workMode.title)执行中"
        let prompt = """
        冷咖啡工作流：\(workMode.title)
        目标与输入：
        \(input)

        请先给出范围和前置输入，再按“步骤 → 证据 → 结果 → 下一步”输出。缺少具体值时使用 TARGET、HOST、TOKEN、OFFSET、PAYLOAD、SERIAL 等占位符；不要编造工具输出。
        """
        workTask = Task {
            do {
                let request = ChatMessage(role: "user", content: prompt)
                for try await token in client.streamChat(provider: provider, key: apiKey, model: selectedModel, messages: [request], system: workMode.systemPrompt) {
                    guard !Task.isCancelled else { break }
                    workOutput += token
                }
                if workOutput.isEmpty { workOutput = "服务商已结束连接，没有返回文字。" }
                workBusy = false
                status = "\(workMode.title)已完成"
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
            UserDefaults.standard.set(data, forKey: settingsKey)
        }
    }

    private func loadSettings() {
        guard let data = UserDefaults.standard.data(forKey: settingsKey),
              let record = try? JSONDecoder().decode(SettingsRecord.self, from: data) else { return }
        provider = record.provider
        selectedModel = record.selectedModel
        fontScale = record.fontScale
        colorScheme = record.dark ? .dark : nil
        provider.hasKey = !apiKey.isEmpty
    }

    private func saveHistory() {
        guard let data = try? JSONEncoder().encode(messages) else { return }
        UserDefaults.standard.set(data, forKey: historyKey)
    }

    private func loadHistory() {
        guard let data = UserDefaults.standard.data(forKey: historyKey),
              let saved = try? JSONDecoder().decode([ChatMessage].self, from: data) else { return }
        messages = saved
    }
}

private struct SettingsRecord: Codable {
    var provider: Provider
    var selectedModel: String
    var fontScale: CGFloat
    var dark: Bool
}
