import PrayerTowerKit
import PrayerTowerSession
import SwiftUI

@main
struct PrayerTowerApp: App {
    @State private var model = AppModel(store: AppModel.makeStore())

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .task { await model.start() }
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
    var wording: Wording = .faith {
        didSet { words = Words(wording) }
    }
    /// The Expo app's words for this member's wording (Open Circle gets the neutral set).
    var words = Words(.faith)
    /// The signed-in member, their community and roles (`/me`).
    var me: Me?
    /// The member's choices for the conversation helpers, loaded only while a helper is switched on.
    var talkPrefs: ConversationPrefs?
    /// Emoji meanings for the action row, loaded only while both meaning switches are on.
    var tree: [MeaningEmoji] = []

    init(store: SessionStore) { self.store = store }

    static func makeStore() -> SessionStore {
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
        wording = Wording(self.me?.community)
        talkPrefs = Talk.anyOn(features) ? ((try? await store.api.conversationPrefs()) ?? ConversationPrefs()) : nil
        tree = features["meaningReactions"] && features["meaningIconRow"] ? ((try? await store.api.reactionMeanings()) ?? []) : []
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if model.starting {
            ProgressView()
        } else {
            switch model.state {
            case .signedOut: SignInView()
            case .needsCode: CodeView()
            case .signedIn: MainTabs()
            }
        }
    }
}
