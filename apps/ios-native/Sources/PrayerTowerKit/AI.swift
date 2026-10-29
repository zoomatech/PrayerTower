import Foundation

// The AI role-play ("Imagine a conversation with God"), preparing for a restorative circle,
// cross-posting from Facebook and Threads, and buying tokens, as the Expo app's ai-chat,
// circle-prep, crosspost and token-store screens. Nothing in the AI screens is saved.

public struct AiTurn: Codable, Sendable, Equatable {
    /// user | assistant
    public let role: String
    public let content: String
    public init(role: String, content: String) {
        self.role = role
        self.content = content
    }
}

public struct AiChatInfo: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let warning: String
}

public struct AiChatReply: Codable, Sendable, Equatable {
    public let warning: String
    public let reply: String
    public let crisis: Bool
}

public struct FacilitatorInfo: Codable, Sendable, Equatable {
    public let enabled: Bool
    /// harmed | caused | unsure → the questions, in order.
    public let questions: [String: [String]]
}

public struct FacilitatorReply: Codable, Sendable, Equatable {
    public let reply: String
    public let crisis: Bool
    /// False when no AI is connected; the questions then come one at a time.
    public let ai: Bool
}

public enum Circles {
    public static let roles = ["harmed", "caused", "unsure"]

    /// The "Summary: …" paragraph the facilitator writes at the end, if any.
    public static func summary(in text: String) -> String? {
        guard let r = text.range(of: #"(?:^|\n)Summary:\s*"#, options: .regularExpression) else { return nil }
        let rest = text[r.upperBound...]
        let end = rest.range(of: "\n\n")?.lowerBound ?? rest.endIndex
        let s = rest[..<end].trimmingCharacters(in: .whitespacesAndNewlines)
        return s.isEmpty ? nil : s
    }
}

// MARK: - Cross-posting

public struct CrosspostStatus: Codable, Sendable, Equatable {
    public struct Account: Codable, Sendable, Equatable {
        /// facebook | threads
        public let provider: String
        public let username: String?
        /// active | expired
        public let status: String
    }
    public struct Recent: Codable, Sendable, Equatable {
        public let source: String
        /// posted | skipped
        public let status: String
        public let reason: String?
        public let postId: String?
        public let createdAt: String
    }
    public let enabled: Bool
    public let connectable: [String: Bool]?
    public let accounts: [Account]?
    public let postType: String?
    public let postTypes: [String]?
    public let paused: Bool?
    public let extensionKeyHint: String?
    public let recent: [Recent]?

    public static let providers = ["threads", "facebook"]
    public static let names = ["threads": "Threads", "facebook": "Facebook"]

    /// The server's default when the member hasn't chosen: discussion, else testimony, else praise.
    public var chosenType: String? {
        let types = postTypes ?? []
        return postType ?? ["discussion", "testimony", "praise"].first(where: types.contains) ?? types.first
    }
}

// MARK: - Token store

public struct TokenProduct: Codable, Sendable, Equatable, Identifiable {
    public let sku: String
    public let tokens: Int
    /// regular | priestly
    public let currency: String
    public let priceLabel: String?
    public let appleProductId: String?
    public var id: String { sku }
}

public struct TokenStoreListing: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let commonFundPercent: Int?
    public let products: [TokenProduct]
    /// Admin → Practice mode: no App Store and no money.
    public let practice: Bool?
}

public struct TokenPurchase: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let tokens: Int
    public let currency: String
    /// credited | refunded
    public let status: String
    public let purchased_at: String?
    public let practice: Bool?
}

public struct TokenPurchaseResult: Codable, Sendable, Equatable {
    public let id: String
    public let tokens: Int
    public let balance: Int
}

public enum TokenStore {
    /// A practice "transaction" the server credits without Apple, as the Expo app's
    /// practiceTransaction: `practice.<base64url JSON>`.
    public static func practiceTransaction(productId: String, userId: String, transactionId: UUID = UUID()) -> String {
        let json = try? JSONSerialization.data(withJSONObject: ["productId": productId, "appAccountToken": userId, "transactionId": transactionId.uuidString.lowercased()], options: [.sortedKeys])
        let b64 = (json ?? Data()).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return "practice.\(b64)"
    }
}

// MARK: - API

private struct Chat: Encodable { let message: String; let history: [AiTurn] }
private struct Facilitate: Encodable { let role: String; let message: String; let history: [AiTurn] }
private struct Key: Decodable { let key: String }
private struct Link: Decodable { let url: String }
private struct Purchases: Decodable { let purchases: [TokenPurchase] }
private struct Bought: Decodable { let purchase: TokenPurchaseResult }
private struct CrosspostPatch: Encodable { let postType: String?; let paused: Bool? }
private let nothing = [String: String]()

extension APIClient {
    public func aiChatInfo() async throws -> AiChatInfo { try await get("/ai-chat") }
    public func aiChat(_ message: String, history: [AiTurn]) async throws -> AiChatReply { try await post("/ai-chat", body: Chat(message: message, history: history)) }
    public func facilitatorInfo() async throws -> FacilitatorInfo { try await get("/ai-facilitator") }
    public func facilitate(role: String, message: String, history: [AiTurn]) async throws -> FacilitatorReply {
        try await post("/ai-facilitator", body: Facilitate(role: role, message: message, history: history))
    }
    public func askForCircle(role: String, summary: String) async throws -> Ignored { try await post("/circle-requests", body: ["role": role, "summary": summary]) }

    public func crosspostStatus() async throws -> CrosspostStatus { try await get("/crosspost") }
    public func crosspostPaused(_ on: Bool) async throws -> CrosspostStatus { try await send(body(request("PATCH", "/crosspost/settings"), CrosspostPatch(postType: nil, paused: on))) }
    public func crosspostType(_ type: String) async throws -> CrosspostStatus { try await send(body(request("PATCH", "/crosspost/settings"), CrosspostPatch(postType: type, paused: nil))) }
    /// Shown once; the server keeps only its last characters.
    public func newExtensionKey() async throws -> String { try await (post("/crosspost/extension-key", body: nothing) as Key).key }
    public func revokeExtensionKey() async throws -> Ignored { try await send(request("DELETE", "/crosspost/extension-key")) }
    /// The sign-in page for the provider.
    public func connectCrosspost(_ provider: String) async throws -> URL? { URL(string: try await (post("/crosspost/\(provider)/connect", body: nothing) as Link).url) }
    public func disconnectCrosspost(_ provider: String) async throws -> Ignored { try await send(request("DELETE", "/crosspost/\(provider)")) }

    public func tokenStore() async throws -> TokenStoreListing { try await get("/token-store") }
    public func tokenPurchases() async throws -> [TokenPurchase] { try await (get("/me/token-purchases") as Purchases).purchases }
    /// A StoreKit 2 signed transaction (or a practice one); the server checks it before crediting.
    public func buyTokens(signedTransaction: String) async throws -> TokenPurchaseResult {
        try await (post("/token-store/purchases", body: ["platform": "ios", "signedTransaction": signedTransaction]) as Bought).purchase
    }
}
