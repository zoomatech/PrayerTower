import Auth
import Foundation
import PrayerTowerKit

/// Where the member is in signing in: the same states as apps/mobile/src/lib/auth.tsx.
public enum SignInState: Sendable, Equatable {
    case signedOut
    /// Password accepted, but two-step sign-in is on: ask for the authenticator code.
    case needsCode
    case signedIn
}

/// Signs the member in with Supabase Auth and gives the API their access token.
/// On iPhone the session is kept in the Keychain; tests and Linux use memory.
public final class SessionStore: Sendable {
    public let auth: AuthClient
    public let api: APIClient

    public init(supabaseURL: URL, publishableKey: String, apiURL: URL, storage: any AuthLocalStorage) {
        let auth = AuthClient(
            url: supabaseURL.appendingPathComponent("auth/v1"),
            headers: ["apikey": publishableKey],
            localStorage: storage
        )
        self.auth = auth
        self.api = APIClient(baseURL: apiURL) { try? await auth.session.accessToken }
    }

    /// The state for the session saved on this device (on app start).
    public func current() async -> SignInState {
        guard auth.currentSession != nil else { return .signedOut }
        return await codeStillNeeded() ? .needsCode : .signedIn
    }

    public func signIn(email: String, password: String) async throws -> SignInState {
        try await auth.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
        return await codeStillNeeded() ? .needsCode : .signedIn
    }

    /// Checks the 6-digit code from the member's authenticator app.
    public func enterCode(_ code: String) async throws -> SignInState {
        guard let factor = try await auth.mfa.listFactors().totp.first else { return .signedIn }
        try await auth.mfa.challengeAndVerify(params: MFAChallengeAndVerifyParams(factorId: factor.id, code: code.trimmingCharacters(in: .whitespaces)))
        return .signedIn
    }

    public func signOut() async {
        try? await auth.signOut(scope: .local)
    }

    /// True while this session still needs the authenticator code (aal1 → aal2).
    func codeStillNeeded() async -> Bool {
        guard let aal = try? await auth.mfa.getAuthenticatorAssuranceLevel() else { return false }
        return aal.nextLevel == "aal2" && aal.currentLevel != "aal2"
    }
}

/// Keeps the session in memory only (Linux, tests, previews).
public final class MemoryStorage: AuthLocalStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: Data] = [:]

    public init() {}
    public func store(key: String, value: Data) throws { lock.withLock { values[key] = value } }
    public func retrieve(key: String) throws -> Data? { lock.withLock { values[key] } }
    public func remove(key: String) throws { _ = lock.withLock { values.removeValue(forKey: key) } }
}

#if canImport(Security)
extension SessionStore {
    /// On iPhone, iPad and Mac: the session lives in the Keychain. The app target links only
    /// this package's products, so it can't name supabase-swift's `KeychainLocalStorage` itself.
    public convenience init(supabaseURL: URL, publishableKey: String, apiURL: URL) {
        self.init(supabaseURL: supabaseURL, publishableKey: publishableKey, apiURL: apiURL, storage: KeychainLocalStorage())
    }
}
#endif
