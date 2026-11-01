import PrayerTowerKit
import SwiftUI

/// One of the signed-in app's sections, for the tab bar, the iPad and Mac sidebar, and ⌘1–⌘7.
struct AppSection: Identifiable, Hashable {
    let tag: Int
    let title: String
    let icon: String
    /// Drawn instead of the SF Symbol, to match the Expo app's tab bar (🙏 My Promises, 👤 Me).
    var emoji: String? = nil
    /// Prayers' drawn dove (Steve, 2026-10-30: "make it look like a dove"), in place of the emoji.
    var dove = false
    var id: Int { tag }

    /// The icon for the sidebar.
    @ViewBuilder var label: some View {
        Label {
            Text(title)
        } icon: {
            if dove { DoveShape().frame(width: 22, height: 22).accessibilityHidden(true) } else if let emoji { Text(emoji).accessibilityHidden(true) } else { Image(systemName: icon) }
        }
    }

    /// The icon for the iPhone tab bar, which takes only an image and a text: the emoji drawn into
    /// an image, kept in its own colours.
    var tabImage: Image {
        #if os(iOS)
        if dove { return Image(uiImage: DoveShape.tabImage) }
        if let emoji {
            let font = UIFont.systemFont(ofSize: 22)
            let text = emoji as NSString
            let image = UIGraphicsImageRenderer(size: text.size(withAttributes: [.font: font])).image { _ in
                text.draw(at: .zero, withAttributes: [.font: font])
            }
            return Image(uiImage: image.withRenderingMode(.alwaysOriginal))
        }
        #endif
        return Image(systemName: icon)
    }
}

/// The signed-in app. Circles and Me show only what the admin switches turn on. On iPhone, tabs;
/// on iPad (regular width) and Mac, a sidebar with the section beside it. Messages and Notices are
/// in the sidebar but not in the iPhone tab bar under the feed: there they open from Me (Steve, 2026-10-30).
struct MainTabs: View {
    @Environment(AppModel.self) private var model
    @State private var tab = 0
    /// Changed by Home, so the feed starts again from its top screen.
    @State private var home = UUID()
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var width
    private var sidebar: Bool { width == .regular }
    #else
    private let sidebar = true
    #endif

    private var sections: [AppSection] {
        var all = [
            AppSection(tag: 0, title: model.words("tabs.prayers"), icon: "list.bullet", dove: true),
            // Open Circle: praying hands are a religious sign there.
            AppSection(tag: 1, title: model.words("tabs.promises"), icon: "checkmark.circle", emoji: model.wording == .neutral ? "🤝" : "🙏"),
        ]
        if sidebar {
            all.append(AppSection(tag: 2, title: model.words("tabs.messages"), icon: "bubble.left.and.bubble.right"))
            all.append(AppSection(tag: 5, title: model.words("tabs.notices"), icon: "bell"))
            if model.features["topicGroups"], model.me?.community?.shows("groups") ?? true { all.append(AppSection(tag: 6, title: model.words("topicGroups.title"), icon: "person.2")) }
        }
        if model.features["prayerCircles"] { all.append(AppSection(tag: 3, title: "Circles", icon: "person.3")) }
        all.append(AppSection(tag: 4, title: model.words("tabs.me"), icon: "person.crop.circle", emoji: "👤"))
        return all
    }

    var body: some View {
        Group {
            if sidebar {
                NavigationSplitView {
                    List(sections, selection: Binding(get: { tab }, set: { if let t = $0 { tab = t } })) { s in
                        s.label.tag(s.tag)
                    }
                    .navigationTitle(model.wording == .neutral ? "Open Circle" : "Prayer Tower")
                } detail: {
                    screen(tab)
                }
            } else {
                TabView(selection: $tab) {
                    // .tabItem rather than Tab(…), which needs iOS 18; the app supports iOS 17.
                    ForEach(sections) { s in
                        screen(s.tag).tabItem { s.tabImage; Text(s.title) }.tag(s.tag)
                            #if os(iOS)
                            // The bar under the feed is 75% opaque (Steve, 2026-10-30).
                            .toolbarBackground(Color.barBackground.opacity(0.75), for: .tabBar)
                            .toolbarBackground(.visible, for: .tabBar)
                            #endif
                    }
                }
                // Steve (2026-10-30): a Home icon in the top left corner of every screen, with the
                // menu right below it, so there's always a way back to the feed.
                .overlay(alignment: .topLeading) { homeAndMenu.padding(.leading, 8).padding(.top, 2) }
            }
        }
        // ⌘1–⌘7 jump between sections with a hardware keyboard (iPad, Mac).
        .background { shortcuts }
        .task { await model.loadSettings() }
        .fullScreenCover(isPresented: Binding(get: { model.showTour }, set: { model.showTour = $0 })) { TourView() }
        .onChange(of: model.openPost) { _, id in if id != nil { tab = 0 } }
        // Store screenshots (scripts/mac-screenshots-native.sh): open the asked-for screen.
        .onAppear {
            guard let screen = SampleServer.screen() else { return }
            let start = SampleServer.tab(for: screen)
            tab = start.tab
            // iPhone: Messages and Notices open from Me.
            if !sidebar, start.tab == 2 || start.tab == 5 {
                tab = 4
                model.meOpens = start.tab
            }
            if start.openPost { model.openPost = "sample-p1" }
        }
    }

