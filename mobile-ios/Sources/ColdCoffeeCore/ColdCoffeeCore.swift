// SPDX-License-Identifier: GPL-3.0-only
// ColdCoffee iOS core: original integration with an OpenAI-compatible relay.
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(Security)
import Security
#endif

public enum APIProtocol: String, Codable, CaseIterable, Sendable {
    case chat = "chat"
    case responses = "responses"
}

public struct Provider: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var baseURL: String
    public var apiProtocol: APIProtocol
    public var hasKey: Bool

    public init(id: String = UUID().uuidString, name: String, baseURL: String, apiProtocol: APIProtocol = .chat, hasKey: Bool = false) {
        self.id = id
        self.name = name
        self.baseURL = baseURL
        self.apiProtocol = apiProtocol
        self.hasKey = hasKey
    }
}

public struct PublicServices: Sendable {
    public static let website = URL(string: "https://coldcoffeeai.com/")!
    public static let api = URL(string: "https://coldcoffeeai.com/v1")!
    public static let telegram = URL(string: "https://t.me/coolcoffeeai")!
    public static let channel = URL(string: "https://t.me/chachachalkf")!
    public static let groups: [(name: String, number: String, image: String)] = [
        ("QQ 一群", "1057540028", "qq-group-1"),
        ("QQ 二群", "1077074552", "qq-group-2"),
        ("QQ 三群", "618179023", "qq-group-3"),
        ("QQ 四群", "1131239659", "qq-group-4")
    ]
}

public enum ColdCoffeeError: LocalizedError, Equatable {
    case invalidEndpoint
    case insecureEndpoint
    case credentialsInURL
    case missingKey
    case invalidResponse
    case provider(String)

    public var errorDescription: String? {
        switch self {
        case .invalidEndpoint: return "API 地址格式不正确"
        case .insecureEndpoint: return "请使用 HTTPS 接口地址"
        case .credentialsInURL: return "地址中不能包含账号、Key、查询参数或片段"
        case .missingKey: return "请先填写自己的 API Key"
        case .invalidResponse: return "服务商返回了无法解析的结果"
        case .provider(let message): return message
        }
    }
}

public enum EndpointNormalizer {
    public static func normalize(_ raw: String) throws -> URL {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { throw ColdCoffeeError.invalidEndpoint }
        if !value.contains("://") { value = "https://" + value }
        guard var components = URLComponents(string: value), let scheme = components.scheme?.lowercased(), let host = components.host, !host.isEmpty else {
            throw ColdCoffeeError.invalidEndpoint
        }
        guard scheme == "https" else { throw ColdCoffeeError.insecureEndpoint }
        if components.user != nil || value.contains("@") || components.query != nil || components.fragment != nil {
            throw ColdCoffeeError.credentialsInURL
        }
        var path = components.path.replacingOccurrences(of: "/+\\z", with: "", options: .regularExpression)
        for suffix in ["/chat/completions", "/responses", "/models"] where path.hasSuffix(suffix) {
            path = String(path.dropLast(suffix.count))
        }
        if path.isEmpty { path = "/v1" }
        components.path = path
        components.query = nil
        components.fragment = nil
        guard let url = components.url else { throw ColdCoffeeError.invalidEndpoint }
        return url
    }

    public static func endpoint(for provider: Provider, path: String) throws -> URL {
        guard let base = URL(string: provider.baseURL) else { throw ColdCoffeeError.invalidEndpoint }
        let cleanPath = path.hasPrefix("/") ? path : "/" + path
        guard let url = URL(string: base.absoluteString.replacingOccurrences(of: "/+\\z", with: "", options: .regularExpression) + cleanPath) else {
            throw ColdCoffeeError.invalidEndpoint
        }
        guard url.scheme?.lowercased() == "https" else { throw ColdCoffeeError.insecureEndpoint }
        return url
    }
}

public enum ModelCatalog {
    public static let featured = ["GPT-6.2 Astra", "GPT-6.2 Sol"]

    public static func family(for id: String) -> String? {
        for (index, name) in ["astra", "sol"].enumerated() {
            let pattern = "^(?:[^/]+/)?gpt[-_ ]?6[.\\-_ ]?2[-_ ]+\(name)(?:$|[.\\-_ ])"
            if id.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil { return featured[index] }
        }
        return nil
    }

    public static func ids(from json: [String: Any]) -> [String] {
        let raw = (json["data"] as? [Any]) ?? (json["models"] as? [Any]) ?? []
        let ids = raw.compactMap { item -> String? in
            if let id = item as? String { return id }
            if let item = item as? [String: Any] { return (item["id"] as? String) ?? (item["name"] as? String) }
            return nil
        }.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return Array(Set(ids)).sorted { left, right in
            let leftRank = family(for: left).flatMap { featured.firstIndex(of: $0) } ?? featured.count
            let rightRank = family(for: right).flatMap { featured.firstIndex(of: $0) } ?? featured.count
            return leftRank == rightRank ? left < right : leftRank < rightRank
        }
    }
}

