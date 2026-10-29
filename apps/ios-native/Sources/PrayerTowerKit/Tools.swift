import Foundation

// Prayer tools beyond the feed: my prayer list, the prayer minute, the email prayer chain,
// Prayer Cast, Power Prayer, token pools, giving and Why gifts, and the staff Macro Needs.

// MARK: - Prayer list

public struct PrayerListItem: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let note: String
    /// off | daily | weekly
    public let remind: String
    public let prayedCount: Int
}

/// People and topics a member keeps to pray for. Private, and earns nothing.
public struct PrayerList: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let items: [PrayerListItem]?

    public static let reminders = ["off", "daily", "weekly"]
}

public struct NewPrayerListItem: Encodable, Sendable, Equatable {
    public let name: String
    public let note: String
    public let remind: String
    public let hour: Int
    /// Minutes behind UTC, as JavaScript's getTimezoneOffset.
    public let tzOffsetMinutes: Int

    public init(name: String, note: String, remind: String, hour: String, timeZone: TimeZone = .current, at date: Date = .now) {
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        self.remind = remind
        self.hour = min(23, max(0, Int(hour.trimmingCharacters(in: .whitespaces)) ?? 0))
        tzOffsetMinutes = -timeZone.secondsFromGMT(for: date) / 60
    }
}

// MARK: - Prayer minute

public struct PrayerMinute: Codable, Sendable, Equatable {
    public let enabled: Bool
    /// "07:00", or nil when none is chosen.
    public let time: String?
    public let timeZone: String?
    public let others: Int?

    public static func valid(_ time: String) -> Bool {
        time.trimmingCharacters(in: .whitespaces).range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil
    }
}

public struct PrayerMinuteNow: Codable, Sendable, Equatable {
    public let enabled: Bool
    /// People with the screen open in the last two minutes.
    public let together: Int?
    public let requests: [Card]?
}

// MARK: - Prayer chain, Prayer Cast, Power Prayer

public struct ChainPerson: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let email: String?
    public let phone: String?
    /// pending | confirmed | left
    public let status: String
}

public struct PrayerCast: Codable, Sendable, Equatable {
    public struct Totals: Codable, Sendable, Equatable { public let prayers: Int; public let sends: Int }
    public struct Sent: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let post_id: String
        public let text: String
        public let repeats: Int
        public let transmitter: String?
        public let call_sign: String?
        public let transmitted_at: String
    }
    public let totals: Totals
    public let cast: [Sent]
}

public struct PowerPrayerStatus: Codable, Sendable, Equatable {
    public let reach: Int
    public let freeLeft: Int
    public let cost: Int
    /// Set when the member can't use it yet (for example, new members).
    public let blockedReason: String?
}

public struct PowerPrayerSent: Codable, Sendable, Equatable {
    public struct Sent: Codable, Sendable, Equatable { public let reached: Int }
    public let powerPrayer: Sent
    public let next: PowerPrayerStatus
}

// MARK: - Pools, giving, Why gifts

public struct PoolLedger: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let given: Int?
    public let givers: Int?
    public let matched: Int?
    public let reachedRequests: Int?
    public let reachedLast30Days: Int?
    public let requestsHelped: Int?
    public let returned: Int?
}

public struct NewPool: Encodable, Sendable, Equatable {
    public let name: String
    public let purpose: String
    public let realm: String?
    public let drawAmount: Int
    public let showDonor: Bool
    public let amount: Int
    public let matchRatio: Int?
    public let matchCap: Int?
    public let matchMode: String?

    /// nil until there is a name, tokens to put in, a draw amount and (with a pledge) a cap.
    public init?(name: String, purpose: String, realm: String?, amount: String, draw: String, showDonor: Bool, matching: Bool, manyHands: Bool, ratio: String, cap: String) {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty, let a = Staff.whole(amount), a > 0, let d = Staff.whole(draw), d > 0 else { return nil }
        let r = Staff.whole(ratio) ?? 0
        let pledging = matching && (manyHands || r > 0)
        if pledging {
            guard let c = Staff.whole(cap), c > 0 else { return nil }
            matchCap = c
            matchMode = manyHands ? "quadratic" : nil
            matchRatio = manyHands ? nil : r
        } else {
            matchCap = nil
            matchMode = nil
            matchRatio = nil
        }
        self.name = n
        self.purpose = purpose.trimmingCharacters(in: .whitespacesAndNewlines)
        self.realm = realm
        drawAmount = d
        self.showDonor = showDonor
        self.amount = a
    }

