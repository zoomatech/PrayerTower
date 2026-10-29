import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct OfflineTests {
    func store() -> OfflineStore {
        OfflineStore(directory: FileManager.default.temporaryDirectory.appendingPathComponent("offline-test-\(UUID().uuidString)"))
    }

    @Test func savedResponsesComeBack() async {
        let s = store()
        await s.save("feed", Data("{}".utf8))
        let saved = await s.read("feed")
        #expect(saved?.value == Data("{}".utf8))
        await s.clear()
        #expect(await s.read("feed") == nil)
    }

    @Test func queueSendsInOrderAndStopsWhenOffline() async {
        let s = store()
        await s.enqueue(label: "Praying Now", path: "/a", body: Data(), key: "1")
        await s.enqueue(label: "Your post", path: "/b", body: Data(), key: "2")
        await s.enqueue(label: "Praying Now", path: "/c", body: Data(), key: "3")
        let sent = Box()
        await s.flush { a in
            if a.path == "/c" { throw OfflineError() }
            await sent.add(a.path)
        }
        #expect(await sent.items == ["/a", "/b"])
        #expect(await s.pending().map(\.path) == ["/c"])
        // A copy on disk survives a restart.
        let again = OfflineStore(directory: s.directory)
        #expect(await again.pending().map(\.key) == ["3"])
    }

    @Test func refusedActionsAreDroppedAndExplained() async {
        let s = store()
        await s.enqueue(label: "Praying Now", path: "/gone", body: Data(), key: "1")
        await s.flush { _ in throw APIError(status: 404, code: "not_found", message: "That request was removed.") }
        #expect(await s.pending().isEmpty)
        #expect(await s.droppedNow().first?.message == "That request was removed.")
        await s.enqueue(label: "Praying Now", path: "/busy", body: Data(), key: "2")
        await s.flush { _ in throw APIError(status: 503, code: "down", message: "Down") }
        #expect(await s.pending().count == 1)
    }

    @Test func urlErrorsMeanOffline() {
        #expect(OfflineError.from(URLError(.notConnectedToInternet)) is OfflineError)
        #expect(!(OfflineError.from(URLError(.badURL)) is OfflineError))
    }
}

actor Box {
    var items: [String] = []
    func add(_ s: String) { items.append(s) }
}
