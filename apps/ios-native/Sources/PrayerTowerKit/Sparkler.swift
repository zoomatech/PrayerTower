import Foundation

// Full Screen Sparkler (Steve, 2026-11-01), the same as apps/mobile/src/layouts/sparkler.tsx and
// lib/sparkler-backgrounds.ts: a full-screen scroll with no border, a line on the left that grows
// down as you scroll with a sparkler at its tip, posts separated by a black line with a light blue
// line through its middle, and post backgrounds chosen like Facebook's: solid color blocks,
// starfields, flowers and textures (Menu → Settings → Themes → Full Screen Sparkler Theme →
// Background choices).

/// The skin's colors: the separator's black and its light blue stripe (also the growing line).
public struct SparklerLook: Sendable, Equatable {
    public var backdrop = RGB(hex: "#000000")!
    public var stripe = RGB(hex: "#8FD3FF")!

    public init(_ theme: FeedTheme?) {
        backdrop = theme?.color("backdrop") ?? backdrop
        stripe = theme?.color("stripe") ?? stripe
    }
}

public enum Sparkler {
    /// Where the line runs down the left, over the posts, and where the posts' words start.
    public static let lineX: Double = 12
    public static let textLeft: Double = 26
    /// How far down the screen the line's tip (and its sparkler) rides: near the bottom, just above
    /// the tab bar, so the line never seems to stop short of the screen's foot (Steve, 2026-11-01).
    public static let tipAt: Double = 0.84
    /// The separator: 8 points of black with a 2-point light blue line through its middle.
    public static let separatorHeight: Double = 8
    public static let stripeHeight: Double = 2
    /// Comments shown when a post's comments open.
    public static let opened = 5
    /// The member's choice is kept on the device under this key.
    public static let storageKey = "sparkler.background"
    /// The line's width, and the black room at the top of the feed under the Home and Menu buttons.
    public static let lineWidth: Double = 5
    public static let topRoom: Double = 58
    /// How far the comments, and then their replies, sit in from the post's words.
    public static let commentIndent: Double = 18
    public static let replyIndent: Double = 36

    public enum Kind: String, Sendable, CaseIterable { case solid, stars, flowers, texture }

    public struct Background: Sendable, Equatable, Identifiable {
        public let id: String
        public let group: Kind
        public let name: String
        public let base: RGB
        /// Text on it is light when true.
        public let dark: Bool
    }

    public static let backgrounds: [Background] = [
        .init(id: "white", group: .solid, name: "White", base: RGB(hex: "#FFFFFF")!, dark: false),
        .init(id: "sky", group: .solid, name: "Sky blue", base: RGB(hex: "#D9ECFB")!, dark: false),
        .init(id: "mint", group: .solid, name: "Mint", base: RGB(hex: "#DAF2E2")!, dark: false),
        .init(id: "lavender", group: .solid, name: "Lavender", base: RGB(hex: "#E8DFF7")!, dark: false),
        .init(id: "peach", group: .solid, name: "Peach", base: RGB(hex: "#FCE1D0")!, dark: false),
        .init(id: "butter", group: .solid, name: "Butter yellow", base: RGB(hex: "#FFF3C4")!, dark: false),
        .init(id: "navy", group: .solid, name: "Navy", base: RGB(hex: "#1B2A4A")!, dark: true),
        .init(id: "plum", group: .solid, name: "Plum", base: RGB(hex: "#4A2545")!, dark: true),
        .init(id: "starfield", group: .stars, name: "Starfield", base: RGB(hex: "#0B1330")!, dark: true),
        .init(id: "deep-space", group: .stars, name: "Deep space", base: RGB(hex: "#04050D")!, dark: true),
        .init(id: "meadow", group: .flowers, name: "Meadow flowers", base: RGB(hex: "#FBF6E9")!, dark: false),
        .init(id: "blossoms", group: .flowers, name: "Pink blossoms", base: RGB(hex: "#FDEEF2")!, dark: false),
        .init(id: "linen", group: .texture, name: "Linen", base: RGB(hex: "#F3EEE4")!, dark: false),
        .init(id: "paper", group: .texture, name: "Paper", base: RGB(hex: "#FAF7EF")!, dark: false),
        .init(id: "wood", group: .texture, name: "Wood grain", base: RGB(hex: "#E7D4B4")!, dark: false),
    ]