    enum CodingKeys: String, CodingKey { case name, purpose, realm, drawAmount, showDonor, amount, matchRatio, matchCap, matchMode }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        try c.encode(purpose, forKey: .purpose)
        try c.encode(realm, forKey: .realm)
        try c.encode(drawAmount, forKey: .drawAmount)
        try c.encode(showDonor, forKey: .showDonor)
        try c.encode(amount, forKey: .amount)
        try c.encodeIfPresent(matchRatio, forKey: .matchRatio)
        try c.encodeIfPresent(matchCap, forKey: .matchCap)
        try c.encodeIfPresent(matchMode, forKey: .matchMode)
    }
}

public struct PoolFunded: Codable, Sendable, Equatable {
    public let matched: Int
    public let poolBalance: Int
    public let balance: Int
}

public struct GivingInfo: Codable, Sendable, Equatable {
    public let enabled: Bool
    /// none | stripe | zeffy
    public let provider: String
    public let url: String?
    public let paypalUrl: String?
    public let minCents: Int
    public let maxCents: Int
}

public struct MyGift: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let amount_cents: Int
    /// pending | paid | refunded | failed
    public let status: String
    public let created_at: String
}

public enum Giving {
    public static let amounts = [500, 1000, 2500, 5000]
    public static func dollars(_ cents: Int) -> String {
        cents % 100 == 0 ? "$\(cents / 100)" : String(format: "$%.2f", Double(cents) / 100)
    }
    /// "$12.50", "12" or "1,000" → cents; nil for anything else.
    public static func cents(_ typed: String) -> Int? {
        let t = typed.replacingOccurrences(of: "[$,\\s]", with: "", options: .regularExpression)
        guard !t.isEmpty, let d = Double(t), d.isFinite, d > 0 else { return nil }
        return Int((d * 100).rounded())
    }

    /// everyone | member | pool, as the server's GiftTarget.
    public enum Target: Hashable, Sendable, Encodable {
        case everyone, member(String), pool(String)
        enum CodingKeys: String, CodingKey { case kind, userId, poolId }
        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case .everyone: try c.encode("everyone", forKey: .kind)
            case .member(let id): try c.encode("member", forKey: .kind); try c.encode(id, forKey: .userId)
            case .pool(let id): try c.encode("pool", forKey: .kind); try c.encode(id, forKey: .poolId)
            }
        }
    }
}

public struct WhyGifts: Codable, Sendable, Equatable {
    public struct Point: Codable, Sendable, Equatable { public let heading: String; public let body: String }
    public let title: String
    public let intro: String
    public let points: [Point]
    /// The public fund report's path on the API host, while it is published.
    public let fundPath: String?
}

// MARK: - Macro Needs (staff)

public struct MacroNeed: Codable, Sendable, Equatable, Identifiable {
    public struct HelpOption: Codable, Sendable, Equatable { public let label: String; public let url: String }
    public let id: String
    public let title: String
    public let helpOptions: [HelpOption]
    public let prayers: Int
    public let tokens: Int
    public let helpers: Int
}

// MARK: - API

private struct Chain: Decodable { let people: [ChainPerson] }
private struct MinuteWrap: Decodable { let minute: PrayerMinute }
private struct NowWrap: Decodable { let now: PrayerMinuteNow }
private struct Pools: Decodable { let pools: [TokenPool] }
private struct Gifts: Decodable { let donations: [MyGift] }
private struct Checkout: Decodable { let url: String }
private struct Needs: Decodable { let needs: [MacroNeed] }
private struct Listen: Decodable { let enabled: Bool }
private struct NewMacroNeed: Encodable { let title: String; let body: String; let helpOptions: [MacroNeed.HelpOption] }
private struct GiveBody: Encodable { let amountCents: Int; let target: Giving.Target; let showDonor: Bool; let idempotencyKey: String }
private struct Fund: Encodable { let amount: Int; let idempotencyKey: String }
private let nothing = [String: String]()

extension APIClient {
    public func prayerList() async throws -> PrayerList { try await get("/me/prayer-list") }
    public func addToPrayerList(_ item: NewPrayerListItem) async throws -> PrayerList { try await post("/me/prayer-list", body: item) }
    public func removePrayerListItem(_ id: String) async throws -> PrayerList { try await send(request("DELETE", "/me/prayer-list/\(id)")) }
    public func prayedForListItem(_ id: String) async throws -> PrayerList { try await post("/me/prayer-list/\(id)/prayed", body: nothing) }

