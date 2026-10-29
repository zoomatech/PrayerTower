import Foundation

// Sharing, as the Expo app's card share sheet, outside-share.tsx, guest-share.tsx and the
// comment Share button: a note to your own feed, asking people you follow to pray, and links
// people send outside the app. With "sharing by consent" on, the author picks who may share.

/// Who may share a post outside the app, chosen by its author: private | link | card.
public struct ShareState: Codable, Sendable, Equatable {
    public let mine: Bool
    public let level: String
    public let canShare: Bool
    public let cardAllowed: Bool
    /// True on a share card: the message may carry the post's words.
    public let words: Bool
    /// /post/<id> (members-only app link) or /card/<token> (public card, on the site host).
    public let path: String
}

/// A web link anyone can pray from without an account.
public struct GuestLink: Codable, Sendable, Equatable {
    public let token: String
    /// /pray/<token> (or /circle/<token> in Open Circle), on the site host.
    public let path: String
    public let guestPrayers: Int
}

public struct ChainSent: Codable, Sendable, Equatable {
    public let recipients: Int
    public let path: String
}

public enum ShareLinks {
    public static let levels = ["private", "link", "card"]

    /// A link people share outside the app: on the https site when there is one (it opens the app
    /// when installed), otherwise the app's own scheme.
    public static func url(_ path: String, query: [String: String] = [:], base: String?, scheme: String = "prayertower") -> String {
        let site = (base ?? "").trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
        var c = URLComponents()
        if !query.isEmpty { c.queryItems = query.keys.sorted().map { URLQueryItem(name: $0, value: query[$0]) } }
        let qs = c.percentEncodedQuery.map { "?\($0)" } ?? ""
        let p = path.hasPrefix("/") ? path : "/" + path
        return site.isEmpty ? "\(scheme)://\(p)\(qs)" : "\(site)\(p)\(qs)"
    }

    /// The site for shared links: PTLinkURL, else the API when it is https.
    public static func base(link: String?, api: URL) -> String? {
        if let link, !link.trimmingCharacters(in: .whitespaces).isEmpty { return link }
        return api.scheme == "https" ? api.absoluteString : nil
    }
}

private struct ShareWrap: Decodable { let share: ShareState? }
private struct GuestWrap: Decodable { let link: GuestLink? }
private struct Sent: Decodable { let sent: Int }
private struct AskBody: Encodable { let recipientIds: [String]; let note: String? }
private let nothing = [String: String]()

extension APIClient {
    public func shareState(postId: String) async throws -> ShareState? { try await (get("/posts/\(postId)/share") as ShareWrap).share }
    public func setShareLevel(postId: String, _ level: String) async throws -> ShareState? {
        try await (send(body(request("PUT", "/posts/\(postId)/share"), ["level": level])) as ShareWrap).share
    }
    public func guestLink(postId: String) async throws -> GuestLink? { try await (get("/posts/\(postId)/guest-link") as GuestWrap).link }
    public func createGuestLink(postId: String) async throws -> GuestLink? { try await (post("/posts/\(postId)/guest-link", body: nothing) as GuestWrap).link }
    public func revokeGuestLink(postId: String) async throws -> Ignored { try await send(request("DELETE", "/posts/\(postId)/guest-link")) }
    public func sendToPrayerChain(postId: String) async throws -> ChainSent { try await post("/posts/\(postId)/prayer-chain", body: nothing) }
    /// Asks people you follow to pray; returns how many were sent (0: already asked).
    public func askToPray(postId: String, people: [String], note: String) async throws -> Int {
        let n = note.trimmingCharacters(in: .whitespaces)
        return try await (post("/posts/\(postId)/ask", body: AskBody(recipientIds: people, note: n.isEmpty ? nil : n)) as Sent).sent
    }
}