    /// A background by its id; anything unknown is plain white.
    public static func background(_ id: String?) -> Background {
        backgrounds.first { $0.id == id } ?? backgrounds[0]
    }

    /// The words' colors on a background: light on the dark ones. Both keep 4.5:1.
    public static func ink(_ bg: Background) -> (text: RGB, muted: RGB) {
        bg.dark ? (RGB.white, RGB(hex: "#D3DAE8")!) : (RGB.commentText, RGB(hex: "#544B5C")!)
    }

    /// Where the one line down the whole feed ends, in the feed's own points from its top: at
    /// `tipAt` of the screen below how far it has scrolled, never drawing back (`reached` is
    /// what it had before), and never past the feed's end.
    public static func tip(scrolled: Double, screen: Double, reached: Double, feedHeight: Double) -> Double {
        let now = max(0, scrolled) + screen * tipAt
        return min(max(reached, now), max(0, feedHeight))
    }

    /// The same numbers every time for the same seed (the Expo app's generator).
    public struct Seeded {
        var s: Int
        public init(_ seed: Int) { s = (abs(seed) % 2_147_483_646) + 1 }
        public mutating func next() -> Double {
            s = (s * 16807) % 2_147_483_647
            return Double(s - 1) / 2_147_483_646
        }
    }

    public struct Star: Sendable, Equatable { public let x, y, r, opacity: Double; public let blue: Bool }

    /// Stars across a w × h block: one about every 1,400 square points, a few bigger and bluer.
    public static func stars(w: Double, h: Double, seed: Int) -> [Star] {
        var rnd = Seeded(seed)
        let n = Int((w * h / 1400).rounded())
        return (0..<max(0, n)).map { _ in
            let big = rnd.next() < 0.08
            let x = rnd.next() * w, y = rnd.next() * h
            let r = big ? 1.4 + rnd.next() * 0.8 : 0.4 + rnd.next() * 0.7
            let o = 0.45 + rnd.next() * 0.55
            return Star(x: x, y: y, r: r, opacity: o, blue: rnd.next() < 0.2)
        }
    }

    public struct Flower: Sendable, Equatable { public let x, y, r, turn: Double; public let hue: Int }

    /// Flowers scattered over a w × h block: one about every 9,000 square points, never cut off at the top.
    public static func flowers(w: Double, h: Double, seed: Int) -> [Flower] {
        var rnd = Seeded(seed)
        let n = max(3, Int((w * h / 9000).rounded()))
        return (0..<n).map { _ in
            let x = rnd.next() * w, y = 10 + rnd.next() * max(0, h - 20)
            let r = 6 + rnd.next() * 6, turn = rnd.next() * 72
            return Flower(x: x, y: y, r: r, turn: turn, hue: Int(rnd.next() * 3))
        }
    }

    public struct Spark: Sendable, Equatable { public let x1, y1, x2, y2: Double; public let color: Int; public let dot: Bool }

    /// One spray of sparks thrown out from the burning tip at (0, 0); `color` indexes `sparkColors`.
    public static func sparks(_ next: () -> Double, count: Int = 16) -> [Spark] {
        (0..<count).map { i in
            // Most are thrown downward, the way the line is going (Steve: it leads the way down).
            let a = i % 4 == 0 ? next() * .pi * 2 : .pi * (0.15 + next() * 0.7)
            let r0 = 3 + next() * 3
            let r1 = r0 + 6 + next() * 18
            return Spark(x1: cos(a) * r0, y1: sin(a) * r0, x2: cos(a) * r1, y2: sin(a) * r1, color: Int(next() * Double(sparkColors.count)) % sparkColors.count, dot: next() < 0.4)
        }
    }

    public static let sparkColors = ["#FFFFFF", "#FFF2B0", "#FFD45C", "#FFB23D", "#FF8A2A"].map { RGB(hex: $0)! }
}
