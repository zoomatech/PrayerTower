import PrayerTowerKit
import PrayerTowerSession
import SwiftUI

// The native Mac operator console for the station's control operator (docs/SWIFT_PORT.md,
// docs/STATION_OPERATOR_GUIDE.md "Operator console"). It replaces the web console on the Mac:
// the same view as the Expo operator console, plus station health, keying controls with their
// safety rules (Keying in PrayerTowerKit), a Station menu with keyboard shortcuts and a menu bar
// item that shows whether the station may transmit and holds it in one click.

@main
struct ConsoleApp: App {
    @State private var model: ConsoleModel

    init() {
        let model = ConsoleModel(store: ConsoleModel.makeStore())
        _model = State(initialValue: model)
        // Started here rather than from the window, so the menu bar item works with the window closed.
        Task { await model.start() }
    }

    var body: some Scene {
        Window(Words(.faith)("operatorConsole.title"), id: "console") {
            ConsoleRoot()
                .environment(model)
                .frame(minWidth: 640, minHeight: 520)
        }
        // A single Window scene doesn't open by itself when the app also has a menu bar item.
        .defaultLaunchBehavior(.presented)
        .commands { StationCommands(model: model) }

        MenuBarExtra {
            MenuBarView().environment(model)
        } label: {
            Image(systemName: model.menuBarSymbol)
                .accessibilityLabel(model.menuBarTitle)
        }
    }
}

/// Sign-in, the console and its overrides for every view; refreshes every 15 seconds while signed in.
@MainActor @Observable
final class ConsoleModel {
    let store: SessionStore
    let words = Words(.faith)
    var state: SignInState = .signedOut
    var starting = true
    var console: RadioConsole?
    var health: StationHealth?
    /// The console switch is off (a 404).
    var off = false
    /// Signed in, but neither an admin nor a radio operator (a 403).
    var notOperator = false
    var busy = false
    var error: String?
    var updatedAt: Date?
    /// Sample data with no server or account (ConsoleDemo): on by itself when the app has no
    /// server settings, or chosen on the sign-in screen. Holds and overrides change only the sample.
    var demo: ConsoleDemo?
    private var refresher: Task<Void, Never>?

    init(store: SessionStore) { self.store = store }

    /// True when Config.xcconfig still has the example values, so there is no server to sign in to.
    static var unconfigured: Bool {
        let key = Bundle.main.infoDictionary?["PTSupabaseKey"] as? String ?? ""
        return key.isEmpty || key.contains("REPLACE_ME") || key.hasPrefix("$(")
    }

    static func makeStore() -> SessionStore {
        let info = Bundle.main.infoDictionary ?? [:]
        func url(_ key: String) -> URL { URL(string: info[key] as? String ?? "") ?? URL(string: "http://127.0.0.1")! }
        return SessionStore(supabaseURL: url("PTSupabaseURL"), publishableKey: info["PTSupabaseKey"] as? String ?? "", apiURL: url("PTApiURL"))
    }

    var keying: Keying? { console.map { Keying($0) } }

    var menuBarSymbol: String {
        guard let k = keying else { return "antenna.radiowaves.left.and.right.slash" }
        if !(console?.problems.isEmpty ?? true) { return "exclamationmark.triangle" }
        switch k.state {
        case .held: return "pause.circle"
        case .onAir, .override: return "antenna.radiowaves.left.and.right"
        case .offAir: return "antenna.radiowaves.left.and.right.slash"
        }
    }

    var menuBarTitle: String {
        guard let k = keying else { return words("operatorConsole.title") }
        switch k.state {
        case .held: return words("macConsole.held")
        case .onAir, .override: return words("macConsole.onAir")
        case .offAir: return words("macConsole.offAir")
        }
    }

    func start() async {
        if ConsoleModel.unconfigured {
            startDemo()
            starting = false
            return
        }
        state = await store.current()
        starting = false
        signedInChanged()
    }

