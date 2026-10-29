import Foundation

// Radio prayers for members, as the Expo app's post screen, My signal queue and Scheduled
// screens (docs/STATION_OPERATOR_GUIDE.md): send a request on the air with Priestly tokens or
// amplified, keep it on the air, schedule a send, see where it was heard and follow one's own
// radio prayers. Each part follows its admin switch and the community's radio switch.

/// What `POST /posts/:id/radio` answers.
public struct RadioPrayer: Codable, Sendable, Equatable {
    public let id: String
    public let status: String
    public let repeats: Int
}

/// One transmission of a request, and the receivers that really decoded it ("Where it was heard").
public struct RadioTrailEntry: Codable, Sendable, Equatable, Identifiable {
    public struct Node: Codable, Sendable, Equatable {
        public let name: String
        public let snrDb: Double
        public let at: String
    }
    public let sentAt: String
    public let callSign: String?
    public let amplified: Bool
    public let nodes: [Node]
    /// Phones and listening pages are only counted, never named.
    public let phones: Int
    public var id: String { sentAt }
}

/// One of my radio prayers (My signal queue).
public struct SignalEntry: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let postId: String
    public let excerpt: String
    /// waiting | sending | sent | not_sent
    public let status: String
    /// prayer | thanksgiving | ceaseless | auto
    public let kind: String
    public let amplified: Bool
    public let queuedAt: String
    public let sentAt: String?
    public let callSign: String?
    public let preset: String?
    public let heardCount: Int
    /// The same code a listener sees on the Listen screen once it went out.
    public let signalCode: String?

    /// The code spaced out, so VoiceOver reads it letter by letter.
    public var spokenCode: String? { signalCode.map { $0.map(String.init).joined(separator: " ") } }
}

/// A send set for a later time (`/me/scheduled-spends`): tokens, or the request by radio.
public struct ScheduledSpend: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let postId: String
    public let amount: Int
    public let nextRunAt: String
    public let repeatWeeks: Int
    public let runs: Int
    /// reach (tokens) | radio | amplify; older servers leave it out (reach).
    public let action: String?
    /// active | done | cancelled | failed
    public let status: String
    public let error: String?
    public let excerpt: String

    enum CodingKeys: String, CodingKey {
        case id, amount, runs, action, status, error, excerpt
        case postId = "post_id"
        case nextRunAt = "next_run_at"
        case repeatWeeks = "repeat_weeks"
    }

    public var isRadio: Bool { action == "radio" || action == "amplify" }
}

public struct NewScheduledSpend: Encodable, Sendable, Equatable {
    public let amount: Int
    public let runAt: String
    public let repeatWeeks: Int
    public let action: String
}

/// Which radio parts a post shows, from the switches, the post and the member's Priestly tokens.
public struct RadioOffer: Sendable, Equatable {
    public struct Amplify: Sendable, Equatable {
        public let repeats: Int
        public let cost: Int
    }
    /// "Send on the air" with its cost in Priestly tokens, or nil when it can't be sent now.
    public var sendCost: Int?
    /// "Amplify", or nil.
    public var amplify: Amplify?
    public var schedule = false
    public var scheduleCanAmplify = false
    public var keepOnAir = false
    public var trail = false
}

public enum Radio {
    /// Preset times for a scheduled send, as lib/schedule.ts: (key, weekday 1 = Sunday, hour).
    public static let whenOptions: [(key: String, weekday: Int, hour: Int)] = [("fri", 6, 19), ("sat", 7, 9), ("sun", 1, 9)]
    public static let repeatOptions = [1, 4, 12]

