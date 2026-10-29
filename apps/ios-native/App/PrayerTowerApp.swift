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

    init(store: SessionStore) { self.store = store }

    static func makeStore() -> SessionStore {
        let info = Bundle.main.infoDictionary ?? [:]
        func url(_ key: String) -> URL { URL(string: info[key] as? String ?? "") ?? URL(string: "http://127.0.0.1")! }
        return SessionStore(
            supabaseURL: url("PTSupabaseURL"),
            publishableKey: info["PTSupabaseKey"] as? String ?? "",
            apiURL: url("PTApiURL"),
            storage: KeychainLocalStorage()
        )
    }

    func start() async {
        state = await store.current()
        starting = false
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
            case .signedIn: FeedView()
            }
        }
    }
}
