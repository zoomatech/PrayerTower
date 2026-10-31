import Foundation

/// A JSON value: inside a skin's `tokens` (unknown or wrongly typed tokens are simply ignored),
/// and in PATCH bodies that mix types. `int` is only ever sent, never read back.
public enum JSONValue: Codable, Sendable, Equatable {
    case string(String), number(Double), int(Int), bool(Bool), array([JSONValue]), object([String: JSONValue]), null, other

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else if let o = try? c.decode([String: JSONValue].self) { self = .object(o) }
        else { self = .other }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case let .string(s): try c.encode(s)
        case let .number(n): try c.encode(n)
        case let .int(i): try c.encode(i)
        case let .array(a): try c.encode(a)
        case let .object(o): try c.encode(o)
        case let .bool(b): try c.encode(b)
        case .null, .other: try c.encodeNil()
        }
    }
}

/// A feed skin (`feed_themes`, docs/FEED_SKINS.md). Its look is all in `tokens`, so a new skin
/// never needs an app release.
public struct FeedTheme: Codable, Sendable, Equatable {
    public let slug: String
    public let name: String
    public let layout: String
    public let tokens: [String: JSONValue]

    public init(slug: String, name: String, layout: String, tokens: [String: JSONValue]) {
        self.slug = slug
        self.name = name
        self.layout = layout
        self.tokens = tokens
    }

    enum CodingKeys: String, CodingKey { case slug, name, layout, tokens }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = try c.decode(String.self, forKey: .slug)
        name = try c.decode(String.self, forKey: .name)
        layout = try c.decode(String.self, forKey: .layout)
        tokens = (try? c.decode([String: JSONValue].self, forKey: .tokens)) ?? [:]
    }

    public var kind: SkinLayout { SkinLayout(rawValue: layout) ?? .column }
    func string(_ k: String) -> String? { if case let .string(s) = tokens[k], !s.isEmpty { s } else { nil } }
    func number(_ k: String) -> Double? { if case let .number(n) = tokens[k] { n } else { nil } }
    func bool(_ k: String) -> Bool? { if case let .bool(b) = tokens[k] { b } else { nil } }
    func color(_ k: String) -> RGB? { string(k).flatMap(RGB.init(hex:)) }
}

/// The skins a member may pick (`GET /me/feed-themes`), and the one they use now.
public struct FeedThemeChoices: Codable, Sendable, Equatable {
    public struct Choice: Codable, Sendable, Equatable, Identifiable {
        public let slug: String
        public let name: String
        public let layout: String
        public let status: String
        public let is_default: Bool
        public var id: String { slug }
    }
    public let themes: [Choice]
    public let current: String?
    public let theme: FeedTheme?
}

/// `FeedLayoutKind` in packages/shared; an unknown layout is drawn as the column.
public enum SkinLayout: String, Sendable, CaseIterable {
    case column, vine, carousel, flip, wall, tower, circuit, climb
}

/// An sRGB color from a `#RRGGBB` token.
public struct RGB: Sendable, Equatable, Hashable {
    public let r: Double, g: Double, b: Double

    public init(r: Double, g: Double, b: Double) {
        self.r = r
        self.g = g
        self.b = b
    }

    public init?(hex: String) {
        guard hex.count == 7, hex.first == "#", let v = UInt32(hex.dropFirst(), radix: 16) else { return nil }
        r = Double((v >> 16) & 0xFF) / 255
        g = Double((v >> 8) & 0xFF) / 255
        b = Double(v & 0xFF) / 255
    }

