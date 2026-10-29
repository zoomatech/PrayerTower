import AppIntents
import CoreSpotlight
import PrayerTowerKit
import PrayerTowerSession
import SwiftUI

// Siri Shortcuts and Spotlight (PrayerTowerKit/Shortcuts.swift). Everything here does nothing
// until the member turns on Me → Siri and Spotlight on this device.

/// A request Siri can offer to pray for.
struct PrayerRequestEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Prayer request")
    static let defaultQuery = PrayerRequestQuery()
    let id: String
    let title: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)") }
}

struct PrayerRequestQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [PrayerRequestEntity] {
        try await Self.prayable().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [PrayerRequestEntity] { try await Self.prayable() }

    /// The newest requests in the member's feed that they can mark "praying now".
    @MainActor static func prayable() async throws -> [PrayerRequestEntity] {
        guard Shortcuts.isOn(), await AppModel.shared.signedInForShortcut() else { return [] }
        let page = try await AppModel.shared.store.api.cachedFeed().value
        return Shortcuts.prayable(page.posts).map { PrayerRequestEntity(id: $0.postId, title: $0.title) }
    }
}

enum ShortcutError: Error, CustomLocalizedStringResourceConvertible {
    case off, signedOut
    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .off: "Turn on Siri and Spotlight in the app first: Me, then Siri and Spotlight."
        case .signedOut: "Sign in to the app first."
        }
    }
}

/// "Pray for…": marks the member praying now for a request, as the 🙏 icon in the feed does.
struct PrayForIntent: AppIntent {
    static let title: LocalizedStringResource = "Pray for…"
    static let description = IntentDescription("Tell the person you are praying for them right now.")

    @Parameter(title: "Request", requestValueDialog: "Who would you like to pray for?")
    var request: PrayerRequestEntity

    @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
        guard Shortcuts.isOn() else { throw ShortcutError.off }
        guard await AppModel.shared.signedInForShortcut() else { throw ShortcutError.signedOut }
        _ = try await AppModel.shared.store.api.prayingNowOrQueue(postId: request.id)
        return .result(dialog: "Done. They'll see you're praying now.")
    }
}

/// "Open prayer list": the member's prayer list, or their promises when the list is switched off.
struct OpenPrayerListIntent: AppIntent {
    static let title: LocalizedStringResource = "Open prayer list"
    static let description = IntentDescription("Open the people and requests you're praying for.")
    static let openAppWhenRun = true

    @MainActor func perform() async throws -> some IntentResult {
        guard Shortcuts.isOn() else { throw ShortcutError.off }
        let model = AppModel.shared
        if await model.signedInForShortcut(), model.me == nil { await model.loadSettings() }
        if model.features["prayerList"] { model.openRoute = .prayerList } else { model.openTab = 1 }
        return .result()
    }
}

struct PrayerTowerShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: PrayForIntent(),
            phrases: ["Pray for someone in \(.applicationName)", "Pray for a request in \(.applicationName)", "Hold someone in my thoughts with \(.applicationName)"],
            shortTitle: "Pray for…",
            systemImageName: "hands.sparkles"
        )
        AppShortcut(
            intent: OpenPrayerListIntent(),
            phrases: ["Open prayer list in \(.applicationName)", "Open my prayer list in \(.applicationName)", "Show my \(.applicationName) list"],
            shortTitle: "Open prayer list",
            systemImageName: "list.bullet.rectangle"
        )
    }
}

extension AppModel {
    /// Siri may run a shortcut before the app has opened: read the saved sign-in first.
    func signedInForShortcut() async -> Bool {
        if starting { await start() }
        return state == .signedIn
    }
}

/// The member's own requests in Spotlight, on this device only.
enum SpotlightIndex {
    static func update(_ cards: [Card]) {
        guard Shortcuts.isOn(), !SampleServer.isOn() else { return }
        let items = Shortcuts.spotlightItems(cards).map { item in
            let attributes = CSSearchableItemAttributeSet(contentType: .text)
            attributes.title = item.title
            attributes.contentDescription = item.details
            return CSSearchableItem(uniqueIdentifier: Shortcuts.identifier(item.postId), domainIdentifier: Shortcuts.spotlightDomain, attributeSet: attributes)
        }
        guard !items.isEmpty else { return }
        CSSearchableIndex.default().indexSearchableItems(items) { _ in }
    }

    /// Switched off: everything this app put in Spotlight is removed.
    static func clear() {
        CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [Shortcuts.spotlightDomain]) { _ in }
    }
}

/// Me → Siri and Spotlight: the one switch for both, off by default.
struct ShortcutsSection: View {
    @AppStorage(Shortcuts.defaultsKey) private var on = false

    var body: some View {
        Section {
            Toggle(isOn: $on) {
                Text("Siri and Spotlight")
                Text("Say \"Pray for someone\" or \"Open prayer list\", and find your own requests in Spotlight search. Off keeps your prayers out of Siri and search.")
            }
            .onChange(of: on) { _, now in if !now { SpotlightIndex.clear() } }
        }
    }
}
