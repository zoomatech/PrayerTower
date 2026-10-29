import Foundation

// Me → "Your prayer life" (apps/mobile/src/app/(tabs)/profile.tsx): the member's own counts,
// shown only to them and only while they keep it on, with the gentle switches from Admin →
// Growth practices and Gentle reminders: gentle rhythm (days this month, which only adds),
// weeks of prayer instead of days in a row, welcome back, fresh starts and the weekly intention.

/// `GET /me/prayer-stats` (`PrayerStats` in packages/shared).
public struct PrayerStats: Codable, Sendable, Equatable {
    public struct Day: Codable, Sendable, Equatable { public let date: String; public let prayed: Bool }
    /// Weekly intention: how many days the member means to show up this week (1 to 6), or no aim.
    public struct Intention: Codable, Sendable, Equatable {
        public let days: Int?
        public let week: [Day]
        public let shown: Int
        public let met: Bool
    }

    public let enabled: Bool
    public let daysPrayed: Int
    public let peoplePrayedFor: Int
    public let currentStreak: Int
    /// The last seven days, oldest first.
    public let week: [Day]
    public let monthDays: Int
    public let welcomeBack: Bool
    /// "week" on a Monday, "month" on the 1st.
    public let freshStart: String?
    public let weeksPrayed: Int
    /// Weeks in a row (one rest week allowed); nil under 2, so a run is never shown as lost.
    public let weekRun: Int?
    /// Only while the weekly intention switch is on.
    public let intention: Intention?

    /// The third number and its name: weeks of prayer, days this month, or days in a row.
    public func third(_ f: Features, _ w: Words) -> (value: Int, label: String) {
        if f["gentleStreak"] { return (weeksPrayed, w("reminders.weeks")) }
        if f["gentleRhythm"] { return (monthDays, w("practices.rhythmMonth")) }
        return (currentStreak, w("stats.streak"))
    }

    /// What VoiceOver reads for the whole box.
    public func summary(_ f: Features, _ w: Words) -> String {
        let days = String(daysPrayed), people = String(peoplePrayedFor)
        if f["gentleStreak"] { return w("reminders.weeksSummary", ["days": days, "weeks": String(weeksPrayed), "people": people]) }
        if f["gentleRhythm"] { return w("practices.rhythmSummary", ["days": days, "month": String(monthDays), "people": people]) }
        return w("stats.summary", ["days": days, "people": people, "streak": String(currentStreak)])
    }

    /// Lines for gentle rhythm: welcome back after a week away (never what was missed), and fresh starts.
    public func gentleLines(_ f: Features, _ w: Words) -> [String] {
        guard f["gentleRhythm"] else { return [] }
        var out: [String] = []
        if welcomeBack { out.append(w("practices.welcomeBack")) }
        if let s = freshStart { out.append(w(s == "month" ? "practices.freshMonth" : "practices.freshWeek")) }
        return out
    }

    /// The small line under the box, ending with "Only you can see these."
    public func note(_ f: Features, _ w: Words) -> String {
        let first: String
        if f["gentleStreak"] { first = weekRun.map { w("reminders.weekRun", count: $0) } ?? w("reminders.weeksNote") }
        else if f["gentleRhythm"] { first = w("practices.rhythmNote") }
        else if currentStreak > 1 { first = w("stats.streakNote", count: currentStreak) }
        else { first = w("stats.gentle") }
        return first + " " + w("stats.private")
    }
}

extension PrayerStats.Intention {
    /// "Days you showed up this week: 2", or that the aim was met. Nothing while there is no aim;
    /// a week that falls short is never mentioned.
    public func line(_ w: Words) -> String? {
        guard days != nil else { return nil }
        return met ? w("intention.met") : w("intention.shown", count: shown)
    }
}

struct PrayerStatsWrapper: Codable { let stats: PrayerStats }
private struct IntentionBody: Encodable {
    let days: Int?
    let tz: String
    // Sends "days": null for no aim, rather than leaving it out.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(days, forKey: .days)
        try c.encode(tz, forKey: .tz)
    }
    enum CodingKeys: String, CodingKey { case days, tz }
}

extension APIClient {
    public func prayerStats(timeZone: String = TimeZone.current.identifier) async throws -> PrayerStats {
        try await (get("/me/prayer-stats", query: ["tz": timeZone]) as PrayerStatsWrapper).stats
    }

    /// 1 to 6 days a week, or nil for no aim.
    public func setWeeklyIntention(_ days: Int?, timeZone: String = TimeZone.current.identifier) async throws -> PrayerStats {
        try await (send(body(request("PUT", "/me/weekly-intention"), IntentionBody(days: days, tz: timeZone))) as PrayerStatsWrapper).stats
    }
}
