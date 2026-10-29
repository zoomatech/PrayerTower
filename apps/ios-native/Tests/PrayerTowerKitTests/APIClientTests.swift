import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

/// A stand-in server: each test sets what it answers and reads what was asked.
final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var answer: (Int, String) = (200, "{}")
    nonisolated(unsafe) static var seen: [URLRequest] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var r = request
        if r.httpBody == nil, let stream = r.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            stream.close()
            r.httpBody = data
        }
        Self.seen.append(r)
        let (status, body) = Self.answer
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

func client(token: String? = "tok-1") -> APIClient {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StubProtocol.self]
    return APIClient(baseURL: URL(string: "https://api.example.test")!, session: URLSession(configuration: config), token: { token })
}

@Suite(.serialized) struct APIClientTests {
    init() { StubProtocol.seen = [] }

    @Test func readsTheFeedWithTheMembersToken() async throws {
        StubProtocol.answer = (200, """
        {"posts":[{"id":"p1","cardType":"request","author":{"id":null,"displayName":"Someone","handle":null,"anonymous":true},
          "isMine":false,"postType":"prayer_request","urgency":2,"preview":"Please pray for my father","body":"Please pray for my father, surgery on Tuesday.",
          "crisis":false,"counts":{"prayingNow":1,"prayers":4,"commitments":1,"comments":0,"encouragements":0},"createdAt":"2026-10-29T08:00:00Z","extra":"ignored"}],
         "pinnedId":null,"nextPage":1,"theme":null}
        """)
        let page = try await client().feed(page: 0)
        #expect(page.posts.first?.preview == "Please pray for my father")
        #expect(page.posts.first?.author.anonymous == true)
        #expect(page.nextPage == 1)
        let asked = try #require(StubProtocol.seen.first)
        #expect(asked.url?.absoluteString == "https://api.example.test/feed?page=0")
        #expect(asked.value(forHTTPHeaderField: "Authorization") == "Bearer tok-1")
    }

    @Test func sendsPrayingNow() async throws {
        StubProtocol.answer = (200, #"{"eventId":"e1","integrityText":"Thank you for praying."}"#)
        let r = try await client().prayingNow(postId: "p1")
        #expect(r.integrityText == "Thank you for praying.")
        let asked = try #require(StubProtocol.seen.first)
        #expect(asked.httpMethod == "POST")
        #expect(asked.url?.path == "/posts/p1/praying-now")
        #expect(asked.httpBody.map { String(decoding: $0, as: UTF8.self) } == "{}")
    }

    @Test func tellsTwoStepFromSignedOut() async throws {
        StubProtocol.answer = (401, #"{"error":"two_step_required","message":"Enter the code from your authenticator app to finish signing in"}"#)
        do {
            _ = try await client().me()
            Issue.record("expected an error")
        } catch let e as APIError {
            #expect(e.needsCode)
            #expect(!e.signedOut)
        }
        StubProtocol.answer = (401, #"{"error":"unauthenticated","message":"Invalid or expired token"}"#)
        await #expect(throws: APIError(status: 401, code: "unauthenticated", message: "Invalid or expired token")) { try await client().me() }
    }

    @Test func readsSwitchesAndCountsMissingOnesAsOff() async throws {
        StubProtocol.answer = (200, #"{"features":{"twoStep":true,"passkeys":false,"commentTreeLeaves":5}}"#)
        let f = try await client().features()
        #expect(f["twoStep"])
        #expect(!f["passkeys"])
        #expect(!f["neverHeardOf"])
    }

    @Test func readsTheMemberAndTheirWording() async throws {
        StubProtocol.answer = (200, #"{"profile":{"id":"u1","display_name":"Ruth","bio":""},"roles":["moderator"],"community":{"slug":"open-circle","name":"Open Circle","wording":"neutral","tradition":"secular"}}"#)
        let me = try await client(token: nil).me()
        #expect(me.profile.displayName == "Ruth")
        #expect(me.community?.wording == "neutral")
        #expect(StubProtocol.seen.first?.value(forHTTPHeaderField: "Authorization") == nil)
    }
}
