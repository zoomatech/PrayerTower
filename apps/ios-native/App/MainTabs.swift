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

/// Me → Feed style: the skins this community offers (the server lists only what the skins
/// switch allows). Hidden while there is nothing to choose between.
struct FeedStyleSection: View {
    @Environment(AppModel.self) private var model
    @State private var choices: FeedThemeChoices?
    @State private var error: String?

    var body: some View {
        Group {
            if let c = choices, c.themes.count > 1 {
                let current = c.current ?? c.themes.first(where: { $0.is_default })?.slug
                Section("Feed style") {
                    ForEach(c.themes) { t in
                        Button {
                            Task { await choose(t.slug) }
                        } label: {
                            HStack {
                                Text(Skin.name(t.name, model.wording))
                                Spacer()
                                if current == t.slug { Image(systemName: "checkmark") }
                            }
                        }
                        .accessibilityAddTraits(current == t.slug ? .isSelected : [])
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                }
            }
        }
        // On every return to Me, so a skin just made in the theme maker is there to choose.
        .onAppear { Task { choices = try? await model.store.api.feedThemes() } }
    }

    private func choose(_ slug: String) async {
        do {
            choices = try await model.store.api.chooseFeedTheme(slug)
            model.feedStyle = slug
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
