import Foundation

/// The public sign-in settings (`GET /signup-config`). Before the two-step code is entered
/// `/features` is refused, so the sign-in screens ask this instead.
public struct SignupConfig: Codable, Sendable, Equatable {
    public let inviteOnly: Bool
    /// "Use a passkey" on the sign-in screen (Admin → Sign-in security → Passkeys).
    public let passkeys: Bool
    /// "Lost your phone? Use a backup code" on the code screen (Admin → Sign-in security → Backup codes).
    public let backupCodes: Bool

    public init(inviteOnly: Bool = false, passkeys: Bool = false, backupCodes: Bool = false) {
        self.inviteOnly = inviteOnly
        self.passkeys = passkeys
        self.backupCodes = backupCodes
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        inviteOnly = try c.decodeIfPresent(Bool.self, forKey: .inviteOnly) ?? false
        passkeys = try c.decodeIfPresent(Bool.self, forKey: .passkeys) ?? false
        backupCodes = try c.decodeIfPresent(Bool.self, forKey: .backupCodes) ?? false
    }
}

/// How many backup codes the member has left (`GET /me/two-step/backup-codes`); nil while switched off.
public struct BackupCodeStatus: Decodable, Sendable, Equatable {
    public let enabled: Bool
    public let remaining: Int?
}

/// A fresh set of backup codes, shown this once only.
public struct BackupCodeSet: Decodable, Sendable, Equatable {
    public let codes: [String]
}

public enum BackupCode {
    /// Codes look like `ABCD-EFGH`; spaces and dashes don't count toward the 8 characters needed.
    public static func looksComplete(_ code: String) -> Bool {
        code.filter { !$0.isWhitespace && $0 != "-" }.count >= 8
    }
}

extension APIClient {
    public func signupConfig() async throws -> SignupConfig { try await get("/signup-config") }
    public func backupCodes() async throws -> BackupCodeStatus { try await get("/me/two-step/backup-codes") }
    /// Replaces any earlier set; the plain codes come back this once.
    public func makeBackupCodes() async throws -> BackupCodeSet { try await post("/me/two-step/backup-codes", body: [String: String]()) }
    /// Spends a backup code. This turns two-step sign-in off, so the session must be refreshed after.
    public func useBackupCode(_ code: String) async throws -> Ignored {
        try await post("/me/two-step/recover", body: ["code": code.trimmingCharacters(in: .whitespaces)])
    }
}
