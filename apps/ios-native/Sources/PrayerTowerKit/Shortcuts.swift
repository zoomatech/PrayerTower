import Foundation

/// Siri Shortcuts ("Pray for…", "Open prayer list") and Spotlight search of the member's own
/// requests (App/Shortcuts.swift). Both sit behind one switch on this device, off by default, so
/// nothing about anyone's prayers reaches Siri or the search index until the member turns it on.
public enum Shortcuts {
    /// The switch, in this device's settings (Me → Siri and Spotlight).
    public static let defaultsKey = "PTSiriAndSpotlight"
    /// Spotlight's group for the member's own requests, cleared when the switch goes off.
    public static let spotlightDomain = "my-requests"

    public static func isOn(_ defaults: UserDefaults = .standard) -> Bool { defaults.bool(forKey: defaultsKey) }

    /// One request as Siri and Spotlight show it.
    public struct Item: Sendable, Equatable {
        public let postId: String
        public let title: String
        public let details: String
    }

    /// The member's own requests for Spotlight: never one marked sensitive or in crisis.
    public static func spotlightItems(_ cards: [Card]) -> [Item] {
        cards.filter { $0.isMine && !hidden($0) }.map(item)
    }

    /// Other members' requests Siri may offer to pray for: ones this member can mark "praying
    /// now", never their own and never one marked sensitive or in crisis.
    public static func prayable(_ cards: [Card]) -> [Item] {
        cards.filter { !$0.isMine && !hidden($0) && ($0.actions?.contains("praying_now") ?? true) }.map(item)
    }

    static func hidden(_ c: Card) -> Bool { c.isSensitive == true || c.crisis }

    static func item(_ c: Card) -> Item {
        let text = c.preview.isEmpty ? c.body : c.preview
        let line = text.split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
        let short = line.count > 60 ? String(line.prefix(59)).trimmingCharacters(in: .whitespaces) + "…" : line
        return Item(postId: c.id, title: c.isMine ? short : "\(c.author.displayName): \(short)", details: text)
    }

    /// Spotlight's identifier for a request, and back.
    public static func identifier(_ postId: String) -> String { "post:\(postId)" }
    public static func postId(fromIdentifier id: String) -> String? {
        id.hasPrefix("post:") && id.count > 5 ? String(id.dropFirst(5)) : nil
    }
}
