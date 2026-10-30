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
    public static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SampleProtocol.self]
        return URLSession(configuration: config)
    }

    static func card(_ id: String, _ name: String, mine: Bool, _ text: String) -> String {
        """
        {"id":"\(id)","author":{"id":"sample-\(name.lowercased())","displayName":"\(name)","handle":null,"anonymous":false},"isMine":\(mine),"postType":"prayer_request",
         "urgency":0,"preview":"\(text)","body":"\(text)","crisis":false,"counts":{"prayingNow":1,"prayers":4,"commitments":1,"comments":1},
         "createdAt":"2026-10-29T08:00:00Z","state":"open","actions":["praying_now","well_wishes","encouragement","share","commit","gift_tokens"]}
        """
    }

    static var routes: [(method: String, pattern: String, body: String)] {
        let ruth = card("sample-p1", "Ruth", mine: false, "Please pray for my mother's surgery on Tuesday.")
        let mine = card("sample-p2", "Sample Member", mine: true, "Asking for strength for my new job.")
        return [
            ("GET", "^/radio/listen$", #"{"enabled":true,"receipts":true}"#),
            ("POST", "^/listen/heard$", #"{"matched":0}"#),
            ("GET", "^/me$", """
            {"profile":{"id":"\(memberId)","display_name":"Sample Member","bio":"","onboarded_at":"2026-10-01T00:00:00Z"},"roles":["member"],"community":null}
            """),
            ("GET", "^/features$", #"{"features":{}}"#),
            ("GET", "^/feed$", #"{"theme":null,"posts":[\#(ruth),\#(mine)],"pinnedId":null,"nextPage":null}"#),
            ("GET", "^/posts/sample-p1$", #"{"post":\#(ruth)}"#),
            ("GET", "^/posts/sample-p2$", #"{"post":\#(mine)}"#),
            ("GET", "^/posts/[^/]+/comments$", """
            {"comments":[{"id":"sample-c1","parentId":null,"body":"Holding you and your mother up today.","isUpdate":false,"createdAt":"2026-10-29T09:00:00Z","isMine":false,
              "author":{"id":"sample-sam","displayName":"Sam","handle":null,"anonymous":false}}]}
            """),
            ("GET", "^/posts/[^/]+/prayers$", #"{"count":4,"people":[{"id":"sample-sam","displayName":"Sam"}]}"#),
            ("GET", "^/me/commitments$", """
            {"commitments":[{"id":"sample-k1","post_id":"sample-p1","frequency":"daily","vow_text":"I will pray for Ruth's mother.","status":"active",
              "next_reminder_at":"2026-10-30T09:00:00Z","committed_count":7,"completed_count":2,"ends_at":null,"post_excerpt":"Please pray for my mother's surgery"}],"note":""}
            """),
            ("GET", "^/me/commitments/review$", #"{"prayers":9,"checkins":5,"people":3,"active":1,"kept":2,"message":"You kept your promises this week."}"#),
            ("GET", "^/me/tier$", #"{"tier":{"tier":"faithful","label":"Faithful"},"prayers":42,"next":{"tier":"steadfast","label":"Steadfast","prayersNeeded":8},"upkeep":null}"#),
            ("GET", "^/me/tokens$", #"{"balance":12,"priestly":{"balance":1,"towardNext":4,"prayersPerToken":10}}"#),
            ("GET", "^/me/conversations$", """
            {"conversations":[{"id":"sample-m1","kind":"direct","postId":null,"title":"Sam","topic":null,"isPublic":false,"isRequest":false,"isOwner":false,
              "memberCount":2,"lastMessage":"Thank you for praying!","lastMessageAt":"2026-10-29T10:00:00Z","unread":1}]}
            """),
            ("GET", "^/me/notifications$", """
            {"notifications":[{"id":"sample-n1","kind":"prayed_for","title":"Sam prayed for you","body":"Sam prayed for your request.","data":{},
              "read_at":null,"created_at":"2026-10-29T10:00:00Z"}]}
            """),
        ]
    }

    /// The status and body for one request. Unknown reads are "not found" (screens show their
    /// error state); writes succeed with an empty answer.
    public static func answer(method: String, path: String) -> (status: Int, body: Data) {
        if let r = routes.first(where: { $0.method == method && path.range(of: $0.pattern, options: .regularExpression) != nil }) {
            return (200, Data(r.body.utf8))
        }
        if method == "GET" { return (404, Data(#"{"error":"not_found","message":"Not in the sample data."}"#.utf8)) }
        return (200, Data("{}".utf8))
    }
}

/// Answers requests from SampleServer, on the device.
public final class SampleProtocol: URLProtocol, @unchecked Sendable {
    override public class func canInit(with request: URLRequest) -> Bool { true }
    override public class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override public func startLoading() {
        let url = request.url ?? SampleServer.baseURL
        let (status, body) = SampleServer.answer(method: request.httpMethod ?? "GET", path: url.path)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override public func stopLoading() {}
}
