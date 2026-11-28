// SPDX-License-Identifier: GPL-3.0-only
import XCTest

/// Real taps against the ordinary app, without fixture keys or network requests.
final class ColdCoffeeInteractionUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["首页"].waitForExistence(timeout: 15))
        return app
    }

    @MainActor
    private func tap(_ element: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 8))
        for _ in 0..<3 where !element.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
        element.tap()
    }

    @MainActor
    private func keepScreenshot(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testTabsSettingsAndCommunityRespondToTouch() async throws {
        let app = launchApp()
        defer { app.terminate() }
        tap(app.buttons["管理中转"], in: app)
        XCTAssertTrue(app.navigationBars["接入设置"].waitForExistence(timeout: 5))
        tap(app.buttons["完成"], in: app)
        tap(app.tabBars.buttons["社区"], in: app)
        XCTAssertTrue(app.staticTexts["加入冷咖啡社群"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["1131239659"].exists)
        keepScreenshot("community-after-touch", app: app)
        tap(app.tabBars.buttons["首页"], in: app)
        XCTAssertTrue(app.buttons["管理中转"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testConnectWithoutKeyExplainsAndStaysOnHome() async throws {
        let app = launchApp()
        defer { app.terminate() }
        let connect = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "连接并读取模型")).firstMatch
        tap(connect, in: app)
        let alert = app.alerts["需要处理"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts["请先填写自己的 API Key"].exists)
        tap(alert.buttons["知道了"], in: app)
        XCTAssertTrue(app.tabBars.buttons["首页"].isSelected)
        keepScreenshot("missing-key-feedback", app: app)
    }

    @MainActor
    func testInvalidProviderKeepsSettingsOpen() async throws {
        let app = launchApp()
        defer { app.terminate() }
        tap(app.buttons["管理中转"], in: app)
        let address = app.textFields["Base URL，例如 https://example.com/v1"]
        tap(address, in: app)
        address.typeText("http://invalid.example/v1")
        tap(app.buttons["保存并切换"], in: app)
        let alert = app.alerts["需要处理"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts["请使用 HTTPS 接口地址"].exists)
        tap(alert.buttons["知道了"], in: app)
        XCTAssertTrue(app.navigationBars["接入设置"].exists)
        XCTAssertEqual(address.value as? String, "http://invalid.example/v1")
        keepScreenshot("invalid-provider-retains-settings", app: app)
    }

    @MainActor
    func testRejectedSendPreservesDraftAcrossTabs() async throws {
        let app = launchApp()
        defer { app.terminate() }
        tap(app.tabBars.buttons["对话"], in: app)
        let draft = app.descendants(matching: .any).matching(identifier: "chat-draft").firstMatch
        tap(draft, in: app)
        draft.typeText("730061924580")
        // Check preservation of the actual composer content, independently of
        // simulator keyboard/autocorrection delivery of individual keystrokes.
        let textBeforeSend = try XCTUnwrap(draft.value as? String)
        XCTAssertFalse(textBeforeSend.isEmpty)
        XCTAssertTrue(textBeforeSend.allSatisfy(\.isNumber))
        tap(app.buttons["chat-send"], in: app)
        let alert = app.alerts["需要处理"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        tap(alert.buttons["知道了"], in: app)
        XCTAssertTrue(app.tabBars.buttons["首页"].isSelected)
        tap(app.tabBars.buttons["对话"], in: app)
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        XCTAssertEqual(draft.value as? String, textBeforeSend)
        keepScreenshot("draft-preserved-after-rejected-send", app: app)
    }
}
