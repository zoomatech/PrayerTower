import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// What the API answers on an error: `{ "error": "two_step_required", "message": "…" }`.
public struct APIError: Error, Sendable, Equatable, LocalizedError {
    public let status: Int
    public let code: String
    public let message: String

    public var errorDescription: String? { message }
    /// Two-step sign-in is on and this session hasn't entered the code yet.
    public var needsCode: Bool { status == 401 && code == "two_step_required" }
    /// The sign-in is gone or expired: back to the sign-in screen.
    public var signedOut: Bool { status == 401 && !needsCode }
}

/// Any answer whose body the app doesn't read.
public struct Ignored: Decodable, Sendable {}

private struct MeaningTree: Decodable { let emoji: [MeaningEmoji] }
private struct Leaves: Decodable { let leaves: [MeaningLeaf] }
private struct CircleUpdateBody: Encodable { let text: String; let answered: Bool }
private struct NewFreshDay: Encodable { let month: Int; let day: Int; let label: String }

private struct ErrorBody: Decodable {
    let error: String?
    let message: String?
}

/// Supplies the current Supabase access token (from supabase-swift in the app, a fixed one in tests).
public typealias TokenProvider = @Sendable () async throws -> String?

/// Calls the Prayer Tower API with the member's Supabase access token, like apps/mobile/src/lib/api.ts.
public struct APIClient: Sendable {
    public let baseURL: URL
    let session: URLSession
    let token: TokenProvider

    public init(baseURL: URL, session: URLSession = .shared, token: @escaping TokenProvider) {
        self.baseURL = baseURL
        self.session = session
        self.token = token
    }

    public func me() async throws -> Me { try await get("/me") }
    public func features() async throws -> Features { try await get("/features") }
    public func feed(page: Int = 0) async throws -> FeedPage { try await get("/feed", query: ["page": String(page)]) }
    public func prayingNow(postId: String) async throws -> PrayingNow { try await post("/posts/\(postId)/praying-now", body: [String: String]()) }

    // MARK: - Reactions and meanings (one row of icons; meanings on a long press)

    /// Well wishes, a short encouragement or a share (`POST /posts/:id/reactions`).
    public func react(postId: String, kind: String, note: String? = nil) async throws -> Ignored {
        try await post("/posts/\(postId)/reactions", body: ["kind": kind, "note": note].compactMapValues { $0 })
    }
    public func reactionMeanings() async throws -> [MeaningEmoji] { try await (get("/reaction-meanings") as MeaningTree).emoji }
    public func meanings(postId: String) async throws -> [MeaningLeaf] { try await (get("/posts/\(postId)/meanings") as Leaves).leaves }
    public func chooseMeaning(postId: String, emoji: String, meaning: String) async throws -> [MeaningLeaf] {
        try await (send(body(request("PUT", "/posts/\(postId)/meanings"), ["emoji": emoji, "meaning": meaning])) as Leaves).leaves
    }
    public func removeMeaning(postId: String, emoji: String) async throws -> [MeaningLeaf] {
        try await (send(request("DELETE", "/posts/\(postId)/meanings/\(emoji)")) as Leaves).leaves
    }

    // MARK: - Feed skins

    public func feedThemes() async throws -> FeedThemeChoices { try await get("/me/feed-themes") }
    /// nil goes back to the community's usual feed.
    public func chooseFeedTheme(_ slug: String?) async throws -> FeedThemeChoices {
        try await send(body(request("PUT", "/me/feed-theme"), ["slug": slug]))
    }

    // MARK: - Kind cloud

    /// The kind cloud's check on a draft. A failed check shows nothing, as in the Expo app.
    public func precheck(_ text: String) async -> Precheck {
        (try? await post("/moderation/precheck", body: ["text": text])) ?? Precheck(warn: false, cloud: nil, harm: nil)
    }

    // MARK: - Prayer circles

    public func myCircles() async throws -> MyCircles { try await get("/me/circles") }
    public func circle(_ id: String) async throws -> CircleView { try await get("/circles/\(id)") }
    public func createCircle(name: String, about: String? = nil) async throws -> CreatedID {
        try await post("/circles", body: ["name": name, "about": about].compactMapValues { $0 })
    }
    public func joinCircle(code: String) async throws -> CreatedID { try await post("/circles/join", body: ["code": code]) }
    public func circleInvite(_ id: String) async throws -> InviteCode { try await post("/circles/\(id)/invite", body: [String: String]()) }
    public func circlePost(_ id: String, body text: String) async throws -> CreatedID { try await post("/circles/\(id)/posts", body: ["body": text]) }
    public func circleReply(postId: String, body text: String) async throws -> CreatedID { try await post("/circle-posts/\(postId)/replies", body: ["body": text]) }
    public func circlePray(postId: String) async throws -> Ignored { try await post("/circle-posts/\(postId)/pray", body: [String: String]()) }
    /// Circle updates: only the person who shared can say how it's going.
    public func circleUpdate(postId: String, text: String, answered: Bool) async throws -> Ignored {
        try await post("/circle-posts/\(postId)/update", body: CircleUpdateBody(text: text, answered: answered))
    }

    // MARK: - Fresh-start days

    public func freshDays() async throws -> [FreshStartDay] { try await (get("/me/fresh-days") as FreshDays).days }
    public func addFreshDay(month: Int, day: Int, label: String) async throws -> [FreshStartDay] {
        try await (post("/me/fresh-days", body: NewFreshDay(month: month, day: day, label: label)) as FreshDays).days
    }
    /// Today's fresh start, if today is one of the member's days (or a season's first day).
    public func freshDayToday(timeZone: String = TimeZone.current.identifier) async throws -> FreshDay? {
        try await (get("/me/prayer-stats", query: ["tz": timeZone]) as StatsWrapper).stats.freshDay
    }
    public func removeFreshDay(_ id: String) async throws -> [FreshStartDay] { try await (send(request("DELETE", "/me/fresh-days/\(id)")) as FreshDays).days }

    // MARK: - Requests

    func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        try await send(request("GET", path, query: query))
    }

    func post<T: Decodable, B: Encodable>(_ path: String, body b: B) async throws -> T {
        try await send(body(request("POST", path), b))
    }

    func body<B: Encodable>(_ request: URLRequest, _ body: B) throws -> URLRequest {
        var r = request
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(body)
        return r
    }

    func request(_ method: String, _ path: String, query: [String: String] = [:]) async throws -> URLRequest {
        var parts = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var r = URLRequest(url: parts.url!)
        r.httpMethod = method
        // On a slow connection, give up after 15 seconds and treat it as offline, as the Expo app does.
        r.timeoutInterval = 15
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let t = try await token() { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        return r
    }

    func send<T: Decodable>(_ r: URLRequest) async throws -> T {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: r)
        } catch {
            throw OfflineError.from(error)
        }
        return try decode(data, status: (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    func decode<T: Decodable>(_ data: Data, status: Int) throws -> T {
        guard (200..<300).contains(status) else {
            let body = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw APIError(status: status, code: body?.error ?? "http_\(status)", message: body?.message ?? "Something went wrong (\(status))")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
