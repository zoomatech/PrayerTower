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

    // MARK: - Requests

    func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        try await send(request("GET", path, query: query))
    }

    func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var r = try await request("POST", path)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(body)
        return try await send(r)
    }

    func request(_ method: String, _ path: String, query: [String: String] = [:]) async throws -> URLRequest {
        var parts = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var r = URLRequest(url: parts.url!)
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let t = try await token() { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        return r
    }

    func send<T: Decodable>(_ r: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: r)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let body = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw APIError(status: status, code: body?.error ?? "http_\(status)", message: body?.message ?? "Something went wrong (\(status))")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
