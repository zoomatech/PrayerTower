import Foundation

#if canImport(ActivityKit) && os(iOS)
import ActivityKit
#endif

// The "Pray now" home-screen widget and the "Praying for you now" Live Activity
// (docs/GROWTH.md), as the Expo app's src/widgets. The app writes the widget's content to the
// shared app group; the widget extension only reads it. The Live Activity is updated by the
// server through Apple push (modules/live-activity), with the same content-state the Expo
// build uses, so the server needs no change.

/// What the Pray now widget shows (`PrayNowProps` in the Expo app).
public struct PrayNowSnapshot: Codable, Sendable, Equatable {
    public let heading: String
    public let text: String
    /// "3 praying", or "Be the first to pray".
    public let detail: String
    /// Opened on tap.
    public let url: String
    /// "💛 Ana prayed for you today", or empty (Admin → Growth).
    public var prayedFor: String

    public init(heading: String, text: String, detail: String, url: String, prayedFor: String = "") {
        self.heading = heading
        self.text = text
        self.detail = detail
        self.url = url
        self.prayedFor = prayedFor
    }

    /// Shown until the app first sends content.
    public static func placeholder(_ wording: Wording) -> PrayNowSnapshot {
        let w = Words(wording)
        return PrayNowSnapshot(heading: w("widget.heading"), text: w("widget.empty"), detail: "", url: "\(Edition.current.scheme):///")
    }
}

public enum PrayNow {
    /// The app group both the app and the widget extension use (each edition has its own).
    public static let appGroup = Edition.current == .openCircle ? "group.com.zoomatech.opencircle.native" : "group.com.zoomatech.prayertower.native"
    static let key = "pray-now:v1"

    /// The request the widget shows: the feed's pinned request, else the first other request.
    /// Never the member's own, and never one marked sensitive or about a crisis, since a home
    /// screen is seen by others.
    public static func nextRequest(_ page: FeedPage) -> Card? {
        let ok = { (c: Card) in
            c.postType == "prayer_request" && !c.isMine && c.isSensitive != true && !c.crisis && c.state != "answered"
        }
        return page.posts.first { $0.id == page.pinnedId && ok($0) } ?? page.posts.first(where: ok)
    }

    public static func snapshot(_ card: Card?, words w: Words) -> PrayNowSnapshot {
        guard let card else { return PrayNowSnapshot(heading: w("widget.heading"), text: w("widget.empty"), detail: "", url: "\(Edition.current.scheme):///") }
        return PrayNowSnapshot(
            heading: w("widget.heading"),
            text: card.preview.isEmpty ? card.body : card.preview,
            detail: card.counts.prayers > 0 ? w("card.praying", count: card.counts.prayers) : w("card.firstToPray"),
            url: "\(Edition.current.scheme):///post/\(card.id)"
        )
    }

    /// "💛 Ana and 2 others prayed for you today": first names only, never anyone who prayed anonymously.
    public static func prayedForLine(_ p: PrayedFor, words w: Words) -> String {
        guard p.enabled, let people = p.people, people > 0 else { return "" }
        let names = p.names ?? []
        guard let first = names.first else { return w("growth.widgetPrayedForCount", count: people) }
        if people == 1 { return w("growth.widgetPrayedForOne", ["name": first]) }
        if people == 2, names.count > 1 { return w("growth.widgetPrayedForTwo", ["name": first, "other": names[1]]) }
        return w("growth.widgetPrayedForMore", ["name": first], count: people - 1)
    }

    public static func save(_ s: PrayNowSnapshot, to defaults: UserDefaults? = UserDefaults(suiteName: appGroup)) {
        guard let data = try? JSONEncoder().encode(s) else { return }
        defaults?.set(data, forKey: key)
    }

    public static func load(from defaults: UserDefaults? = UserDefaults(suiteName: appGroup)) -> PrayNowSnapshot? {
        defaults?.data(forKey: key).flatMap { try? JSONDecoder().decode(PrayNowSnapshot.self, from: $0) }
    }
}

/// Who prayed for the member today (`/me/prayed-for`).
public struct PrayedFor: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let names: [String]?
    public let people: Int?
    public init(enabled: Bool, names: [String]? = nil, people: Int? = nil) {
        self.enabled = enabled
        self.names = names
        self.people = people
    }
}

/// The Live Activity's words: "Praying for you", "Ana and 2 others prayed for you", and a count.
public struct PrayedForProps: Codable, Sendable, Hashable {
    public let heading: String
    public let line: String
    public let count: Int
    public init(heading: String, line: String, count: Int) {
        self.heading = heading
        self.line = line
        self.count = count
    }
    public static func waiting(_ w: Words) -> PrayedForProps { .init(heading: w("growth.liveHeading"), line: w("growth.liveWaiting"), count: 0) }
}

/// The Live Activity's content-state, as the server sends it: `{ name: "PrayedFor", props: "<json>" }`.
public struct PrayedForState: Codable, Sendable, Hashable {
    public let name: String
    public let props: String

    public init(_ p: PrayedForProps) {
        name = "PrayedFor"
        props = String(decoding: (try? JSONEncoder().encode(p)) ?? Data("{}".utf8), as: UTF8.self)
    }

    /// The words to show; nil when the server sent something this build can't read.
    public var decoded: PrayedForProps? { try? JSONDecoder().decode(PrayedForProps.self, from: Data(props.utf8)) }
}

#if canImport(ActivityKit) && os(iOS)
/// The member's own open request on their Lock Screen and Dynamic Island, for up to 8 hours.
public struct PrayedForAttributes: ActivityAttributes {
    public typealias ContentState = PrayedForState
    public let postId: String
    public init(postId: String) { self.postId = postId }
}
#endif

private struct PrayedForWrap: Decodable { let prayedFor: PrayedFor }
private struct LiveStarted: Decodable { let props: PrayedForProps }

extension APIClient {
    public func prayedFor() async throws -> PrayedFor { try await (get("/me/prayed-for") as PrayedForWrap).prayedFor }
    /// Tells the server the activity's push token; it answers with the words to show now.
    public func startLiveActivity(postId: String, pushToken: String, appId: String) async throws -> PrayedForProps {
        try await (post("/me/live-activities", body: ["postId": postId, "pushToken": pushToken, "appId": appId]) as LiveStarted).props
    }
    public func endLiveActivity(pushToken: String) async throws -> Ignored { try await post("/me/live-activities/end", body: ["pushToken": pushToken]) }
}

extension PrayNow {
    /// The request a widget or Live Activity link opens: `prayertower:///post/<id>`.
    public static func postId(from url: URL) -> String? {
        guard Edition.schemes.contains(url.scheme ?? "") else { return nil }
        let parts = (url.host().map { [$0] } ?? []) + url.pathComponents.filter { $0 != "/" }
        guard parts.count == 2, parts[0] == "post", !parts[1].isEmpty else { return nil }
        return parts[1]
    }
}
