import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Poor-network support, as the Expo app's lib/offline.ts: the last feed (and Me, and the
// switches) is kept on the device and shown when the server can't be reached, and "Praying Now"
// taps and text-only posts made offline wait in a queue that is sent, in order, once a request
// succeeds again. Nothing here is sent anywhere but our own API.

/// Thrown when the server can't be reached (no signal, airplane mode, timeout).
public struct OfflineError: Error, Sendable, Equatable, LocalizedError {
    public init() {}
    public var errorDescription: String? { "You're offline. Check your connection and try again." }

    static let codes: Set<URLError.Code> = [.notConnectedToInternet, .timedOut, .cannotConnectToHost, .cannotFindHost,
                                            .networkConnectionLost, .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed]
    /// A URL error that means "couldn't reach the server", as an OfflineError.
    static func from(_ error: Error) -> Error {
        if let u = error as? URLError, codes.contains(u.code) { return OfflineError() }
        return error
    }
}

public struct QueuedAction: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    /// What the member did, for "Not sent: …".
    public let label: String
    public let path: String
    public let body: Data
    /// Sent as Idempotency-Key, the same as the first try's, so a replay is never done twice.
    public let key: String
    public let queuedAt: Date
}

public actor OfflineStore {
    /// Queued actions older than this are dropped: a days-old "praying now" isn't now.
    static let maxAge: TimeInterval = 3 * 24 * 60 * 60

    public static let shared = OfflineStore(directory: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("offline"))

    nonisolated let directory: URL
    public private(set) var online = true
    public private(set) var queued: [QueuedAction] = []
    /// What happened to queued actions the server refused (e.g. a removed request).
    public private(set) var dropped: [(label: String, message: String)] = []
    private var loaded = false
    private var flushing = false

    public init(directory: URL) { self.directory = directory }

    private var queueFile: URL { directory.appendingPathComponent("queue-v1.json") }
    private func cacheFile(_ key: String) -> URL { directory.appendingPathComponent("cache-v1-\(key).json") }

    public func markOnline(_ on: Bool) { online = on }

    // MARK: Saved responses

    struct Saved: Codable { let savedAt: Date; let value: Data }

    public func save(_ key: String, _ data: Data) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let d = try? JSONEncoder().encode(Saved(savedAt: .now, value: data)) { try? d.write(to: cacheFile(key), options: .atomic) }
    }

    public func read(_ key: String) -> (savedAt: Date, value: Data)? {
        guard let d = try? Data(contentsOf: cacheFile(key)), let s = try? JSONDecoder().decode(Saved.self, from: d) else { return nil }
        return (s.savedAt, s.value)
    }

    /// Removes everything saved for offline use (on sign-out or account deletion).
    public func clear() {
        queued = []
        dropped = []
        try? FileManager.default.removeItem(at: directory)
    }

    // MARK: Queue

    private func load() {
        guard !loaded else { return }
        loaded = true
        if let d = try? Data(contentsOf: queueFile), let items = try? JSONDecoder().decode([QueuedAction].self, from: d) {
            queued = items.filter { Date.now.timeIntervalSince($0.queuedAt) < Self.maxAge }
        }
    }

    private func persist() {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let d = try? JSONEncoder().encode(queued) { try? d.write(to: queueFile, options: .atomic) }
    }

    public func enqueue(label: String, path: String, body: Data, key: String) {
        load()
        queued.append(QueuedAction(id: UUID().uuidString, label: label, path: path, body: body, key: key, queuedAt: .now))
        persist()
    }

    public func pending() -> [QueuedAction] {
        load()
        return queued
    }

    /// Sends queued actions in order. Stops at the first one that can't reach the server; drops
    /// one the server refuses (and remembers why).
    public func flush(_ send: @Sendable (QueuedAction) async throws -> Void) async {
        load()
        guard !flushing, !queued.isEmpty else { return }
        flushing = true
        defer { flushing = false }
        while let next = queued.first {
            do {
                try await send(next)
            } catch {
                // No signal, a server error or "too many requests": keep it and try again later.
                let status = (error as? APIError)?.status ?? 0
                if error is OfflineError || status >= 500 || status == 429 { break }
                dropped.append((next.label, error.localizedDescription))
            }
            queued.removeFirst()
            persist()
        }
    }

    public func dismissDropped() { dropped = [] }
    public func droppedNow() -> [(label: String, message: String)] { dropped }
}

/// A response that may have come from the device when offline.
public struct Saved<T: Sendable>: Sendable {
    public let value: T
    /// Set when this is the copy saved on the device, not a fresh answer.
    public let savedAt: Date?
}

extension APIClient {
    /// A GET whose last good answer is kept on the device and returned, marked, when offline.
    public func cachedGet<T: Decodable & Sendable>(_ key: String, _ path: String, query: [String: String] = [:], store: OfflineStore = .shared) async throws -> Saved<T> {
        do {
            let (data, response) = try await session.data(for: try await request("GET", path, query: query))
            await store.markOnline(true)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let value: T = try decode(data, status: status)
            await store.save(key, data)
            Task { await sendQueued(store: store) }
            return Saved(value: value, savedAt: nil)
        } catch {
            let e = OfflineError.from(error)
            guard e is OfflineError else { throw e }
            await store.markOnline(false)
            guard let saved = await store.read(key), let value = try? JSONDecoder().decode(T.self, from: saved.value) else { throw e }
            return Saved(value: value, savedAt: saved.savedAt)
        }
    }

    /// A POST that waits in the offline queue when the server can't be reached; nil means queued.
    public func postOrQueue<T: Decodable, B: Encodable>(_ path: String, body b: B, label: String, store: OfflineStore = .shared) async throws -> T? {
        // A timed-out request may still have reached the server: the replay sends the same key,
        // and the server answers it with the first result instead of posting twice.
        let key = UUID().uuidString.lowercased()
        let data = try JSONEncoder().encode(b)
        do {
            let value: T = try await sendKeyed(path, data, key: key)
            await store.markOnline(true)
            return value
        } catch {
            let e = OfflineError.from(error)
            guard e is OfflineError else { throw e }
            await store.markOnline(false)
            await store.enqueue(label: label, path: path, body: data, key: key)
            return nil
        }
    }

    /// Sends queued offline actions now (also when the app comes back to the foreground).
    public func sendQueued(store: OfflineStore = .shared) async {
        await store.flush { a in
            do {
                let _: Ignored = try await sendKeyed(a.path, a.body, key: a.key)
            } catch {
                throw OfflineError.from(error)
            }
        }
    }

    func sendKeyed<T: Decodable>(_ path: String, _ data: Data, key: String) async throws -> T {
        var r = try await request("POST", path)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue(key, forHTTPHeaderField: "Idempotency-Key")
        r.httpBody = data
        let (body, response) = try await session.data(for: r)
        return try decode(body, status: (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    public func cachedFeed() async throws -> Saved<FeedPage> { try await cachedGet("feed", "/feed", query: ["page": "0"]) }
    public func prayingNowOrQueue(postId: String) async throws -> PrayingNow? {
        try await postOrQueue("/posts/\(postId)/praying-now", body: [String: String](), label: "Praying Now")
    }
}
