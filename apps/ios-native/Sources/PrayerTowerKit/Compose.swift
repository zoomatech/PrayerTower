import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Posting a request, as apps/mobile/src/app/compose.tsx does (`POST /posts`).
public enum Compose {
    public static let postTypes = ["prayer_request", "praise", "open_prayer", "testimony", "confessional", "discussion", "news", "blog"]
    /// Posts that aren't prayer: off until an admin turns them on for a community.
    public static let discussionTypes: Set<String> = ["discussion", "news", "blog"]
    public static let kinds = ["supplication", "intercessory", "praise_thanks"]
    public static let realms = ["personal", "family", "church_community", "general_welfare", "national", "world"]
    public static let maxWords = 1000
    public static let maxMedia = 10
    /// The video cap when the server doesn't say (`videoMaxSeconds` in /features).
    public static let defaultVideoSeconds = 7

    public struct Background: Sendable, Equatable, Identifiable {
        public let id: String
        public let label: String
        /// "#RRGGBB" for the card and its text.
        public let color: String
        public let text: String
    }

    /// The same swatches as POST_BACKGROUND_STYLES (packages/shared).
    public static let backgrounds = [
        Background(id: "dawn", label: "Dawn", color: "#F6D5C3", text: "#4A2C2A"),
        Background(id: "sky", label: "Sky", color: "#CFE3F5", text: "#1F3A56"),
        Background(id: "meadow", label: "Meadow", color: "#D4EAD0", text: "#24452A"),
        Background(id: "lavender", label: "Lavender", color: "#E3D9F4", text: "#3B2A63"),
        Background(id: "gold", label: "Gold", color: "#F7E7B4", text: "#4D3B06"),
        Background(id: "night", label: "Night", color: "#2E2A4F", text: "#F4EFFF"),
    ]

    /// The kinds of post the member may choose: their community's, or every prayer kind.
    public static func types(for community: Community?) -> [String] {
        if let on = community?.enabledPostTypes { return postTypes.filter(on.contains) }
        return postTypes.filter { !discussionTypes.contains($0) }
    }

    public static func wordCount(_ s: String) -> Int {
        s.split(whereSeparator: { $0.isWhitespace }).count
    }

    /// Videos longer than the cap are left out (the server refuses them too), with half a second of grace.
    public static func videoFits(seconds: Double?, cap: Int) -> Bool {
        guard let seconds else { return true }
        return seconds <= Double(cap) + 0.5
    }

    /// The upload type for a picked file; anything unknown is sent as JPEG or MP4.
    public static func contentType(_ mime: String?, video: Bool) -> String {
        let allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "video/mp4", "video/quicktime"]
        if let mime, allowed.contains(mime) { return mime }
        return video ? "video/mp4" : "image/jpeg"
    }
}

public struct MediaRef: Codable, Sendable, Equatable {
    public let kind: String
    public let storagePath: String
    public let durationMs: Int?

    public init(kind: String, storagePath: String, durationMs: Int? = nil) {
        self.kind = kind
        self.storagePath = storagePath
        self.durationMs = durationMs
    }
}

public struct NewPost: Encodable, Sendable, Equatable {
    public var postType = "prayer_request"
    public var body = ""
    public var urgency = 0
    public var kind: String?
    public var realm: String?
    /// For text-only posts.
    public var background: String?
    public var isAnonymous = false
    public var isSensitive = false
    public var allSupportWelcome = false
    public var isLament: Bool?
    public var lamentRadio: Bool?
    public var media: [MediaRef] = []

    public init() {}
}

public struct CreatedPost: Decodable, Sendable {
    public let post: Card
    /// Crisis support or hotlines from the harmful-prayer check; the post is never blocked.
    public let harm: HarmNote?
}

public struct UploadTicket: Decodable, Sendable, Equatable {
    public let path: String
    public let token: String
    public let signedUrl: String
}

extension APIClient {
    public func createPost(_ p: NewPost) async throws -> CreatedPost {
        var p = p
        p.body = p.body.trimmingCharacters(in: .whitespacesAndNewlines)
        if !p.media.isEmpty { p.background = nil }
        return try await post("/posts", body: p)
    }

    public func mediaUploadURL(contentType: String) async throws -> UploadTicket {
        try await post("/media/upload-url", body: ["contentType": contentType])
    }

    /// Uploads one photo or video straight to Supabase Storage with the signed URL from the API,
    /// as uploadToSignedUrl does in supabase-js, and returns what `createPost` needs.
    public func uploadMedia(_ data: Data, contentType: String, video: Bool, durationMs: Int? = nil) async throws -> MediaRef {
        let ticket = try await mediaUploadURL(contentType: contentType)
        guard let url = URL(string: ticket.signedUrl) else { throw APIError(status: 0, code: "upload_failed", message: "Upload failed") }
        var r = URLRequest(url: url)
        r.httpMethod = "PUT"
        r.setValue(contentType, forHTTPHeaderField: "Content-Type")
        r.setValue("false", forHTTPHeaderField: "x-upsert")
        let (body, response) = try await session.upload(for: r, from: data)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: body))?["message"] ?? "status \(status)"
            throw APIError(status: status, code: "upload_failed", message: "Upload failed: \(message)")
        }
        return MediaRef(kind: video ? "video" : "image", storagePath: ticket.path, durationMs: video ? durationMs : nil)
    }
}
