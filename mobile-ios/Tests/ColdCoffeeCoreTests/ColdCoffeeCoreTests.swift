// SPDX-License-Identifier: GPL-3.0-only
import XCTest
@testable import ColdCoffeeIOS

final class ColdCoffeeCoreTests: XCTestCase {
    func testNormalizesCompatibleEndpoint() throws {
        let url = try EndpointNormalizer.normalize("coldcoffeeai.com/v1/chat/completions")
        XCTAssertEqual(url.absoluteString, "https://coldcoffeeai.com/v1")
    }

    func testRejectsCredentialsAndInsecureURLs() {
        XCTAssertThrowsError(try EndpointNormalizer.normalize("http://example.com/v1"))
        XCTAssertThrowsError(try EndpointNormalizer.normalize("https://user:" + "fixture@example.com/v1"))
        XCTAssertThrowsError(try EndpointNormalizer.normalize("https://example.com/v1?token=fixture"))
    }

    func testCatalogRanksOnlyReturnedModelIDs() {
        let ids = ModelCatalog.ids(from: ["data": [
            ["id": "legacy-chat"], ["id": "auto/gpt-6.2-sol"],
            ["id": "relay/gpt-6.2-astra"], ["id": "relay/gpt-6.2-astra"]
        ]])
        XCTAssertEqual(ids, ["relay/gpt-6.2-astra", "auto/gpt-6.2-sol", "legacy-chat"])
        XCTAssertEqual(ModelCatalog.family(for: ids[0]), "GPT-6.2 Astra")
        XCTAssertEqual(ModelCatalog.family(for: ids[1]), "GPT-6.2 Sol")
        XCTAssertNil(ModelCatalog.family(for: "gpt-6-Astra"))
        XCTAssertEqual(ModelCatalog.ids(from: ["data": []]), [])
    }

    func testCatalogAndChatEndpointsKeepBasePath() throws {
        let provider = Provider(name: "Fixture", baseURL: "https://relay.example/v1")
        XCTAssertEqual(try EndpointNormalizer.endpoint(for: provider, path: "/models").absoluteString, "https://relay.example/v1/models")
        XCTAssertEqual(try EndpointNormalizer.endpoint(for: provider, path: "/chat/completions").absoluteString, "https://relay.example/v1/chat/completions")
        let id = "relay/gpt-6.2-astra"
        let data = try OpenAIClient.requestBody(protocol: .chat, model: id, messages: [])
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(payload["model"] as? String, id)
    }

