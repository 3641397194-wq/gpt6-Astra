// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import SwiftUI
import PhotosUI

@MainActor
final class AppModel: ObservableObject {
    enum Tab: Hashable {
        case home, chat, community
    }

    @Published var tab: Tab = .home
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
