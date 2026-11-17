// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI
import Foundation

@main
struct ColdCoffeeIOSApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(model.colorScheme)
                .onAppear {
                    #if DEBUG
                    if let tab = Self.screenshotTab { model.tab = tab }
                    #endif
                }
        }
    }

    #if DEBUG
    private static var screenshotTab: AppModel.Tab? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--coldcoffee-screenshot-tab"),
              arguments.indices.contains(index + 1) else { return nil }
        switch arguments[index + 1] {
        case "home": return .home
        case "chat": return .chat
        case "work": return .work
        case "community": return .community
        default: return nil
        }
    }
    #endif
}
