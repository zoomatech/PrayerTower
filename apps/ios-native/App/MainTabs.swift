import PrayerTowerKit
import SwiftUI

/// The signed-in app. Circles and Me show only what the admin switches turn on.
struct MainTabs: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        TabView {
            // .tabItem rather than Tab(…), which needs iOS 18; the app supports iOS 17.
            FeedView().tabItem { Label("Feed", systemImage: "list.bullet") }
            CommitmentsView().tabItem { Label(model.words("tabs.promises"), systemImage: "checkmark.circle") }
            MessagesView().tabItem { Label(model.words("tabs.messages"), systemImage: "bubble.left.and.bubble.right") }
            if model.features["prayerCircles"] {
                CirclesView().tabItem { Label("Circles", systemImage: "person.3") }
            }
            MeView().tabItem { Label(model.words("tabs.me"), systemImage: "person.crop.circle") }
        }
        .task { await model.loadSettings() }
    }
}