public final class KeychainStore: @unchecked Sendable {
    private let service: String
    #if !canImport(Security)
    private static var memory: [String: String] = [:]
    #endif

    public init(service: String = "com.coldcoffee.ios") { self.service = service }

    public func set(_ value: String, for key: String) throws {
        #if canImport(Security)
        let data = Data(value.utf8)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = data
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw ColdCoffeeError.provider("Keychain 保存失败：\(status)") }
        #else
        Self.memory["\(service):\(key)"] = value
        #endif
    }

    public func get(_ key: String) -> String? {
        #if canImport(Security)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
        #else
        return Self.memory["\(service):\(key)"]
        #endif
    }

    public func delete(_ key: String) {
        #if canImport(Security)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        SecItemDelete(query as CFDictionary)
        #else
        Self.memory.removeValue(forKey: "\(service):\(key)")
        #endif
    }
}

public struct ChatMessage: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let role: String
    public var content: String
    public var imageDataBase64: String?
    public var imageMimeType: String?
    public let createdAt: Date
    public init(id: UUID = UUID(), role: String, content: String, imageDataBase64: String? = nil, imageMimeType: String? = nil, createdAt: Date = Date()) {
        self.id = id
        self.role = role
        self.content = content
        self.imageDataBase64 = imageDataBase64
        self.imageMimeType = imageMimeType
        self.createdAt = createdAt
    }
}

public final class OpenAIClient: Sendable {
    private let session: URLSession
    public init(session: URLSession = .shared) { self.session = session }

    public func models(for provider: Provider, key: String) async throws -> [String] {
        guard !key.isEmpty else { throw ColdCoffeeError.missingKey }
        let request = try makeRequest(provider: provider, key: key, path: "/models", method: "GET", body: nil)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ColdCoffeeError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw ColdCoffeeError.provider("读取模型失败（\(http.statusCode)）") }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ColdCoffeeError.invalidResponse }
        return ModelCatalog.ids(from: json)
    }

    public func streamChat(provider: Provider, key: String, model: String, messages: [ChatMessage], system: String = "") -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let body = try Self.requestBody(protocol: provider.apiProtocol, model: model, messages: messages, system: system)
                    let request = try makeRequest(provider: provider, key: key, path: provider.apiProtocol == .chat ? "/chat/completions" : "/responses", method: "POST", body: body)
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else { throw ColdCoffeeError.invalidResponse }
                    guard (200..<300).contains(http.statusCode) else { throw ColdCoffeeError.provider("模型请求失败（\(http.statusCode)）") }
                    var buffer = ""
                    for try await line in bytes.lines {
                        if line.hasPrefix("data:") { buffer += String(line.dropFirst(5)).trimmingCharacters(in: .whitespacesAndNewlines) }
                        if line.isEmpty {
                            if buffer == "[DONE]" { break }
                            if !buffer.isEmpty {
                                if let text = Self.delta(from: buffer, protocol: provider.apiProtocol), !text.isEmpty { continuation.yield(text) }
                                buffer = ""
                            }
                        }
                    }
                    continuation.finish()
                } catch is CancellationError { continuation.finish() }
                catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public static func requestBody(protocol apiProtocol: APIProtocol, model: String, messages: [ChatMessage], system: String = "") throws -> Data {
        guard !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ColdCoffeeError.provider("请选择模型") }
        let clean: [[String: Any]] = messages.map { message in
            if let image = message.imageDataBase64, let mime = message.imageMimeType {
                return [
                    "role": message.role,
                    "content": [
                        ["type": "text", "text": message.content],
                        ["type": "image_url", "image_url": ["url": "data:\(mime);base64,\(image)"]]
                    ]
                ]
            }
            return ["role": message.role, "content": message.content]
        }
        var payload: [String: Any] = ["model": model, "stream": true]
        if apiProtocol == .chat {
            var messagePayload = clean
            if !system.isEmpty {
                messagePayload.insert(["role": "system", "content": system], at: 0)
            }
            payload["messages"] = messagePayload
        } else {
            payload["input"] = clean
            if !system.isEmpty { payload["instructions"] = system }
        }
        return try JSONSerialization.data(withJSONObject: payload)
    }

    private func makeRequest(provider: Provider, key: String, path: String, method: String, body: Data?) throws -> URLRequest {
        guard !key.isEmpty else { throw ColdCoffeeError.missingKey }
        var request = URLRequest(url: try EndpointNormalizer.endpoint(for: provider, path: path))
        request.httpMethod = method
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body { request.httpBody = body; request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type") }
        return request
    }

    private static func delta(from raw: String, protocol apiProtocol: APIProtocol) -> String? {
        guard let data = raw.data(using: .utf8), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if apiProtocol == .responses { return json["delta"] as? String }
        let choices = json["choices"] as? [[String: Any]]
        return (choices?.first?["delta"] as? [String: Any])?["content"] as? String
    }
}