    func testChatBodyIncludesStreamingAndImageData() throws {
        let message = ChatMessage(role: "user", content: "看图", imageDataBase64: "AA==", imageMimeType: "image/png")
        let data = try OpenAIClient.requestBody(protocol: .chat, model: "gpt-6-Astra", messages: [message])
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["stream"] as? Bool, true)
        XCTAssertEqual(object["model"] as? String, "gpt-6-Astra")
        let messages = try XCTUnwrap(object["messages"] as? [[String: Any]])
        let content = try XCTUnwrap(messages.first?["content"] as? [[String: Any]])
        XCTAssertEqual(content.first?["type"] as? String, "text")
        XCTAssertEqual(content.last?["type"] as? String, "image_url")
    }

    @MainActor
    func testRejectedSendKeepsTheDraftForRetry() async throws {
        let name = "ColdCoffeeIOS.Test.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let model = AppModel(client: ChatTestClient(), defaults: defaults, keychain: KeychainStore(service: name))
        model.chatDraft = "Typed before setup"
        model.tab = .chat
        model.apiKey = "  "

        XCTAssertFalse(model.sendDraft())
        XCTAssertEqual(model.chatDraft, "Typed before setup")
        XCTAssertEqual(model.tab, .home)
        XCTAssertTrue(model.messages.isEmpty)
        XCTAssertNil(model.loadModels())
        XCTAssertNotNil(model.errorMessage)

        model.apiKey = "fixture"
        XCTAssertFalse(model.sendDraft())
        XCTAssertEqual(model.chatDraft, "Typed before setup")
        XCTAssertTrue(model.messages.isEmpty)
        XCTAssertNotNil(model.errorMessage)
    }

    @MainActor
    func testProviderKeysAreBoundToCanonicalEndpoints() async throws {
        let name = "ColdCoffeeIOS.Test.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let keychain = KeychainStore(service: name)
        let model = AppModel(client: ChatTestClient(), defaults: defaults, keychain: keychain)
        model.apiKey = " fixture-official "
        XCTAssertTrue(model.saveKey())
        XCTAssertEqual(model.apiKey, "fixture-official")

        XCTAssertTrue(model.addProvider(name: "Other", baseURL: "https://relay.example/v1"))
        XCTAssertTrue(model.apiKey.isEmpty)
        XCTAssertFalse(model.provider.hasKey)
        model.apiKey = "fixture-other"
        XCTAssertTrue(model.saveKey())

        XCTAssertTrue(model.addProvider(name: "Official", baseURL: "https://COLDCOFFEEAI.COM:443/v1/models/"))
        XCTAssertEqual(model.apiKey, "fixture-official")
        XCTAssertEqual(model.provider.baseURL, "https://coldcoffeeai.com/v1")
        XCTAssertTrue(model.addProvider(name: "Other path", baseURL: "https://relay.example/v2"))
        XCTAssertTrue(model.apiKey.isEmpty)
        XCTAssertTrue(model.addProvider(name: "Other", baseURL: "https://relay.example/v1/"))
        XCTAssertEqual(model.apiKey, "fixture-other")

        let restored = AppModel(client: ChatTestClient(), defaults: defaults, keychain: keychain)
        XCTAssertEqual(restored.apiKey, "fixture-other")
        XCTAssertEqual(restored.provider.baseURL, "https://relay.example/v1")
        let settings = try XCTUnwrap(defaults.data(forKey: "coldcoffee.ios.settings.v1"))
        XCTAssertFalse(String(decoding: settings, as: UTF8.self).contains("fixture-other"))
        XCTAssertFalse(String(decoding: settings, as: UTF8.self).contains("fixture-official"))
    }

    @MainActor
    func testUnboundLegacyKeyIsRetainedButNotUsedForRequests() async throws {
        let name = "ColdCoffeeIOS.Test.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let keychain = KeychainStore(service: name)
        try keychain.set("fixture-legacy", for: "primary")
        let model = AppModel(client: ChatTestClient(), defaults: defaults, keychain: keychain)
        XCTAssertTrue(model.apiKey.isEmpty)
        XCTAssertFalse(model.provider.hasKey)
        XCTAssertTrue(model.status.contains("重新填写"))
        XCTAssertEqual(keychain.get("primary"), "fixture-legacy")
        XCTAssertNil(model.loadModels())

        model.apiKey = "fixture-scoped"
        XCTAssertTrue(model.saveKey())
        let restored = AppModel(client: ChatTestClient(), defaults: defaults, keychain: keychain)
        XCTAssertEqual(restored.apiKey, "fixture-scoped")
        XCTAssertEqual(keychain.get("primary"), "fixture-legacy")
        XCTAssertTrue(restored.addProvider(name: "Different", baseURL: "https://another.example/v1"))
        XCTAssertTrue(restored.apiKey.isEmpty)
        let switched = AppModel(client: ChatTestClient(), defaults: defaults, keychain: keychain)
        XCTAssertTrue(switched.apiKey.isEmpty)
        XCTAssertEqual(keychain.get("primary"), "fixture-legacy")
    }

    @MainActor
    func testInvalidProviderSwitchPreservesCurrentConnectionAndDraft() async throws {
        let name = "ColdCoffeeIOS.Test.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let model = AppModel(client: ChatTestClient(), defaults: defaults, keychain: KeychainStore(service: name))
        model.apiKey = "fixture-current"
        model.chatDraft = "Keep this message"
        model.selectModel("relay/chat/current", manuallyEntered: true)
        let provider = model.provider
        for invalid in ["", "http://relay.example/v1", "https://user:" + "fixture@relay.example/v1"] {
            XCTAssertFalse(model.addProvider(name: "Invalid", baseURL: invalid))
            XCTAssertEqual(model.provider, provider)
            XCTAssertEqual(model.apiKey, "fixture-current")
            XCTAssertEqual(model.selectedModel, "relay/chat/current")
            XCTAssertEqual(model.chatDraft, "Keep this message")
            XCTAssertNotNil(model.errorMessage)
        }
    }

    @MainActor
    func testObsoleteCatalogRequestCannotOverwriteLatestResult() async throws {
        let name = "ColdCoffeeIOS.Test.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let firstStarted = expectation(description: "First catalog request started")
        let secondStarted = expectation(description: "Second catalog request started")
        let gate = ModelRequestGate(observations: [firstStarted, secondStarted])
        let client = ChatTestClient(catalog: { _ in try await gate.request() })
        let model = AppModel(client: client, defaults: defaults, keychain: KeychainStore(service: name))
        model.apiKey = " fixture "

        let first = try XCTUnwrap(model.loadModels())
        await fulfillment(of: [firstStarted], timeout: 3)
        let second = try XCTUnwrap(model.loadModels())
        await fulfillment(of: [secondStarted], timeout: 3)
        guard await gate.complete(2, with: ["relay/chat/new"]) else {
            await gate.cancelPending()
            return XCTFail("The second request did not reach the client")
        }
        await second.value
        guard await gate.complete(1, with: ["relay/chat/old"]) else {
            return XCTFail("The first request was not pending")
        }
        await first.value

        XCTAssertEqual(model.models, ["relay/chat/new"])
        XCTAssertEqual(model.selectedModel, "relay/chat/new")
        XCTAssertNil(model.errorMessage)
    }

    @MainActor
    func testStoppingRemovesEmptyReplyAndDoesNotPoisonNextSend() async throws {
        let name = "ColdCoffeeIOS.Test.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let started = expectation(description: "First stream started")
        let ended = expectation(description: "Second stream produced text")
        let client = ChatTestClient(stream: { messages in
            AsyncThrowingStream { continuation in
                if messages.last?.content == "First" {
                    started.fulfill()
                } else {
                    continuation.yield("Reply")
                    continuation.finish()
                    ended.fulfill()
                }
            }
        })
        let model = AppModel(client: client, defaults: defaults, keychain: KeychainStore(service: name))
        model.apiKey = "fixture"
        model.selectModel("relay/chat/default", manuallyEntered: true)
        model.chatDraft = "First"
        XCTAssertTrue(model.sendDraft())
        XCTAssertTrue(model.chatDraft.isEmpty)
        await fulfillment(of: [started], timeout: 3)
        model.stop()
        XCTAssertFalse(model.isBusy)
        XCTAssertEqual(model.status, "已停止")
        XCTAssertEqual(model.messages.map(\.content), ["First"])
        XCTAssertNil(model.errorMessage)

        model.chatDraft = "Second"
        XCTAssertTrue(model.sendDraft())
        await fulfillment(of: [ended], timeout: 3)
        for _ in 0..<300 where model.isBusy {
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertFalse(model.isBusy)
        XCTAssertEqual(model.status, "已完成")
        XCTAssertEqual(model.messages.map(\.content), ["First", "Second", "Reply"])
        XCTAssertNil(model.errorMessage)
    }
}

