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
