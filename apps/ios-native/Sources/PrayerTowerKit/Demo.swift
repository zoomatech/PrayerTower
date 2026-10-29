import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Sample data the native app can run on with no server: the snapshot tests, the performance
// tests (a feed of 1,000 posts), and screenshots. Debug builds open it with the launch argument
// -PTDemo (and -PTDemoPosts 1000 for a longer feed). Every answer is made up; nothing is sent.

public enum Demo {
    public static let baseURL = URL(string: "https://demo.prayertower.invalid")!
    public static let pageSize = 50

    /// A client whose every request is answered from the sample data, with `posts` posts in the feed.
    public static func client(posts: Int = 24) -> APIClient {
        DemoProtocol.posts.withLock { $0 = posts }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [DemoProtocol.self]
        return APIClient(baseURL: baseURL, session: URLSession(configuration: config)) { "demo" }
    }

    /// The launch arguments: whether to run on sample data, and how many posts the feed holds.
    public static func posts(fromArguments args: [String]) -> Int? {
        guard args.contains("-PTDemo") else { return nil }
        if let i = args.firstIndex(of: "-PTDemoPosts"), i + 1 < args.count, let n = Int(args[i + 1]), n > 0 { return n }
        return 24
    }

    /// The status and JSON body for one request. Reads answer from the sample data; anything
    /// else (sending a prayer, a comment) answers `{}` so the screen carries on.
    public static func answer(method: String, path: String, query: [String: String], posts: Int) -> (Int, String) {
        let parts = path.split(separator: "/").map(String.init)
        guard method == "GET" else { return (200, "{}") }
        switch parts {
        case ["me"]: return (200, me)
        case ["features"]: return (200, features)
        case ["feed"]:
            let page = Int(query["page"] ?? "0") ?? 0
            let start = page * pageSize, end = min(start + pageSize, posts)
            let cards = start < end ? (start..<end).map(card) : []
            let next = end < posts ? String(page + 1) : "null"
            return (200, #"{"theme":null,"posts":["# + cards.joined(separator: ",") + #"],"pinnedId":null,"nextPage":\#(next)}"#)
        case let p where p.count == 2 && p[0] == "posts":
            return (200, #"{"post":\#(card(index(p[1])))}"#)
        case let p where p.count == 3 && p[0] == "posts" && p[2] == "comments":
            return (200, #"{"comments":[\#(comments(index(p[1])))]}"#)
        case let p where p.count == 3 && p[0] == "posts" && p[2] == "prayers":
            return (200, #"{"count":3,"people":[{"id":"u2","displayName":"Grace"},{"id":"u3","displayName":"Daniel"},{"id":null,"displayName":"Someone"}]}"#)
        case ["me", "tier"]:
            return (200, #"{"tier":{"tier":"faithful","label":"Faithful"},"prayers":42,"next":{"tier":"steadfast","label":"Steadfast","prayersNeeded":8},"upkeep":null}"#)
        case ["me", "tokens"]:
            return (200, #"{"balance":12,"priestly":{"balance":1,"verifiedPrayers":42,"towardNext":2,"prayersPerToken":10,"radioPrayerCost":1,"amplifyRepeats":null,"amplifyCost":null}}"#)
        case ["me", "prayer-stats"]: return (200, stats)
        case ["me", "notifications"]: return (200, notifications)
        case ["me", "conversations"]: return (200, conversations)
        case ["me", "commitments"]: return (200, commitments)
        case ["me", "commitments", "review"]:
            return (200, #"{"prayers":9,"checkins":5,"people":6,"active":2,"kept":1,"message":"You showed up for 6 people this week."}"#)
        case ["me", "circles"]:
            return (200, #"{"enabled":true,"circles":[{"id":"c1","name":"Tuesday small group","about":"We pray for each other every week.","isOwner":true,"members":8,"lastPostAt":"2026-10-28T18:00:00Z"},{"id":"c2","name":"Family","about":null,"isOwner":false,"members":5,"lastPostAt":null}]}"#)
        case ["me", "feed-themes"]: return (200, #"{"themes":[],"current":null,"theme":null}"#)
        default: return (404, #"{"error":"not_found","message":"Not in the sample data."}"#)
        }
    }

    // MARK: - The sample data

    static let me = #"{"profile":{"id":"demo-me","display_name":"Ruth","why_here":["pray_for_others"],"onboarded_at":"2026-10-01T00:00:00Z"},"roles":["member"],"community":null}"#

    static let features = #"{"features":{"prayerCircles":true}}"#

    static let names = ["Grace", "Daniel", "Maria", "Samuel", "Esther", "Joseph", "Hannah", "David", "Lydia", "Peter", "Naomi", "Caleb"]

    /// Short and long requests, so the feed shows both one-line and many-line cards.
    static let bodies: [(String, String)] = [
        ("prayer_request", "Please pray for my mom's surgery on Friday."),
        ("praise", "Thankful: the new job came through after eight months of looking!"),
        ("prayer_request", "My son starts at a new school next week and he is anxious about making friends. Please pray that he finds one good friend in the first few days, and that his teachers see him."),
        ("prayer_request", "Pray for rain for the farms in our valley."),
        ("praise", "Six months sober today. Thank you all for walking with me."),
        ("prayer_request", "Our church is hosting a meal for neighbors on Saturday. Pray that the people who need it most come, and that we listen more than we talk."),
        ("prayer_request", "Grieving my grandfather. He taught me to pray."),
        ("prayer_request", "Job interview tomorrow at 9. Peace and clear thinking, please."),
    ]

    static func index(_ id: String) -> Int { Int(id.split(separator: "-").last ?? "") ?? 0 }

    static func card(_ i: Int) -> String {
        let (type, body) = bodies[i % bodies.count]
        let name = names[i % names.count]
        let anonymous = i % 7 == 3
        let answered = i % 9 == 4
        let leaf = i % 3 == 0
            ? #"[{"id":"leaf-\#(i)","body":"Praying with you.","author":{"id":"u9","displayName":"\#(names[(i + 5) % names.count])","handle":null,"anonymous":false},"createdAt":"2026-10-29T09:00:00Z"}]"#
            : "[]"
        let minutes = String(format: "%02d", i % 60)
        return #"""
        {"id":"demo-\#(i)","author":{"id":"u\#(i % names.count)","displayName":"\#(anonymous ? "Someone" : name)","handle":null,"anonymous":\#(anonymous)},\#
        "isMine":\#(i == 1),"postType":"\#(type)","urgency":\#(i % 11 == 2 ? 2 : 0),"preview":"\#(body)","body":"\#(body)","crisis":false,\#
        "isSensitive":false,"counts":{"prayingNow":\#(i % 4),"prayers":\#(3 + i % 17),"commitments":\#(i % 3),"comments":\#(i % 5)},\#
        "createdAt":"2026-10-29T08:\#(minutes):00Z","actions":["pray","commit","comment","share","gift","save"],\#
        "state":"\#(answered ? "answered" : "open")","answeredAt":\#(answered ? #""2026-10-29T10:00:00Z""# : "null"),"testimony":null,\#
        "background":null,"media":[],"leafComments":\#(leaf),"answers":null,"storyId":null}
        """#
    }

    static func comments(_ i: Int) -> String {
        (0..<3).map { k in
            #"{"id":"c-\#(i)-\#(k)","parentId":null,"body":"\#(["Praying for you this morning.", "Same thing happened to us last year; it got better. Holding you close.", "Amen."][k])","isUpdate":false,"createdAt":"2026-10-29T09:0\#(k):00Z","isMine":false,"author":{"id":"u\#(k)","displayName":"\#(names[(i + k) % names.count])","handle":null,"anonymous":false}}"#
        }.joined(separator: ",")
    }

    static let stats = #"""
    {"stats":{"enabled":true,"daysPrayed":18,"peoplePrayedFor":42,"currentStreak":3,\#
    "week":[{"date":"2026-10-23","prayed":true},{"date":"2026-10-24","prayed":false},{"date":"2026-10-25","prayed":true},{"date":"2026-10-26","prayed":true},{"date":"2026-10-27","prayed":false},{"date":"2026-10-28","prayed":true},{"date":"2026-10-29","prayed":true}],\#
    "monthDays":18,"welcomeBack":false,"freshStart":null,"weeksPrayed":7,"weekRun":4,"intention":null}}
    """#

    static let notifications = #"""
    {"notifications":[\#
    {"id":"n1","kind":"prayed_for_you","title":"Grace prayed for you","body":"For your mom's surgery on Friday.","data":{"postId":"demo-0"},"read_at":null,"created_at":"2026-10-29T09:30:00Z"},\#
    {"id":"n2","kind":"comment","title":"Daniel commented","body":"Praying for you this morning.","data":{"postId":"demo-1"},"read_at":"2026-10-29T09:00:00Z","created_at":"2026-10-29T08:45:00Z"},\#
    {"id":"n3","kind":"welcome","title":"Welcome to Prayer Tower","body":"Pray for one person today, and see who is praying with you.","data":{},"read_at":"2026-10-28T09:00:00Z","created_at":"2026-10-28T08:00:00Z"}]}
    """#

    static let conversations = #"""
    {"conversations":[\#
    {"id":"cv1","kind":"prayer","postId":"demo-0","title":"Mom's surgery","topic":null,"isPublic":false,"isRequest":false,"isOwner":true,"memberCount":4,"lastMessage":"We'll be praying at 8 when she goes in.","lastMessageAt":"2026-10-29T09:10:00Z","unread":2},\#
    {"id":"cv2","kind":"direct","postId":null,"title":"Grace","topic":null,"isPublic":false,"isRequest":false,"isOwner":false,"memberCount":2,"lastMessage":"Thank you for checking in.","lastMessageAt":"2026-10-28T20:00:00Z","unread":0},\#
    {"id":"cv3","kind":"group","postId":null,"title":"Morning prayer","topic":"Every weekday at 7","isPublic":true,"isRequest":true,"isOwner":false,"memberCount":12,"lastMessage":null,"lastMessageAt":null,"unread":0}]}
    """#

    static let commitments = #"""
    {"commitments":[\#
    {"id":"cm1","post_id":"demo-0","frequency":"daily","vow_text":"I will pray for your mom every morning this week.","status":"active","next_reminder_at":"2026-10-30T08:00:00Z","committed_count":7,"completed_count":3,"ends_at":"2026-11-05T00:00:00Z","post_excerpt":"Please pray for my mom's surgery on Friday."},\#
    {"id":"cm2","post_id":"demo-3","frequency":"weekly","vow_text":"Every Sunday until the rain comes.","status":"active","next_reminder_at":"2026-11-01T09:00:00Z","committed_count":4,"completed_count":1,"ends_at":null,"post_excerpt":"Pray for rain for the farms in our valley."}],\#
    "note":"Promises are gentle: snooze or end one any time."}
    """#
}

/// Answers every request from `Demo.answer`.
final class DemoProtocol: URLProtocol, @unchecked Sendable {
    static let posts = Locked(24)

    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == Demo.baseURL.host }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let query = Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        let (status, body) = Demo.answer(method: request.httpMethod ?? "GET", path: url.path, query: query, posts: Self.posts.withLock { $0 })
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

/// A value behind a lock, for the demo's post count.
final class Locked<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: T
    init(_ value: T) { self.value = value }
    func withLock<R>(_ body: (inout T) -> R) -> R { lock.lock(); defer { lock.unlock() }; return body(&value) }
}

/// The file a post photo is kept in on the device: its storage path made safe for one file name.
public enum PhotoCacheKey {
    public static func fileName(_ storagePath: String) -> String {
        let safe = storagePath.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || "-_.".unicodeScalars.contains($0) ? String($0) : "_" }.joined()
        // The prefix keeps "." and ".." from naming a folder.
        return "p-" + String(safe.suffix(200))
    }
}
