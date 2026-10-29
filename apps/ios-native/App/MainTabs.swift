import PrayerTowerKit
import SwiftUI

/// The signed-in app. Circles and Me show only what the admin switches turn on.
struct MainTabs: View {
    @Environment(AppModel.self) private var model
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            // .tabItem rather than Tab(…), which needs iOS 18; the app supports iOS 17.
            FeedView().tabItem { Label("Feed", systemImage: "list.bullet") }.tag(0)
            CommitmentsView().tabItem { Label(model.words("tabs.promises"), systemImage: "checkmark.circle") }.tag(1)
            MessagesView().tabItem { Label(model.words("tabs.messages"), systemImage: "bubble.left.and.bubble.right") }.tag(2)
            if model.features["prayerCircles"] {
                CirclesView().tabItem { Label("Circles", systemImage: "person.3") }.tag(3)
            }
            MeView().tabItem { Label(model.words("tabs.me"), systemImage: "person.crop.circle") }.tag(4)
        }
        .task { await model.loadSettings() }
        .onChange(of: model.openPost) { _, id in if id != nil { tab = 0 } }
    }
}
