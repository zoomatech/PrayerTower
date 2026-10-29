import Foundation

// Me → Make your own feed skin: the theme maker (apps/mobile/src/app/skin-idea.tsx), behind
// Admin → Feed skins → "Members can make their own skins" (the `themeProposals` switch).
// A member picks a layout, colors, a leaf or comment shape and the stem, sees a live preview,
// and saves it. The skin is theirs in Feed style at once; others can choose it once an admin
// approves it. The server checks the same rules again.

/// A skin a member made (`GET /me/theme-proposals`).
public struct ThemeProposal: Codable, Sendable, Equatable, Identifiable {
    public enum Status: String, Codable, Sendable { case pending, approved, declined }
    public let id: String
    public let name: String
    public let description: String
    public let layout: String
    public let status: Status
    public let reviewNote: String?
    public let themeSlug: String?
    public let createdAt: String

    /// What the member sees under its name.
    public var statusLine: String {
        switch status {
        case .pending: "Waiting for review (you can use it now)"
        case .approved: "Approved: everyone can choose it"
        case .declined: "Not shared (you can still use it)"
        }
    }
}

public struct ThemeProposals: Codable, Sendable, Equatable { public let proposals: [ThemeProposal] }
public struct NewThemeProposal: Codable, Sendable, Equatable { public let proposal: ThemeProposal }

public struct SkinMaker: Sendable, Equatable {
    public enum Layout: String, Sendable, CaseIterable, Identifiable {
        case vine, wall, tower, circuit
        public var id: String { rawValue }
        public var label: String {
            switch self {
            case .vine: "Growing vine"
            case .wall: "Full-screen wall"
            case .tower: "Climbing tower"
            case .circuit: "Neon circuit"
            }
        }
        /// The colors this layout uses, with their starting values (COLOR_FIELDS in skin-idea.tsx).
        public var colorFields: [(key: String, start: String)] {
            switch self {
            case .vine: [("stem", "#6E8B4E"), ("leaf", "#A9C08A"), ("leafSoft", "#EEF3E6"), ("backdrop", "#F6FBF1")]
            case .wall: [("backdrop", "#101418")]
            case .tower: [("stone", "#B9AE9C"), ("mortar", "#8F8574"), ("backdrop", "#EAF2F8")]
            case .circuit: [("wire", "#00E5FF"), ("screen", "#FF2BD6"), ("backdrop", "#05070D")]
            }
        }
    }

    public static func colorLabel(_ key: String) -> String {
        switch key {
        case "stem": "Stem"
        case "leaf": "Leaves"
        case "leafSoft": "Comment background"
        case "backdrop": "Background"
        case "stone": "Stone"
        case "mortar": "Mortar"
        case "wire": "Wire"
        case "screen": "Screen glow"
        default: key
        }
    }

    /// How the vine is drawn.
    public static let styles: [(style: VineStyle, label: String)] = [
        (.plain, "Swaying stem"), (.beanstalk, "Twisting beanstalk"), (.ink, "Pen and ink"),
        (.floral, "Climbing rose"), (.gate, "Lines of light"), (.neon, "Neon tubes"),
    ]
    public static let shapes: [(shape: LeafShape, label: String)] = [
        (.round, "Round leaf"), (.pointed, "Pointed leaf"), (.flower, "Flower"), (.star, "Star"), (.tablet, "Stone tablet"),
    ]
    public static let widths: [(width: Double, label: String)] = [(3, "Thin"), (5, "Medium"), (9, "Thick")]

    public var name = ""
    public var description = ""
    public var layout = Layout.vine
    /// Each layout keeps its own colors, so switching layouts doesn't carry one's backdrop into another.
    public var colors: [Layout: [String: String]] = Dictionary(uniqueKeysWithValues: Layout.allCases.map { l in
        (l, Dictionary(uniqueKeysWithValues: l.colorFields.map { ($0.key, $0.start) }))
    })
    public var shape = LeafShape.round
    public var style = VineStyle.plain
    public var width = 5.0
    public var double = false
    public var glowing = false
    public var fairytale = false

    public init() {}

    public func color(_ key: String) -> String { colors[layout]?[key] ?? "" }
    public mutating func setColor(_ key: String, _ value: String) { colors[layout, default: [:]][key] = value }