    /// Starts or stops the 15-second refresh as the operator signs in or out.
    func signedInChanged() {
        refresher?.cancel()
        guard state == .signedIn else {
            console = nil
            health = nil
            return
        }
        refresher = Task { [weak self] in
            while !Task.isCancelled {
                await self?.load()
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    func startDemo() {
        refresher?.cancel()
        demo = ConsoleDemo()
        console = demo?.console
        health = demo?.health
        off = false
        notOperator = false
        error = nil
        updatedAt = .now
        state = .signedIn
    }

    func load() async {
        if let demo {
            console = demo.console
            updatedAt = .now
            return
        }
        do {
            console = try await store.api.radioConsole()
            off = false
            notOperator = false
            error = nil
            updatedAt = .now
        } catch let e as APIError where e.status == 404 {
            off = true
            console = nil
        } catch let e as APIError where e.status == 403 {
            notOperator = true
            console = nil
        } catch {
            self.error = error.localizedDescription
        }
        // Admins only; radio operators see the console without it.
        health = try? await store.api.radioHealth()
    }

    /// Hold never asks and is offered whenever the station isn't already held.
    func hold() async { await change(paused: true) }
    func resume() async { await change(paused: false) }
    func sendFor(_ minutes: Int) async { await change(windowOverrideMinutes: minutes) }
    func endOverride() async { await change(windowOverrideMinutes: 0) }

    private func change(paused: Bool? = nil, windowOverrideMinutes: Int? = nil) async {
        if demo != nil {
            demo?.apply(paused: paused, windowOverrideMinutes: windowOverrideMinutes)
            console = demo?.console
            updatedAt = .now
            return
        }
        await change { try await $0.updateRadioConsole(paused: paused, windowOverrideMinutes: windowOverrideMinutes) }
    }

    private func change(_ step: (APIClient) async throws -> RadioConsole) async {
        busy = true
        defer { busy = false }
        do {
            console = try await step(store.api)
            error = nil
            updatedAt = .now
        } catch {
            self.error = error.localizedDescription
        }
    }

    func signOut() async {
        if demo != nil {
            demo = nil
            console = nil
            health = nil
            state = ConsoleModel.unconfigured ? .signedIn : .signedOut
            if ConsoleModel.unconfigured { startDemo() }
            return
        }
        await store.signOut()
        state = .signedOut
        signedInChanged()
    }
}

struct ConsoleRoot: View {
    @Environment(ConsoleModel.self) private var model

    var body: some View {
        if model.starting {
            ProgressView()
        } else {
            switch model.state {
            case .signedOut: ConsoleSignInView()
            case .needsCode: ConsoleCodeView()
            case .signedIn: ConsoleView()
            }
        }
    }
}

/// The Station menu: refresh, hold, resume and the overrides, with shortcuts. Hold is ⌘. so stopping is always one key away.
struct StationCommands: Commands {
    let model: ConsoleModel

    var body: some Commands {
        CommandMenu(model.words("macConsole.station")) {
            let k = model.keying
            Button(model.words("operatorConsole.hold")) { Task { await model.hold() } }
                .keyboardShortcut(".", modifiers: .command)
                .disabled(!(k?.canHold ?? false) || model.busy)
            Button(model.words("macConsole.refresh")) { Task { await model.load() } }
                .keyboardShortcut("r", modifiers: .command)
                .disabled(model.state != .signedIn)
            Divider()
            Button(model.words(model.demo != nil ? "macConsole.leaveDemo" : "macConsole.signOut")) { Task { await model.signOut() } }
                .disabled(model.state == .signedOut || (model.demo != nil && ConsoleModel.unconfigured))
        }
    }
}

/// The menu bar item: whether the station may transmit, problems, the queue, Hold and the console.
/// Resume and Send for stay in the console window, where they ask first.
struct MenuBarView: View {
    @Environment(ConsoleModel.self) private var model
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        let w = model.words
        if let c = model.console, let k = model.keying {
            Text(model.menuBarTitle)
            if !c.problems.isEmpty { Text(w("macConsole.problemCount", count: c.problems.count)) }
            Text(w("operatorConsole.queueCounts", ["queued": String(c.queue.queued), "sending": String(c.queue.sending)]))
            Divider()
            Button(w("operatorConsole.hold")) { Task { await model.hold() } }
                .keyboardShortcut(".", modifiers: .command)
                .disabled(!k.canHold || model.busy)
        } else if model.off {
            Text(w("operatorConsole.off"))
        }
        Button(w("macConsole.open")) {
            openWindow(id: "console")
            NSApp.activate()
        }
        Divider()
        Button(w("macConsole.refresh")) { Task { await model.load() } }.disabled(model.state != .signedIn)
        Button("Quit") { NSApp.terminate(nil) }.keyboardShortcut("q")
    }
}
