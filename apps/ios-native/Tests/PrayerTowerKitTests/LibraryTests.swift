import Foundation
import Testing
@testable import PrayerTowerKit

// The network tests share the stand-in server, so they join the serialized APIClientTests suite.
extension APIClientTests {
    @Test func searchesTheTexts() async throws {
        StubProtocol.answer = (200, #"{"enabled":true,"collections":[{"id":"ancient-writings","title":"Ancient writings","faith":false}]}"#)
        #expect(try await client().library().collections?.map(\.id) == ["ancient-writings"])
        StubProtocol.answer = (200, """
        {"total":1,"source":"Project Gutenberg","hits":[{"ref":"Psalms 23:1","text":"The LORD is my shepherd; I shall not want.","complete":true,
          "work":{"id":"kjv-psalms","title":"Psalms","author":""}}]}
        """)
        let found = try await client().searchLibrary("my shepherd", collection: "bible-kjv")
        #expect(found.hits.first?.ref == "Psalms 23:1")
        #expect(StubProtocol.seen.last?.url?.path == "/library/search")
        #expect(StubProtocol.seen.last?.url?.query == "collection=bible-kjv&limit=20&offset=0&q=my%20shepherd")
        StubProtocol.answer = (200, #"{"enabled":false}"#)
        #expect(try await client().library().enabled == false)
    }
}
