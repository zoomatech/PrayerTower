import PrayerTowerKit
import PrayerTowerSession
import SwiftUI

@main
struct PrayerTowerApp: App {
    @State private var model = AppModel(store: AppModel.makeStore())
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .tint(Color.accessibleAccent)
                .environment(model)
                .task { await model.start() }
                // Back in the foreground: send anything done while offline.
                .onChange(of: phase) { _, now in if now == .active { Task { await model.store.api.sendQueued() } } }
                .onOpenURL { url in
                    if let code = Invite.code(from: url) { model.invite = code } else { model.openPost = PrayNow.postId(from: url) }
                }
        }
    }
}

/// Sign-in state and the API for every screen, like AuthProvider in the Expo app.
@MainActor @Observable
final class AppModel {
    let store: SessionStore
    var state: SignInState = .signedOut
    var starting = true
    /// Admin switches (`/features`); anything missing counts as off.
    var features = Features(values: [:])
    /// Which app this build is: Prayer Tower, or the separately branded, non-religious Open Circle.
    let edition = Edition(Bundle.main.infoDictionary)
    /// A link people send outside the app (on the site when there is one, else the app's scheme).
    func shareURL(_ path: String, query: [String: String] = [:]) -> String {
        ShareLinks.url(path, query: query, base: ShareLinks.base(link: Bundle.main.infoDictionary?["PTLinkURL"] as? String, api: store.api.baseURL), scheme: edition.scheme)
    }
    var wording: Wording = Edition(Bundle.main.infoDictionary) == .openCircle ? .neutral : .faith {
        didSet { words = Words(wording) }
    }
    /// The Expo app's words for this member's wording (Open Circle gets the neutral set).
    var words = Words(Edition(Bundle.main.infoDictionary) == .openCircle ? .neutral : .faith)
    /// The signed-in member, their community and roles (`/me`).
    var me: Me?
    /// The member's choices for the conversation helpers, loaded only while a helper is switched on.
    var talkPrefs: ConversationPrefs?
    /// Emoji meanings for the action row, loaded only while both meaning switches are on.
    var tree: [MeaningEmoji] = []
    /// A request to open from a widget or Live Activity tap.
    var openPost: String?
    /// A request is open over the feed, so Home and Menu step down below its title bar (Steve, 2026-11-01).
    var feedOpen = false
    /// On iPhone, the Me menu page to open: Messages (2) or Notices (5), which are not tabs there.
    var meOpens: Int?
    /// The code from an invite link (prayertower://sign-in?invite=CODE), for sign-up.
    var invite: String?
    /// The tour shows once after the welcome questions.
    var showTour = false
    /// Bumped when the member picks another feed style, so the feed reloads in it.
    var feedStyle: String?

    init(store: SessionStore) { self.store = store }

    static func makeStore() -> SessionStore {
        if SampleServer.isOn() {
            Tour.markSeen(SampleServer.memberId)
            return .sampleData()
        }
        let info = Bundle.main.infoDictionary ?? [:]
        func url(_ key: String) -> URL { URL(string: info[key] as? String ?? "") ?? URL(string: "http://127.0.0.1")! }
        return SessionStore(
            supabaseURL: url("PTSupabaseURL"),
            publishableKey: info["PTSupabaseKey"] as? String ?? "",
            apiURL: url("PTApiURL")
        )
    }

    func start() async {
        state = await store.current()
        starting = false
    }

    /// Reads the switches and the member's wording after sign-in. A failure leaves everything off.
    func loadSettings() async {
        async let f = try? store.api.features()
        async let me = try? store.api.me()
        features = await f ?? Features(values: [:])
        self.me = await me
        // The Open Circle app always uses the neutral words, whatever the community.
        wording = edition == .openCircle ? .neutral : Wording(self.me?.community)
        talkPrefs = Talk.anyOn(features) ? ((try? await store.api.conversationPrefs()) ?? ConversationPrefs()) : nil
        tree = features["meaningReactions"] && features["meaningIconRow"] ? ((try? await store.api.reactionMeanings()) ?? []) : []
        if let p = self.me?.profile, p.onboardedAt != nil, !Tour.seen(p.id) { showTour = true }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains(AuditSamplesView.launchArgument) {
            AuditSamplesView()
        } else {
            signedInOrOut
        }
        #else
        signedInOrOut
        #endif
    }

    @ViewBuilder private var signedInOrOut: some View {
        if model.starting {
            ProgressView()
        } else {
            switch model.state {
            case .signedOut: SignInView()
            case .needsCode: CodeView()
            case .signedIn:
                // New members answer the welcome questions first.
                if let me = model.me, me.profile.onboardedAt == nil { OnboardingView() } else { MainTabs() }
            }
        }
    }
}
