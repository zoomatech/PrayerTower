import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Sample data for the native UI walks (Tests/UIWalks, scripts/mac-build-native.sh): launched with
// -PTSampleData, the app is signed in as a sample member and every API call is answered on the
// device from the table below, so the walks need no server, no account and no network. Nothing
// here runs in a normal launch.

public enum SampleServer {
    /// The launch argument the UI walks pass.
    public static let argument = "-PTSampleData"
    public static let host = "sample.invalid"
    public static let baseURL = URL(string: "https://\(host)")!
    public static let memberId = "sample-member"

    public static func isOn(_ arguments: [String] = ProcessInfo.processInfo.arguments) -> Bool { arguments.contains(argument) }

    /// With -PTSamplePosts N the feed holds N made-up posts, 50 a page, for the performance tests;
    /// without it, the two requests the UI walks look for.
    public static func posts(_ arguments: [String] = ProcessInfo.processInfo.arguments) -> Int? {
        guard let i = arguments.firstIndex(of: "-PTSamplePosts"), i + 1 < arguments.count, let n = Int(arguments[i + 1]), n > 0 else { return nil }
        return n
    }
    public static let pageSize = 50

    /// The screen to open first, for store screenshots: `-PTScreen feed|promises|messages|notices|me|post`.
    public static func screen(_ arguments: [String] = ProcessInfo.processInfo.arguments) -> String? {
        guard isOn(arguments), let i = arguments.firstIndex(of: "-PTScreen"), i + 1 < arguments.count else { return nil }
        return arguments[i + 1]
    }

    /// A feed skin to draw the sample feed in, for skin screenshots: `-PTSkin <slug>`.
    public static func skin(_ arguments: [String] = ProcessInfo.processInfo.arguments) -> String? {
        guard isOn(arguments), let i = arguments.firstIndex(of: "-PTSkin"), i + 1 < arguments.count else { return nil }
        return arguments[i + 1]
    }

    /// The tab for a screen name (MainTabs tags), and whether to open the sample request.
    public static func tab(for screen: String?) -> (tab: Int, openPost: Bool) {
        switch screen {
        case "promises": (1, false)
        case "messages": (2, false)
        case "notices": (5, false)
        case "me": (4, false)
        case "post": (0, true)
        default: (0, false)
        }
    }

