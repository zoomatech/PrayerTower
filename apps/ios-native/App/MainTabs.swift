import PrayerTowerKit
import SwiftUI

/// One of the signed-in app's sections, for the tab bar, the iPad and Mac sidebar, and ⌘1–⌘6.
struct AppSection: Identifiable, Hashable {
    let tag: Int
    let title: String
    let icon: String
    var id: Int { tag }
}

/// The signed-in app. Circles and Me show only what the admin switches turn on. On iPhone, tabs;
/// on iPad (regular width) and Mac, a sidebar with the section beside it.
struct MainTabs: View {
    @Environment(AppModel.self) private var model
    @State private var tab = 0
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var width
    private var sidebar: Bool { width == .regular }
    #else
    private let sidebar = true
    #endif

    private var sections: [AppSection] {
        var all = [
            AppSection(tag: 0, title: "Feed", icon: "list.bullet"),
            AppSection(tag: 1, title: model.words("tabs.promises"), icon: "checkmark.circle"),
            AppSection(tag: 2, title: model.words("tabs.messages"), icon: "bubble.left.and.bubble.right"),
            AppSection(tag: 5, title: model.words("tabs.notices"), icon: "bell"),
        ]
        if model.features["prayerCircles"] { all.append(AppSection(tag: 3, title: "Circles", icon: "person.3")) }
        all.append(AppSection(tag: 4, title: model.words("tabs.me"), icon: "person.crop.circle"))
        return all
    }

    var body: some View {
        Group {
            if sidebar {
                NavigationSplitView {
                    List(sections, selection: Binding(get: { tab }, set: { if let t = $0 { tab = t } })) { s in
                        Label(s.title, systemImage: s.icon).tag(s.tag)
                    }
                    .navigationTitle(model.wording == .neutral ? "Open Circle" : "Prayer Tower")
                } detail: {
                    screen(tab)
                }
            } else {
                TabView(selection: $tab) {
                    // .tabItem rather than Tab(…), which needs iOS 18; the app supports iOS 17.
                    ForEach(sections) { s in
                        screen(s.tag).tabItem { Label(s.title, systemImage: s.icon) }.tag(s.tag)
                    }
                }
            }
        }
        // ⌘1–⌘6 jump between sections with a hardware keyboard (iPad, Mac).
        .background { shortcuts }
        .task { await model.loadSettings() }
        .fullScreenCover(isPresented: Binding(get: { model.showTour }, set: { model.showTour = $0 })) { TourView() }
        .onChange(of: model.openPost) { _, id in if id != nil { tab = 0 } }
        // Store screenshots (scripts/mac-screenshots-native.sh): open the asked-for screen.
        .onAppear {
            guard let screen = SampleServer.screen() else { return }
            let start = SampleServer.tab(for: screen)
            tab = start.tab
            if start.openPost { model.openPost = "sample-p1" }
        }
    }

    @ViewBuilder private func screen(_ tag: Int) -> some View {
        switch tag {
        case 1: CommitmentsView()
        case 2: MessagesView()
        case 3: CirclesView()
        case 4: MeView()
        case 5: NotificationsView()
        default: FeedView()
        }
    }

    private var shortcuts: some View {
        ForEach(Array(sections.enumerated()), id: \.element.id) { i, s in
            Button(s.title) { tab = s.tag }
                .keyboardShortcut(KeyEquivalent(Character(String(i + 1))), modifiers: .command)
        }
        .opacity(0)
        .frame(width: 0, height: 0)
        .accessibilityHidden(true)
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
                                if current == t.slug { Image(systemName: "checkmark").accessibilityHidden(true) }
                            }
                        }
                        .accessibilityAddTraits(current == t.slug ? .isSelected : [])
                    }
                    if let error { Text(error).foregroundStyle(Color.danger) }
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
