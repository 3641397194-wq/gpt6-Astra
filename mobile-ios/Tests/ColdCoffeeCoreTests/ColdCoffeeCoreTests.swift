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
}
