@_spi(Experimental) import Auth
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
            localStorage: storage,
            logger: nil
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

    /// Lost phone: a backup code turns two-step sign-in off. The refreshed session no longer
    /// lists the removed factor, so the code isn't needed (as codeDone in the Expo app).
    public func useBackupCode(_ code: String) async throws -> SignInState {
        _ = try await api.useBackupCode(code)
        _ = try await auth.refreshSession()
        return await codeStillNeeded() ? .needsCode : .signedIn
    }

    // MARK: - Two-step sign-in on Me → Password and email

    /// Whether two-step sign-in is on for this member (a verified authenticator factor).
    public func twoStepOn() async -> Bool {
        (try? await auth.mfa.listFactors().totp.isEmpty == false) ?? false
    }

    /// Starts two-step sign-in: clears any half-finished setup, then returns the key and the
    /// otpauth link for the authenticator app.
    public func startTwoStep(issuer: String) async throws -> TwoStepSetup {
        for f in try await auth.mfa.listFactors().all where f.factorType == "totp" && f.status != .verified {
            _ = try await auth.mfa.unenroll(params: MFAUnenrollParams(factorId: f.id))
        }
        let r = try await auth.mfa.enroll(params: .totp(issuer: issuer))
        guard let totp = r.totp else { throw TwoStepFailed() }
        return TwoStepSetup(factorId: r.id, secret: totp.secret, uri: totp.uri)
    }

    /// Finishes setup with the first code from the authenticator app.
    public func finishTwoStep(_ setup: TwoStepSetup, code: String) async throws {
        try await auth.mfa.challengeAndVerify(params: MFAChallengeAndVerifyParams(factorId: setup.factorId, code: code.trimmingCharacters(in: .whitespaces)))
    }

    public func turnOffTwoStep() async throws {
        for f in try await auth.mfa.listFactors().totp {
            _ = try await auth.mfa.unenroll(params: MFAUnenrollParams(factorId: f.id))
        }
        _ = try await auth.refreshSession()
    }

    // MARK: - Passkeys (supabase-swift's experimental passkey API; the server switch is passkeys_enabled)

    public func passkeys() async throws -> [Passkey] {
        try await auth.listPasskeys().map { Passkey(id: $0.id, name: $0.friendlyName, createdAt: $0.createdAt) }
    }

    public func removePasskey(_ id: UUID) async throws {
        try await auth.deletePasskey(id: id)
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

/// The authenticator app's key for two-step setup. The secret is shown once, never logged.
public struct TwoStepSetup: Sendable, Equatable {
    public let factorId: String
    public let secret: String
    /// The otpauth:// link that opens the authenticator app directly.
    public let uri: String
}

/// The authenticator setup came back without a key.
public struct TwoStepFailed: Error, LocalizedError {
    public var errorDescription: String? { "Couldn’t start two-step sign-in. Try again." }
}

public struct Passkey: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let name: String?
    public let createdAt: Date
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

#if canImport(AuthenticationServices) && !os(tvOS) && !os(watchOS)
import AuthenticationServices

extension SessionStore {
    /// Face ID, Touch ID or a security key instead of a password. A passkey sign-in can still
    /// need the authenticator code afterwards when two-step sign-in is on.
    @MainActor
    public func signInWithPasskey(from anchor: ASPresentationAnchor) async throws -> SignInState {
        try await auth.signInWithPasskey(presentationAnchor: anchor)
        return await codeStillNeeded() ? .needsCode : .signedIn
    }

    @MainActor
    public func addPasskey(from anchor: ASPresentationAnchor) async throws {
        try await auth.registerPasskey(presentationAnchor: anchor)
    }
}
#endif

#if canImport(Security)
extension SessionStore {
    /// On iPhone, iPad and Mac: the session lives in the Keychain. The app target links only
    /// this package's products, so it can't name supabase-swift's `KeychainLocalStorage` itself.
    public convenience init(supabaseURL: URL, publishableKey: String, apiURL: URL) {
        self.init(supabaseURL: supabaseURL, publishableKey: publishableKey, apiURL: apiURL, storage: KeychainLocalStorage())
    }
}
#endif
