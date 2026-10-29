import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

// In the same serialized suite as the other stubbed-network tests, which share StubProtocol.
extension APIClientTests {
    @Test func readsTheSignInSettingsAndTreatsMissingSwitchesAsOff() async throws {
        StubProtocol.answer = (200, #"{"inviteOnly":true,"passkeys":true}"#)
        let c = try await client(token: nil).signupConfig()
        #expect(c == SignupConfig(inviteOnly: true, passkeys: true, backupCodes: false))
        #expect(StubProtocol.seen.last?.url?.path == "/signup-config")
        #expect(StubProtocol.seen.last?.value(forHTTPHeaderField: "Authorization") == nil)
    }

    @Test func spendsABackupCodeAndShowsTheServersMessageWhenItIsWrong() async throws {
        StubProtocol.answer = (200, #"{"ok":true}"#)
        _ = try await client().useBackupCode("  ABCD-EFGH ")
        let asked = try #require(StubProtocol.seen.last)
        #expect(asked.httpMethod == "POST")
        #expect(asked.url?.path == "/me/two-step/recover")
        #expect(try JSONDecoder().decode([String: String].self, from: asked.httpBody ?? Data()) == ["code": "ABCD-EFGH"])

        StubProtocol.answer = (400, #"{"error":"bad_request","message":"That code didn't work. Check it, or use another one."}"#)
        await #expect(throws: APIError(status: 400, code: "bad_request", message: "That code didn't work. Check it, or use another one.")) {
            _ = try await client().useBackupCode("WRONG-CODE")
        }
    }

    @Test func readsBackupCodeStatusAndANewSet() async throws {
        StubProtocol.answer = (200, #"{"enabled":true,"remaining":7,"createdAt":"2026-10-29T08:00:00Z"}"#)
        #expect(try await client().backupCodes() == BackupCodeStatus(enabled: true, remaining: 7))
        StubProtocol.answer = (200, #"{"enabled":false}"#)
        #expect(try await client().backupCodes() == BackupCodeStatus(enabled: false, remaining: nil))
        StubProtocol.answer = (200, #"{"codes":["ABCD-EFGH","JKLM-NPQR"]}"#)
        #expect(try await client().makeBackupCodes().codes.count == 2)
    }

    @Test func aBackupCodeNeedsEightCharactersBesidesSpacesAndDashes() {
        #expect(BackupCode.looksComplete("ABCD-EFGH"))
        #expect(BackupCode.looksComplete("abcd efgh"))
        #expect(!BackupCode.looksComplete("ABC-DEFG"))
        #expect(!BackupCode.looksComplete("- - - -"))
    }
}