    /// Every color of this layout is written like #6E8B4E.
    public var colorsOk: Bool { layout.colorFields.allSatisfy { RGB(hex: color($0.key)) != nil && color($0.key).count == 7 } }

    /// Comments are dark text on the comment background, so it must stay readable (WCAG AA 4.5:1).
    public var commentsReadable: Bool {
        guard layout == .vine, colorsOk, let soft = RGB(hex: color("leafSoft")) else { return true }
        return soft.contrast(.commentText) >= 4.5
    }

    public var canSave: Bool {
        name.trimmingCharacters(in: .whitespaces).count >= 2 && !description.trimmingCharacters(in: .whitespaces).isEmpty
            && colorsOk && commentsReadable
    }

    /// The skin's tokens, as the Expo theme maker builds them.
    public var tokens: [String: JSONValue] {
        var out: [String: JSONValue] = [:]
        for f in layout.colorFields { out[f.key] = .string(color(f.key)) }
        if layout == .vine {
            let stem = JSONValue.string(color("stem"))
            out["branch"] = stem
            out["tendril"] = stem
            out["leafShape"] = .string(shape.rawValue)
            out["stemWidth"] = .number(width)
            out["stemDouble"] = .bool(double)
            out["stemGlow"] = .bool(glowing)
            out["scenery"] = .string(fairytale ? "fairytale" : "")
            out["vineStyle"] = .string(style.rawValue)
        }
        if layout == .circuit { out["tilt"] = .number(10) }
        return out
    }

    /// The skin to draw in the live preview. Colors not finished yet are left out, so the
    /// layout's own show instead.
    public var preview: FeedTheme {
        let finished = tokens.filter { _, v in
            if case let .string(s) = v, s.hasPrefix("#") { return RGB(hex: s) != nil && s.count == 7 }
            return true
        }
        return FeedTheme(slug: "preview", name: name.isEmpty ? "Preview" : name, layout: layout.rawValue, tokens: finished)
    }

    public struct Body: Encodable, Sendable {
        public let name: String
        public let description: String
        public let layout: String
        public let tokens: [String: JSONValue]
    }

    public var body: Body {
        Body(name: name.trimmingCharacters(in: .whitespacesAndNewlines), description: description.trimmingCharacters(in: .whitespacesAndNewlines),
             layout: layout.rawValue, tokens: tokens)
    }

    /// Two made-up requests for the preview, each with a comment, in the community's wording.
    public static func sampleCards(_ wording: Wording) -> [Card] {
        let faith = wording == .faith
        let posts: [(String, String, String)] = [
            (faith ? "Please pray for my mom's surgery on Friday." : "My mom has surgery on Friday. Kind thoughts welcome.", "Sam", faith ? "Praying for her and for you." : "Thinking of you both."),
            (faith ? "Thankful: the new job came through!" : "Good news: the new job came through!", "Ana", "So glad to hear it!"),
        ]
        let cards = posts.enumerated().map { i, p in
            """
            {"id":"sample-\(i)","author":{"displayName":"\(i == 0 ? "Jordan" : "Riley")","anonymous":false},"isMine":false,
             "postType":"request","urgency":0,"preview":"\(p.0)","body":"\(p.0)","crisis":false,
             "counts":{"prayingNow":0,"prayers":\(3 + i),"commitments":0,"comments":1},"createdAt":"2026-01-01T00:00:00Z","actions":[],
             "leafComments":[{"id":"c-\(i)","body":"\(p.2)","author":{"displayName":"\(p.1)","anonymous":false},"createdAt":"2026-01-01T00:00:00Z"}]}
            """
        }
        let json = "[" + cards.joined(separator: ",") + "]"
        return (try? JSONDecoder().decode([Card].self, from: Data(json.utf8))) ?? []
    }
}

extension APIClient {
    /// The skins this member made, newest first.
    public func myThemeProposals() async throws -> [ThemeProposal] {
        let r: ThemeProposals = try await get("/me/theme-proposals")
        return r.proposals
    }

    /// Saves the skin; it is the member's to use in Feed style at once.
    public func proposeTheme(_ maker: SkinMaker) async throws -> ThemeProposal {
        let r: NewThemeProposal = try await post("/me/theme-proposals", body: maker.body)
        return r.proposal
    }
}