    /// As the Expo post screen. `radioOn` is the community's radio switch; a lament goes on the
    /// air only when its author allowed it; discussion posts are never sent.
    public static func offer(card: Card, features: Features, radioOn: Bool, tokens: TokenSummary?) -> RadioOffer {
        var o = RadioOffer()
        o.trail = features["heardTrail"]
        let prayable = !Compose.discussionTypes.contains(card.postType)
        let lamentHeld = features["lament"] && card.lament == true && card.lamentRadio != true
        guard prayable, radioOn, !lamentHeld else { return o }
        o.schedule = features["scheduledRadio"]
        o.keepOnAir = card.isMine && features["keepOnAir"] && card.postType == "prayer_request" && card.state != "answered" && card.isSensitive != true
        guard let p = tokens?.priestly else { return o }
        let cost = p.radioPrayerCost ?? 0
        if p.balance >= cost { o.sendCost = cost }
        if let repeats = p.amplifyRepeats, repeats > 0 {
            o.scheduleCanAmplify = true
            if p.balance >= (p.amplifyCost ?? 0) { o.amplify = .init(repeats: repeats, cost: p.amplifyCost ?? 0) }
        }
        return o
    }

    /// The next given weekday (1 = Sunday) at hour:00, at least a minute away, in local time.
    public static func nextWeekday(_ weekday: Int, hour: Int, from now: Date = .now, calendar: Calendar = .current) -> Date {
        var c = calendar.dateComponents([.year, .month, .day], from: now)
        c.hour = hour
        var d = calendar.date(from: c)!
        let ahead = (weekday - calendar.component(.weekday, from: d) + 7) % 7
        d = calendar.date(byAdding: .day, value: ahead, to: d)!
        if d.timeIntervalSince(now) <= 60 { d = calendar.date(byAdding: .day, value: 7, to: d)! }
        return d
    }

    /// "2026-11-06 19:30" as local time; nil unless it's a valid time in the future.
    public static func parseLocal(_ text: String, now: Date = .now, calendar: Calendar = .current) -> Date? {
        let t = text.trimmingCharacters(in: .whitespaces)
        guard let m = t.wholeMatch(of: /(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/) else { return nil }
        let c = DateComponents(year: Int(m.1), month: Int(m.2), day: Int(m.3), hour: Int(m.4), minute: Int(m.5))
        guard c.isValidDate(in: calendar), let d = calendar.date(from: c), d > now else { return nil }
        return d
    }

    /// ISO 8601 for the API, as JavaScript's toISOString.
    public static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}

private struct RadioPrayerWrapper: Decodable { let radioPrayer: RadioPrayer }
private struct RadioSend: Encodable { let idempotencyKey: String; let amplify: Bool }
private struct Trail: Decodable { let trail: [RadioTrailEntry] }
private struct Signals: Decodable { let signals: [SignalEntry] }
private struct Schedules: Decodable { let schedules: [ScheduledSpend] }
private struct OneSchedule: Decodable { let schedule: ScheduledSpend }
private struct KeepOnAirState: Decodable { let keepOnAir: Bool }

extension APIClient {
    /// Spends Priestly tokens (when radio prayers cost any) to send the request on the air.
    public func sendRadioPrayer(postId: String, amplify: Bool = false) async throws -> RadioPrayer {
        try await (post("/posts/\(postId)/radio", body: RadioSend(idempotencyKey: "radio-\(postId)-\(UUID().uuidString)", amplify: amplify)) as RadioPrayerWrapper).radioPrayer
    }
    /// Empty when nothing was sent yet; a 404 while the switch is off.
    public func radioTrail(postId: String) async throws -> [RadioTrailEntry] { try await (get("/posts/\(postId)/radio-trail") as Trail).trail }
    /// A 404 while My signal queue is off.
    public func signalQueue() async throws -> [SignalEntry] { try await (get("/me/signal-queue") as Signals).signals }
    public func setKeepOnAir(postId: String, on: Bool) async throws -> Bool {
        try await (send(body(request("PUT", "/posts/\(postId)/keep-on-air"), ["on": on])) as KeepOnAirState).keepOnAir
    }
    public func scheduleSpend(postId: String, _ s: NewScheduledSpend) async throws -> ScheduledSpend {
        try await (post("/posts/\(postId)/scheduled-spends", body: s) as OneSchedule).schedule
    }
    public func scheduledSpends() async throws -> [ScheduledSpend] { try await (get("/me/scheduled-spends") as Schedules).schedules }
    public func cancelScheduledSpend(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/scheduled-spends/\(id)")) }
}