    /// A URLSession whose every request is answered from the sample data.
    public static func session(posts: Int? = nil) -> URLSession {
        SampleProtocol.posts.withLock { $0 = posts }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SampleProtocol.self]
        return URLSession(configuration: config)
    }

    static func card(_ id: String, _ name: String, mine: Bool, _ text: String) -> String {
        """
        {"id":"\(id)","author":{"id":"sample-\(name.lowercased())","displayName":"\(name)","handle":null,"anonymous":false},"isMine":\(mine),"postType":"prayer_request",
         "urgency":0,"preview":"\(text)","body":"\(text)","crisis":false,"counts":{"prayingNow":1,"prayers":4,"commitments":1,"comments":5},
         "createdAt":"2026-10-29T08:00:00Z","state":"open","actions":["praying_now","thumbs_up","well_wishes","encouragement","share","commit","gift_tokens"]}
        """
    }

    /// Words the sample says, in each edition's voice: Open Circle's screenshots never say "pray".
    struct Lines {
        let ruth, vow, excerpt, thanks, noticeTitle, noticeBody, tier, nextTier, circleAbout: String
        static func of(_ edition: Edition) -> Lines {
            edition == .openCircle
                ? Lines(ruth: "Please keep my mother in mind before her surgery on Tuesday.", vow: "I will check in on Ruth's mother.",
                        excerpt: "Please keep my mother in mind", thanks: "Thank you for being there!", noticeTitle: "Sam is thinking of you",
                        noticeBody: "Sam is holding your request in mind.", tier: "Regular", nextTier: "Steady", circleAbout: "We keep each other in mind every week.")
                : Lines(ruth: "Please pray for my mother's surgery on Tuesday.", vow: "I will pray for Ruth's mother.",
                        excerpt: "Please pray for my mother's surgery", thanks: "Thank you for praying!", noticeTitle: "Sam prayed for you",
                        noticeBody: "Sam prayed for your request.", tier: "Faithful", nextTier: "Steadfast", circleAbout: "We pray for each other every week.")
        }
    }

    static var routes: [(method: String, pattern: String, body: String)] { routes(.current) }

    static func routes(_ edition: Edition) -> [(method: String, pattern: String, body: String)] {
        let l = Lines.of(edition)
        let ruth = card("sample-p1", "Ruth", mine: false, l.ruth)
        let mine = card("sample-p2", "Sample Member", mine: true, "Asking for strength for my new job.")
        return [
            ("GET", "^/radio/listen$", #"{"enabled":true,"receipts":true}"#),
            ("POST", "^/listen/heard$", #"{"matched":0}"#),
            ("GET", "^/me$", """
            {"profile":{"id":"\(memberId)","display_name":"Sample Member","bio":"","onboarded_at":"2026-10-01T00:00:00Z"},"roles":["member"],"community":null}
            """),
            // Circles stay off as in a new community, so the iPhone keeps five tabs (the UI walks tap Me).
            ("GET", "^/features$", #"{"features":{}}"#),
            ("GET", "^/feed$", #"{"theme":null,"posts":[\#(ruth),\#(mine)],"pinnedId":null,"nextPage":null}"#),
            ("GET", "^/posts/sample-p1$", #"{"post":\#(ruth)}"#),
            ("GET", "^/posts/sample-p2$", #"{"post":\#(mine)}"#),
            ("GET", "^/posts/[^/]+/comments$", """
            {"comments":[{"id":"sample-c1","parentId":null,"body":"Holding you and your mother up today.","isUpdate":false,"createdAt":"2026-10-29T09:00:00Z","isMine":false,"author":{"id":"sample-sam","displayName":"Sam","handle":null,"anonymous":false}},
              {"id":"sample-c2","parentId":null,"body":"Hoping for steady hands for the surgeons.","isUpdate":false,"createdAt":"2026-10-29T09:05:00Z","isMine":false,"author":{"id":"sample-ana","displayName":"Ana","handle":null,"anonymous":false}},
              {"id":"sample-c3","parentId":"sample-c2","body":"Amen to that.","isUpdate":false,"createdAt":"2026-10-29T09:07:00Z","isMine":false,"author":{"id":"sample-owen","displayName":"Owen","handle":null,"anonymous":false}},
              {"id":"sample-c4","parentId":null,"body":"So grateful you shared this.","isUpdate":false,"createdAt":"2026-10-29T09:10:00Z","isMine":false,"author":{"id":"sample-nora","displayName":"Nora","handle":null,"anonymous":false}},
              {"id":"sample-c5","parentId":null,"body":"Lighting a candle for her tonight.","isUpdate":false,"createdAt":"2026-10-29T09:20:00Z","isMine":false,"author":{"id":"sample-teresa","displayName":"Teresa","handle":null,"anonymous":false}},
              {"id":"sample-c6","parentId":null,"body":"We will bring a meal on Wednesday.","isUpdate":false,"createdAt":"2026-10-29T09:30:00Z","isMine":false,"author":{"id":"sample-luis","displayName":"Luis","handle":null,"anonymous":false}}]}
            """),
            ("GET", "^/posts/[^/]+/prayers$", #"{"count":4,"people":[{"id":"sample-sam","displayName":"Sam"}]}"#),
            ("GET", "^/me/commitments$", """
            {"commitments":[{"id":"sample-k1","post_id":"sample-p1","frequency":"daily","vow_text":"\(l.vow)","status":"active",
              "next_reminder_at":"2026-10-30T09:00:00Z","committed_count":7,"completed_count":2,"ends_at":null,"post_excerpt":"\(l.excerpt)"}],"note":""}
            """),
            ("GET", "^/me/commitments/review$", #"{"prayers":9,"checkins":5,"people":3,"active":1,"kept":2,"message":"You kept your promises this week."}"#),
            ("GET", "^/me/tier$", #"{"tier":{"tier":"faithful","label":"\#(l.tier)"},"prayers":42,"next":{"tier":"steadfast","label":"\#(l.nextTier)","prayersNeeded":8},"upkeep":null}"#),
            ("GET", "^/me/tokens$", #"{"balance":12,"priestly":{"balance":1,"towardNext":4,"prayersPerToken":10}}"#),
            ("GET", "^/me/conversations$", """
            {"conversations":[{"id":"sample-m1","kind":"direct","postId":null,"title":"Sam","topic":null,"isPublic":false,"isRequest":false,"isOwner":false,
              "memberCount":2,"lastMessage":"\(l.thanks)","lastMessageAt":"2026-10-29T10:00:00Z","unread":1}]}
            """),
            ("GET", "^/me/prayer-stats$", stats),
            ("GET", "^/me/circles$", #"{"enabled":true,"circles":[{"id":"sample-c1","name":"Tuesday small group","about":"\#(l.circleAbout)","isOwner":true,"members":8,"lastPostAt":"2026-10-28T18:00:00Z"},{"id":"sample-c2","name":"Family","about":null,"isOwner":false,"members":5,"lastPostAt":null}]}"#),
            ("GET", "^/me/feed-themes$", #"{"themes":[],"current":null,"theme":null}"#),
            ("GET", "^/me/notifications$", """
            {"notifications":[{"id":"sample-n1","kind":"prayed_for","title":"\(l.noticeTitle)","body":"\(l.noticeBody)","data":{},
              "read_at":null,"created_at":"2026-10-29T10:00:00Z"}]}
            """),
        ]
    }

    /// The status and body for one request. Unknown reads are "not found" (screens show their
    /// error state); writes succeed with an empty answer.
    public static func answer(method: String, path: String, query: [String: String] = [:], posts: Int? = nil) -> (status: Int, body: Data) {
        // The long feed for the performance tests, and each of its posts.
        if let posts, method == "GET", path == "/feed" {
            let page = Int(query["page"] ?? "0") ?? 0
            let start = page * pageSize, end = min(start + pageSize, posts)
            let cards = start < end ? (start..<end).map(generated) : []
            let next = end < posts ? String(page + 1) : "null"
            return (200, Data(#"{"theme":null,"posts":["# .utf8) + Data(cards.joined(separator: ",").utf8) + Data(#"],"pinnedId":null,"nextPage":\#(next)}"#.utf8))
        }
        if method == "GET", path.hasPrefix("/posts/sample-g"), !path.dropFirst(7).contains("/") {
            return (200, Data(#"{"post":\#(generated(Int(path.dropFirst("/posts/sample-g".count)) ?? 0))}"#.utf8))
        }
        if let r = routes.first(where: { $0.method == method && path.range(of: $0.pattern, options: .regularExpression) != nil }) {
            return (200, Data(r.body.utf8))
        }
        if method == "GET" { return (404, Data(#"{"error":"not_found","message":"Not in the sample data."}"#.utf8)) }
        return (200, Data("{}".utf8))
    }
}

extension SampleServer {
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

        /// Post n of the long feed: short and long requests and praises, some anonymous, some answered.
    static func generated(_ i: Int) -> String {
        let (type, body) = bodies[i % bodies.count]
        let name = names[i % names.count]
        let anonymous = i % 7 == 3
        let answered = i % 9 == 4
        let leaf = i % 3 == 0
            ? #"[{"id":"leaf-\#(i)","body":"Praying with you.","author":{"id":"u9","displayName":"\#(names[(i + 5) % names.count])","handle":null,"anonymous":false},"createdAt":"2026-10-29T09:00:00Z"}]"#
            : "[]"
        let minutes = String(format: "%02d", i % 60)
        return #"""
        {"id":"sample-g\#(i)","author":{"id":"u\#(i % names.count)","displayName":"\#(anonymous ? "Someone" : name)","handle":null,"anonymous":\#(anonymous)},\#
        "isMine":\#(i == 1),"postType":"\#(type)","urgency":\#(i % 11 == 2 ? 2 : 0),"preview":"\#(body)","body":"\#(body)","crisis":false,\#
        "isSensitive":false,"counts":{"prayingNow":\#(i % 4),"prayers":\#(3 + i % 17),"commitments":\#(i % 3),"comments":\#(i % 5)},\#
        "createdAt":"2026-10-29T08:\#(minutes):00Z","actions":["praying_now","thumbs_up","well_wishes","encouragement","share","commit","gift_tokens"],\#
        "state":"\#(answered ? "answered" : "open")","answeredAt":\#(answered ? #""2026-10-29T10:00:00Z""# : "null"),"testimony":null,\#
        "background":null,"media":[],"leafComments":\#(leaf),"answers":null,"storyId":null}
        """#
    }

    static let stats = #"""
    {"stats":{"enabled":true,"daysPrayed":18,"peoplePrayedFor":42,"currentStreak":3,\#
    "week":[{"date":"2026-10-23","prayed":true},{"date":"2026-10-24","prayed":false},{"date":"2026-10-25","prayed":true},{"date":"2026-10-26","prayed":true},{"date":"2026-10-27","prayed":false},{"date":"2026-10-28","prayed":true},{"date":"2026-10-29","prayed":true}],\#
    "monthDays":18,"welcomeBack":false,"freshStart":null,"weeksPrayed":7,"weekRun":4,"intention":null}}
    """#
}

/// Answers requests from SampleServer, on the device.
public final class SampleProtocol: URLProtocol, @unchecked Sendable {
    static let posts = Locked<Int?>(nil)
    override public class func canInit(with request: URLRequest) -> Bool { true }
    override public class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override public func startLoading() {
        let url = request.url ?? SampleServer.baseURL
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let query = Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        let (status, body) = SampleServer.answer(method: request.httpMethod ?? "GET", path: url.path, query: query, posts: Self.posts.withLock { $0 })
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override public func stopLoading() {}
}

/// A value behind a lock, for the sample feed's length.
final class Locked<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: T
    init(_ value: T) { self.value = value }
    func withLock<R>(_ body: (inout T) -> R) -> R { lock.lock(); defer { lock.unlock() }; return body(&value) }
}