    /// Home (back to the top of the feed) and, right below it, the menu of every section.
    private var homeAndMenu: some View {
        VStack(spacing: 6) {
            Button {
                tab = 0
                home = UUID()
            } label: {
                Image(systemName: "house.fill").font(.system(size: 18, weight: .semibold)).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Home")
            Menu {
                ForEach(menuSections) { s in
                    Button { go(s.tag) } label: { s.label }
                }
            } label: {
                Image(systemName: "line.3.horizontal").font(.system(size: 18, weight: .semibold)).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Menu")
        }
        .foregroundStyle(Color.accessibleAccent)
        .background(.regularMaterial, in: .rect(cornerRadius: 14))
    }

    /// Every section, Messages and Notices included (on iPhone they open from Me).
    private var menuSections: [AppSection] {
        var all = sections
        if !sidebar {
            all.insert(AppSection(tag: 2, title: model.words("tabs.messages"), icon: "bubble.left.and.bubble.right"), at: min(2, all.count))
            all.insert(AppSection(tag: 5, title: model.words("tabs.notices"), icon: "bell"), at: min(3, all.count))
        }
        return all
    }

    private func go(_ tag: Int) {
        if tag == 0 { home = UUID() }
        if !sidebar, tag == 2 || tag == 5 {
            tab = 4
            model.meOpens = tag
        } else {
            tab = tag
        }
    }

    @ViewBuilder private func screen(_ tag: Int) -> some View {
        switch tag {
        case 1: CommitmentsView()
        case 2: MessagesView()
        case 3: CirclesView()
        case 4: MeView()
        case 5: NotificationsView()
        case 6: NavigationStack { TopicGroupsView() }
        default: FeedView().id(home)
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

/// A peace dove in flight with an olive sprig in its beak: the Prayers icon, drawn on a 24-point grid.
struct DoveShape: Shape {
    func path(in r: CGRect) -> Path {
        let s = min(r.width, r.height) / 24
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * s, y: r.minY + y * s) }
        var p = Path()
        // Body, raised wings and fanned tail.
        p.move(to: pt(3.6, 9.6))
        p.addLine(to: pt(5.2, 9.1))
        p.addQuadCurve(to: pt(7.4, 7.1), control: pt(5.7, 7.1))
        p.addQuadCurve(to: pt(9.6, 8.8), control: pt(9, 7.2))
        p.addQuadCurve(to: pt(13, 1.8), control: pt(10, 4.6))
        for (x, y) in [(13.4, 3.4), (14.4, 2.6), (14.6, 4.4), (15.6, 4)] as [(CGFloat, CGFloat)] { p.addLine(to: pt(x, y)) }
        p.addQuadCurve(to: pt(14.4, 9.4), control: pt(15.6, 7))
        p.addQuadCurve(to: pt(21.2, 4), control: pt(16.8, 5.4))
        p.addLine(to: pt(20.6, 5.6))
        p.addLine(to: pt(21.8, 5.4))
        p.addQuadCurve(to: pt(17, 11.2), control: pt(20.6, 9.2))
        for (x, y) in [(19.4, 10.6), (22.8, 12.2), (20.6, 12.8), (22.6, 14.6), (19.6, 14), (20.4, 16), (16.8, 14.2)] as [(CGFloat, CGFloat)] { p.addLine(to: pt(x, y)) }
        p.addQuadCurve(to: pt(8.4, 14), control: pt(12.4, 16.4))
        p.addQuadCurve(to: pt(5.4, 10.4), control: pt(6, 12.4))
        p.closeSubpath()
        // The eye, left open.
        p.addEllipse(in: CGRect(origin: pt(6.7, 8.1), size: CGSize(width: s, height: s)))
        // The olive sprig: its stem and two leaves.
        var stem = Path()
        stem.move(to: pt(4, 9.8))
        stem.addQuadCurve(to: pt(1.6, 13.4), control: pt(2.6, 11.2))
        p.addPath(stem.strokedPath(StrokeStyle(lineWidth: 0.7 * s, lineCap: .round)))
        for (x, y, turn) in [(2.4, 11.4, -30.0), (3.6, 12.4, 40.0)] as [(CGFloat, CGFloat, Double)] {
            let leaf = Path(ellipseIn: CGRect(x: -1.1 * s, y: -0.45 * s, width: 2.2 * s, height: 0.9 * s))
            p.addPath(leaf.applying(CGAffineTransform(rotationAngle: turn * .pi / 180).concatenating(CGAffineTransform(translationX: pt(x, y).x, y: pt(x, y).y))))
        }
        return p
    }

    #if os(iOS)
    /// The dove for the iPhone tab bar, as a template image so it takes the bar's selected and unselected tints.
    static let tabImage: UIImage = UIGraphicsImageRenderer(size: CGSize(width: 26, height: 26)).image { ctx in
        UIColor.black.setFill()
        let path = DoveShape().path(in: CGRect(x: 0, y: 0, width: 26, height: 26)).cgPath
        ctx.cgContext.addPath(path)
        ctx.cgContext.fillPath(using: .evenOdd)
    }.withRenderingMode(.alwaysTemplate)
    #endif
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
