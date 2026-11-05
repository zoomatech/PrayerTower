import Foundation

// The research desk beside Search the texts (Steve, 5 November 2026: "the infopanels for the build news and scholar
// social feeds should appear to the right of the bible search"), from the Ehrmanator Research Desk: news panels with a
// live news search, scholar feeds with a search link for each account, and Dan McClellan's Data Over Dogma topical
// index (Resources/research-desk.json). Links only: nothing is fetched, the member's browser opens each search.

public struct ResearchDesk: Decodable, Sendable {
    public struct Link: Decodable, Sendable, Equatable {
        public let label: String
        public let url: String
    }

    public struct NewsItem: Decodable, Sendable, Identifiable {
        public let topic: String
        public let side: String
        public let date: String
        public let title: String
        public let body: String
        public let points: [String]
        public let sources: [Link]
        public var id: String { title }
    }

    public struct Filter: Decodable, Sendable, Identifiable {
        public let id: String
        public let title: String
    }

    public struct News: Decodable, Sendable {
        public let researched: String
        public let items: [NewsItem]
        public let filters: [Filter]
        /// Each side's label: "Critical", "AiG / Ark side", "Scholarly".
        public let sides: [String: String]
        public let presets: [String]

        /// The items under a filter ("all" for every one).
        public func items(_ filter: String) -> [NewsItem] { filter == "all" ? items : items.filter { $0.topic == filter } }
    }

    public struct Account: Decodable, Sendable, Identifiable {
        public let platform: String
        public let handle: String
        public let url: String
        public var id: String { platform + handle }
    }

    /// A search of one account: `{q}` in the address is the words typed after the prefix, percent-encoded; "#mcclellan"
    /// searches the episode index here instead.
    public struct Search: Decodable, Sendable, Identifiable {
        public let label: String
        public let url: String
        public let prefix: String
        public var id: String { label }
        public var searchesIndex: Bool { url == "#mcclellan" }

        public func address(_ words: String) -> URL? {
            guard !searchesIndex else { return nil }
            return URL(string: url.replacingOccurrences(of: "{q}", with: ResearchDesk.encode(prefix + words)))
        }
    }

    public struct Scholar: Decodable, Sendable, Identifiable {
        public let name: String
        public let role: String
        public let note: String
        public let accounts: [Account]
        public let search: [Search]
        public var id: String { name }
    }

    public struct Outlet: Decodable, Sendable, Identifiable {
        public let name: String
        public let url: String
        public let about: String
        public var id: String { name }
    }

    public struct Episode: Decodable, Sendable, Identifiable {
        public let number: Int
        public let date: String
        public let title: String
        public let topics: [String]
        public var id: Int { number }

        /// The episode found on YouTube.
        public var youTube: URL? {
            URL(string: "https://www.youtube.com/results?search_query=" + ResearchDesk.encode("Data Over Dogma " + title))
        }
        public var applePodcasts: URL? {
            URL(string: "https://podcasts.apple.com/us/search?term=" + ResearchDesk.encode("Data Over Dogma " + title))
        }
    }

    public struct Index: Decodable, Sendable {
        public let title: String
        /// Topic id to its name: "creation" is "Creation, Flood & Origins".
        public let topics: [String: String]
        public let episodes: [Episode]

        /// The topics by name.
        public var topicOrder: [String] { topics.keys.sorted { topics[$0]!.localizedCompare(topics[$1]!) == .orderedAscending } }

        /// The episodes that match what was typed under a topic, as the desk matches them: an episode number ("183",
        /// "#183"), or every word found in the title or the topics' names; apostrophes alike.
        public func episodes(matching typed: String, topic: String? = nil) -> [Episode] {
            let q = typed.trimmingCharacters(in: .whitespaces).lowercased()
            let number = q.hasPrefix("#") ? Int(q.dropFirst()) : Int(q)
            let words = q.replacingOccurrences(of: "\u{2019}", with: "'").split(separator: " ").map(String.init)
            return episodes.filter { e in
                guard topic == nil || e.topics.contains(topic!) else { return false }
                if q.isEmpty { return true }
                if let number { return e.number == number }
                let hay = (e.title + " " + e.topics.compactMap { topics[$0] }.joined(separator: " ")).lowercased()
                    .replacingOccurrences(of: "\u{2019}", with: "'")
                return words.allSatisfy { hay.contains($0) }
            }
        }
    }

    public let news: News
    public let scholars: [Scholar]
    public let outlets: [Outlet]
    public let index: Index

    public static let bundled: ResearchDesk? = {
        guard let url = Bundle.module.url(forResource: "research-desk", withExtension: "json", subdirectory: "Resources"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(ResearchDesk.self, from: data)
    }()

    /// Google News for the words, over a time ("7d", "30d", "1y", or "" for any time), as the desk's live news search.
    public static func newsSearch(_ words: String, when: String) -> URL? {
        URL(string: "https://news.google.com/search?q=" + encode(words + (when.isEmpty ? "" : " when:" + when)) + "&hl=en-US&gl=US&ceid=US:en")
    }

    public static func bingNews(_ words: String) -> URL? {
        URL(string: "https://www.bing.com/news/search?q=" + encode(words))
    }

    /// Percent-encoded as JavaScript's encodeURIComponent does, so every link is the desk's own.
    static func encode(_ s: String) -> String {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.!~*'()")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }
}