private struct ChatTestClient: ChatServing {
    var catalog: @Sendable (String) async throws -> [String] = { _ in [] }
    var stream: @Sendable ([ChatMessage]) -> AsyncThrowingStream<String, Error> = { _ in AsyncThrowingStream { $0.finish() } }

    func models(for provider: Provider, key: String) async throws -> [String] {
        try await catalog(key)
    }

    func streamChat(provider: Provider, key: String, model: String, messages: [ChatMessage], system: String) -> AsyncThrowingStream<String, Error> {
        stream(messages)
    }
}

private actor ModelRequestGate {
    private var requests: [CheckedContinuation<[String], Error>?] = []
    private let observations: [XCTestExpectation]

    init(observations: [XCTestExpectation]) {
        self.observations = observations
    }

    func request() async throws -> [String] {
        try await withCheckedThrowingContinuation { continuation in
            let index = requests.count
            requests.append(continuation)
            if observations.indices.contains(index) { observations[index].fulfill() }
        }
    }

    func complete(_ index: Int, with result: [String]) -> Bool {
        guard requests.indices.contains(index - 1), let request = requests[index - 1] else { return false }
        requests[index - 1] = nil
        request.resume(returning: result)
        return true
    }

    func cancelPending() {
        for index in requests.indices {
            requests[index]?.resume(throwing: CancellationError())
            requests[index] = nil
        }
    }
}
