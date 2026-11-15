// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI

@main
struct ColdCoffeeIOSApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(model.colorScheme)
        }
    }
}
