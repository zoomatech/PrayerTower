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
    public static let textLeft: Double = 34
    /// How far down the screen the line's tip (and its sparkler) rides: near the bottom, just above
    /// the tab bar, so the line never seems to stop short of the screen's foot (Steve, 2026-11-01).
    public static let tipAt: Double = 0.84
    /// The separator: 16 points of black with a 4-point glowing light blue line through its middle
    /// (Steve: accentuate the divider between prayer requests).
    public static let separatorHeight: Double = 16
    public static let stripeHeight: Double = 4
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

    /// How far ahead of its resting place a swipe throws the sparkler: on along the way the feed is
    /// moving, as far as it is moving fast (`delta` is this frame's scroll), at most a tenth of the
    /// screen down (or a twentieth up), eased in from where it was. As a swipe slows the screen
    /// catches up to where the sparkler went (Steve, 2026-11-01).
    public static func lead(_ lead: Double, delta: Double, screen: Double) -> Double {
        let goal = min(screen * 0.1, max(-screen * 0.05, delta * 2.2))
        return lead + (goal - lead) * 0.35
    }

    /// One glint of the trail of sparkle the sparkler leaves on the line behind it.
    public struct Glint: Sendable, Equatable { public let y, dx, r, opacity: Double; public let color: Int }

    /// The glitter on the line between `top` and `tip` (screen points): set every 13 points along the
    /// feed itself so it rides up with the posts, brightest just behind the tip and gone near the
    /// top of the screen, each glint twinkling in its own time.
    public static func glitter(scrolled: Double, top: Double, tip: Double, time: Double) -> [Glint] {
        guard tip > top + 4 else { return [] }
        let step = 13.0
        var out: [Glint] = []
        var k = Int(((scrolled + top) / step).rounded(.down))
        while true {
            var rnd = Seeded(k &* 7919 &+ 17)
            let y = Double(k) * step + rnd.next() * step - scrolled
            k += 1
            if y > tip - 6 { break }
            if y < top { continue }
            // Fades to nothing near the top of the screen.
            let along = (y - top) / max(1, tip - top)
            let fade = pow(max(0, min(1, (along - 0.08) / 0.92)), 1.6)
            let twinkle = 0.45 + 0.55 * (0.5 + 0.5 * sin(time * (4 + rnd.next() * 5) + rnd.next() * 6.28))
            let o = fade * twinkle
            guard o > 0.04 else { continue }
            out.append(Glint(y: y, dx: (rnd.next() - 0.5) * 14, r: 1.5 + rnd.next() * 2.5 * (0.4 + along), opacity: o, color: Int(rnd.next() * Double(trailColors.count)) % trailColors.count))
        }
        return out
    }

    /// The trail's yellows (Steve, 2026-11-01): bright on the dark, deeper gold on light posts so it shows.
    public static let trailColors = ["#FFE14D", "#FFD21F", "#FFC400", "#FFF08A"].map { RGB(hex: $0)! }
    public static let trailColorsLight = ["#F2B800", "#E6A700", "#D99A00", "#F5C518"].map { RGB(hex: $0)! }

    /// One mote of the stardust the sparkler leaves behind it in dark mode.
    public struct Mote: Sendable, Equatable { public let y, dx, r, opacity: Double; public let warm: Bool }

    /// Stardust (dark mode, Steve 2026-11-01): fine motes shed along the line behind the sparkler,
    /// set along the feed so they ride up with the posts, drifting slowly out from the line the
    /// older they are (the higher on screen), and fading away near the top.
    public static func stardust(scrolled: Double, top: Double, tip: Double, time: Double) -> [Mote] {
        guard tip > top + 4 else { return [] }
        let step = 5.0
        var out: [Mote] = []
        var k = Int(((scrolled + top) / step).rounded(.down))
        while true {
            var rnd = Seeded(k &* 104_729 &+ 3)
            let y0 = Double(k) * step + rnd.next() * step - scrolled
            k += 1
            if y0 > tip - 4 { break }
            if y0 < top { continue }
            let along = (y0 - top) / max(1, tip - top)
            let age = 1 - along
            let side = rnd.next() < 0.5 ? -1.0 : 1.0
            let phase = rnd.next() * 6.28
            let dx = side * (3 + age * 26 * rnd.next()) + sin(time * 0.8 + phase) * 2.5
            let y = y0 - age * 10 * rnd.next() + cos(time * 0.6 + phase) * 1.5
            let fade = pow(max(0, min(1, (along - 0.05) / 0.95)), 1.3)
            let o = fade * (0.35 + 0.45 * (0.5 + 0.5 * sin(time * (2 + rnd.next() * 3) + phase)))
            guard o > 0.05 else { continue }
            out.append(Mote(y: y, dx: dx, r: 0.5 + rnd.next() * 0.9, opacity: o, warm: rnd.next() < 0.6))
        }
        return out
    }

    /// Stardust left below the sparkler as a scroll up throws it upward (Steve, 2026-11-01): motes
    /// in the `length` points under the tip, brightest just under it, sifting slowly down.
    public static func dustBelow(tip: Double, length: Double, scrolled: Double, time: Double) -> [Mote] {
        guard length > 2 else { return [] }
        let n = Int(min(40, length / 2.5))
        return (0..<n).compactMap { i in
            var rnd = Seeded(i &* 7_727 &+ Int(scrolled / 9) &* 31 &+ 11)
            let along = rnd.next()
            let phase = rnd.next() * 6.28
            let y = tip + 8 + along * length + (time * 6).truncatingRemainder(dividingBy: 8)
            let dx = (rnd.next() - 0.5) * 22 + sin(time * 1.1 + phase) * 2
            let o = (1 - along) * (0.4 + 0.5 * (0.5 + 0.5 * sin(time * 3 + phase)))
            guard o > 0.05 else { return nil }
            return Mote(y: y, dx: dx, r: 0.6 + rnd.next() * 1.0, opacity: o, warm: rnd.next() < 0.7)
        }
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