    public var hex: String {
        String(format: "#%02X%02X%02X", Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
    }

    /// Part way from this color to another, t from 0 to 1, rounded to whole channels as the Expo app does.
    public func mix(_ other: RGB, _ t: Double) -> RGB {
        func ch(_ a: Double, _ b: Double) -> Double { ((a * 255) * (1 - t) + (b * 255) * t).rounded() / 255 }
        return RGB(r: ch(r, other.r), g: ch(g, other.g), b: ch(b, other.b))
    }

    /// WCAG relative luminance.
    public var luminance: Double {
        func lin(_ c: Double) -> Double { c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    public var isDark: Bool { luminance < 0.2 }

    /// WCAG contrast ratio, as `contrastRatio` in packages/shared.
    public func contrast(_ other: RGB) -> Double {
        let (hi, lo) = (max(luminance, other.luminance), min(luminance, other.luminance))
        return (hi + 0.05) / (lo + 0.05)
    }

    public static let white = RGB(r: 1, g: 1, b: 1)
    /// The card's text colors (apps/mobile theme.ts and `COMMENT_TEXT`), which every leaf box and tablet face keeps at 4.5:1.
    public static let commentText = RGB(hex: "#2B2433")!
    public static let textMuted = RGB(hex: "#6F6677")!
    public static func primary(_ w: Wording) -> RGB { RGB(hex: w == .neutral ? "#1D6F6A" : "#5B3E96")! }
}

/// The vine's drawing styles (`vineStyle`).
public enum VineStyle: String, Sendable, CaseIterable { case plain = "", beanstalk, ink, neon, gate, floral }
public enum LeafShape: String, Sendable, CaseIterable { case round, pointed, flower, star, tablet }

/// The vine skins' look: the theme's tokens over the same defaults as `vineTokens()` in
/// apps/mobile/src/layouts/vine.tsx. A wrongly typed token is ignored, and widths are clamped.
public struct VineLook: Sendable, Equatable {
    public var stem = RGB(hex: "#6E8B4E")!
    public var leaf = RGB(hex: "#A9C08A")!
    public var leafSoft = RGB(hex: "#EEF3E6")!
    public var branch = RGB(hex: "#8A6E4B")!
    public var tendril = RGB(hex: "#5B3E96")!
    public var ink: RGB?
    public var backdrop: RGB?
    public var stemWidth: Double = 4
    public var stemDouble = false
    public var stemGlow = false
    public var leafShape = LeafShape.round
    public var vineStyle = VineStyle.plain
    public var fairytale = false
    public var leafEvery = 4
    public var tipText = "You have reached the tip of the vine. Rest a moment, or come back later to see it grow."
    public var birdText: String?

    public init(_ theme: FeedTheme?) {
        guard let t = theme else { return }
        stem = t.color("stem") ?? stem
        leaf = t.color("leaf") ?? leaf
        leafSoft = t.color("leafSoft") ?? leafSoft
        branch = t.color("branch") ?? branch
        tendril = t.color("tendril") ?? tendril
        ink = t.color("ink")
        backdrop = t.color("backdrop")
        stemWidth = min(max(t.number("stemWidth") ?? stemWidth, 2), 14)
        stemDouble = t.bool("stemDouble") ?? false
        stemGlow = t.bool("stemGlow") ?? false
        leafShape = t.string("leafShape").flatMap(LeafShape.init(rawValue:)) ?? .round
        vineStyle = t.string("vineStyle").flatMap(VineStyle.init(rawValue:)) ?? .plain
        fairytale = t.string("scenery") == "fairytale"
        leafEvery = max(0, Int(t.number("leafEvery") ?? 4))
        tipText = t.string("tipText") ?? tipText
        birdText = t.string("birdText")
    }

    /// Glowing light on a dark sky: the neon and gate styles.
    public var lit: Bool { vineStyle == .neon || vineStyle == .gate }

    /// The box inside a leaf: the soft color tinted toward the leaf, but never so far that the
    /// card's text drops under 4.5:1 (`leafBox()` in vine-flow.tsx).
    public func leafBox(_ wording: Wording) -> RGB {
        if vineStyle == .neon { return RGB(hex: "#F4EEFF")! }
        if vineStyle == .gate { return RGB(hex: "#EEF3FA")! }
        for t in [0.45, 0.35, 0.25, 0.15] {
            let c = leafSoft.mix(leaf, t)
            if Skin.readable(on: c, wording) { return c }
        }
        // A made-up soft color too dark for the card's text falls back to pale paper.
        return Skin.readable(on: leafSoft, wording) ? leafSoft : RGB(hex: "#FBFAF7")!
    }

    /// The text color for the end-of-feed line on the backdrop.
    public var tipColor: RGB { backdrop.map { BackdropText(on: $0).light ? RGB(hex: "#F3EDFF")! : RGB.commentText } ?? .commentText }
}

/// Prayer Tower / Climbing Tower (`towerTokens()` in layouts/tower.tsx).
public struct TowerLook: Sendable, Equatable {
    public var stone = RGB(hex: "#B9AE9C")!
    public var mortar = RGB(hex: "#8F8574")!
    public var backdrop = RGB(hex: "#EAF2F8")!
    public var climber = "🧗"

    public init(_ theme: FeedTheme?) {
        stone = theme?.color("stone") ?? stone
        mortar = theme?.color("mortar") ?? mortar
        backdrop = theme?.color("backdrop") ?? backdrop
        climber = theme?.string("climber") ?? climber
    }

    /// The smoothed face of a tablet: pale stone that keeps every card text color at 4.5:1 (`tabletFace()`).
    public func face(_ wording: Wording) -> RGB {
        for t in [0.72, 0.8, 0.88] {
            let c = stone.mix(.white, t)
            if Skin.readable(on: c, wording) { return c }
        }
        return RGB(hex: "#FBFAF7")!
    }
}

/// Neon Circuit (`circuitTokens()` in layouts/circuit.tsx).
public struct CircuitLook: Sendable, Equatable {
    public var backdrop = RGB(hex: "#05070D")!
    public var wire = RGB(hex: "#00E5FF")!
    public var burst = RGB(hex: "#FFFFFF")!
    public var screen = RGB(hex: "#FF2BD6")!
    /// Degrees each screen leans, alternating left and right, 0 to 20.
    public var tilt: Double = 10

    public init(_ theme: FeedTheme?) {
        backdrop = theme?.color("backdrop") ?? backdrop
        wire = theme?.color("wire") ?? wire
        burst = theme?.color("burst") ?? burst
        screen = theme?.color("screen") ?? screen
        tilt = min(max(theme?.number("tilt") ?? tilt, 0), 20)
    }

    /// Screen n leans the other way from screen n − 1.
    public func lean(_ index: Int) -> Double { index.isMultiple(of: 2) ? -tilt : tilt }
}

/// Mountain Climber (`climbTokens()` in layouts/climb.tsx): the rock face and the smoothed squares the posts sit in.
public struct ClimbLook: Sendable, Equatable {
    public var backdrop = RGB(hex: "#B8AB96")!
    public var slab = RGB(hex: "#F1EBE0")!

    public init(_ theme: FeedTheme?) {
        backdrop = theme?.color("backdrop") ?? backdrop
        slab = theme?.color("slab") ?? slab
    }
}

/// Wall: one post per screen on a dark backdrop.
public struct WallLook: Sendable, Equatable {
    public var backdrop = RGB(hex: "#101418")!
    public init(_ theme: FeedTheme?) { backdrop = theme?.color("backdrop") ?? backdrop }
}

/// Text drawn straight on a skin's backdrop (the end-of-feed lines, the wall's posts, the
/// circuit's screens): light or dark text, whichever reads better, and a plate behind it when
/// neither reaches 7:1, so smaller and secondary text still keeps 4.5:1 on any color a member picks.
public struct BackdropText: Sendable, Equatable {
    /// Light text, so the dark color scheme.
    public let light: Bool
    public let plate: Bool

    public init(on c: RGB) {
        let onLight = c.contrast(.commentText), onDark = c.contrast(RGB(hex: "#F3EDFF")!)
        light = onDark > onLight
        plate = max(onLight, onDark) < 7
    }

    /// The text color it picks.
    public var color: RGB { light ? RGB(hex: "#F3EDFF")! : .commentText }
}

public enum Skin {
    /// The color the whole feed screen sits on in this skin (nil: the system background), so the
    /// title and tab bar can match it and stay readable on a dark sky.
    public static func backdrop(_ theme: FeedTheme?) -> RGB? {
        guard let theme else { return nil }
        switch theme.kind {
        case .vine: return VineLook(theme).backdrop
        case .wall: return WallLook(theme).backdrop
        case .circuit: return CircuitLook(theme).backdrop
        case .climb: return ClimbLook(theme).backdrop
        case .tower, .carousel, .flip, .column: return nil
        }
    }

    /// Dark text, muted text and the link color all keep 4.5:1 (WCAG AA) on this color.
    public static func readable(on c: RGB, _ wording: Wording) -> Bool {
        [RGB.commentText, .textMuted, .primary(wording)].allSatisfy { c.contrast($0) >= 4.5 }
    }

    /// The end-of-feed line: Open Circle gets the app's plain `vine.tip` words instead of the skin's own.
    public static func tip(_ look: VineLook, _ wording: Wording) -> String {
        wording == .neutral ? "You have reached the tip of the vine. Rest a moment, or come back later to see it grow." : look.tipText
    }
}

extension Card {
    /// Comments not shown on the feed's leaves, for the "more comments" leaf under them; 0 for none.
    public var moreComments: Int {
        let shown = leafComments?.count ?? 0
        return shown > 0 ? max(0, counts.comments - shown) : 0
    }
}

extension Skin {
    public static func moreComments(_ n: Int) -> String {
        n == 1 ? "1 more comment on this request" : "\(n) more comments on this request"
    }
}