    public func prayerMinute() async throws -> PrayerMinute { try await (get("/me/prayer-minute") as MinuteWrap).minute }
    public func setPrayerMinute(_ time: String, timeZone: String = TimeZone.current.identifier) async throws -> PrayerMinute {
        try await (send(body(request("PUT", "/me/prayer-minute"), ["time": time.trimmingCharacters(in: .whitespaces), "timeZone": timeZone])) as MinuteWrap).minute
    }
    public func clearPrayerMinute() async throws -> Ignored { try await send(request("DELETE", "/me/prayer-minute")) }
    /// Says the screen is open, then reads who else is here.
    public func prayerMinuteNow() async throws -> PrayerMinuteNow {
        _ = try await post("/prayer-minute/join", body: nothing) as Ignored
        return try await (get("/prayer-minute/now") as NowWrap).now
    }

    public func prayerChain() async throws -> [ChainPerson] { try await (get("/me/prayer-chain") as Chain).people }
    public func addToPrayerChain(email: String) async throws -> Ignored { try await post("/me/prayer-chain", body: ["email": email.trimmingCharacters(in: .whitespaces)]) }
    public func addToPrayerChain(phone: String) async throws -> Ignored { try await post("/me/prayer-chain", body: ["phone": phone.trimmingCharacters(in: .whitespaces)]) }
    public func removeFromPrayerChain(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/me/prayer-chain/\(id)")) }

    public func prayerCast() async throws -> PrayerCast { try await get("/prayer-cast") }
    public func radioListenOpen() async throws -> Bool { try await (get("/radio/listen") as Listen).enabled }

    public func powerPrayerStatus() async throws -> PowerPrayerStatus { try await get("/me/power-prayer") }
    public func powerPrayer(_ postId: String) async throws -> PowerPrayerSent {
        try await post("/posts/\(postId)/power-prayer", body: ["idempotencyKey": "power-\(postId)-\(UUID().uuidString)"])
    }

    public func openTokenPools() async throws -> [TokenPool] { try await (get("/token-pools") as Pools).pools }
    public func myTokenPools() async throws -> [TokenPool] { try await (get("/me/token-pools") as Pools).pools }
    public func poolLedger() async throws -> PoolLedger { try await get("/token-pools/ledger") }
    public func createTokenPool(_ p: NewPool) async throws -> Ignored { try await post("/token-pools", body: p) }
    public func fundTokenPool(_ id: String, amount: Int) async throws -> PoolFunded {
        try await post("/token-pools/\(id)/fund", body: Fund(amount: amount, idempotencyKey: "fund-\(id)-\(UUID().uuidString)"))
    }
    public func closeTokenPool(_ id: String) async throws -> Ignored { try await post("/token-pools/\(id)/close", body: nothing) }

    public func givingInfo() async throws -> GivingInfo { try await get("/donations/info") }
    public func myGifts() async throws -> [MyGift] { try await (get("/me/donations") as Gifts).donations }
    /// The checkout page to open for a card gift.
    public func giveCheckout(cents: Int, to target: Giving.Target, showDonor: Bool) async throws -> URL? {
        URL(string: try await (post("/donations/checkout", body: GiveBody(amountCents: cents, target: target, showDonor: showDonor, idempotencyKey: "give-\(UUID().uuidString)")) as Checkout).url)
    }
    public func whyGifts(_ wording: Wording) async throws -> WhyGifts { try await get("/why-gifts", query: ["wording": wording == .neutral ? "neutral" : "faith"]) }

    public func macroNeeds() async throws -> [MacroNeed] { try await (get("/macro-needs") as Needs).needs }
    public func createMacroNeed(title: String, body: String, options: [(label: String, url: String)]) async throws -> Ignored {
        let help = options.compactMap { o -> MacroNeed.HelpOption? in
            let l = o.label.trimmingCharacters(in: .whitespaces), u = o.url.trimmingCharacters(in: .whitespaces)
            return l.isEmpty || u.isEmpty ? nil : MacroNeed.HelpOption(label: l, url: u)
        }
        return try await post("/macro-needs", body: NewMacroNeed(title: title.trimmingCharacters(in: .whitespacesAndNewlines), body: body.trimmingCharacters(in: .whitespacesAndNewlines), helpOptions: help))
    }
    public func endMacroNeed(_ id: String) async throws -> Ignored { try await post("/macro-needs/\(id)/end", body: nothing) }
}
