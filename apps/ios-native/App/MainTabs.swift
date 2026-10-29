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
            MeView().tabItem { Label("Me", systemImage: "person.crop.circle") }
        }
        .task { await model.loadSettings() }
    }
}

struct MeView: View {
    @Environment(AppModel.self) private var model
    @State private var freshDay: FreshDay?

    var body: some View {
        NavigationStack {
            List {
                if model.features["freshDays"] {
                    if let line = freshDay?.line { Section { Text(line) } }
                    Section { FreshDaysSection() } header: { Text("Days that matter") }
                }
                Section {
                    NavigationLink("Sign-in security") { SignInSecurityView() }
                }
                Section {
                    Button("Sign out", role: .destructive) {
                        Task {
                            await model.store.signOut()
                            model.state = .signedOut
                        }
                    }
                }
            }
            .navigationTitle("Me")
            .task(id: model.features["freshDays"]) {
                freshDay = model.features["freshDays"] ? (try? await model.store.api.freshDayToday()) ?? nil : nil
            }
        }
    }
}
