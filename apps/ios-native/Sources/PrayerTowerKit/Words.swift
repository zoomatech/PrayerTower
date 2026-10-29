import Foundation

/// The app's words, the same as the Expo app's (generated from apps/mobile/src/locales by
/// `npm run native-strings -w @prayer-tower/mobile`). Open Circle members get the neutral set,
/// which has no religious words; text the server sends goes through `server(_:)`.
public struct Words: Sendable {
    public let wording: Wording
    let table: [String: String]

    public init(_ wording: Wording) {
        self.wording = wording
        table = Words.load(wording)
    }

    /// The text for a key, with `%{name}` filled in. With `count`, `.one` or `.other` is chosen
    /// (as i18n-js does) and `%{count}` is filled. An unknown key shows the key, so it's noticed.
    public func callAsFunction(_ key: String, _ vars: [String: String] = [:], count: Int? = nil) -> String {
        var text = table[key]
        if let count {
            text = table["\(key).\(count == 1 ? "one" : "other")"] ?? text
        }
        var out = text ?? key
        var all = vars
        if let count { all["count"] = String(count) }
        for (k, v) in all { out = out.replacingOccurrences(of: "%{\(k)}", with: v) }
        return out
    }

    /// Server text with a hand-written Open Circle version (post types, tier names), or as it is.
    public func server(_ text: String) -> String {
        wording == .neutral ? (table["literal:\(text)"] ?? text) : text
    }

    private static let cache = Cache()

    private static func load(_ wording: Wording) -> [String: String] {
        cache.get(wording) {
            let name = wording == .neutral ? "strings-neutral" : "strings-faith"
            guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Resources"),
                  let data = try? Data(contentsOf: url),
                  let table = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
            return table
        }
    }

    private final class Cache: @unchecked Sendable {
        private let lock = NSLock()
        private var tables: [Wording: [String: String]] = [:]
        func get(_ w: Wording, _ make: () -> [String: String]) -> [String: String] {
            lock.withLock {
                if let t = tables[w] { return t }
                let t = make()
                tables[w] = t
                return t
            }
        }
    }
}
