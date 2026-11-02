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
    /// The black-to-blue fade each side of the stripe: about a pica.
    public static let separatorFade: Double = 12
    public static let separatorHeight: Double = 28
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

    /// The night block the default white becomes in dark mode (Steve, 2026-11-01: the sparkler
    /// leaves stardust behind it in dark mode, which needs a dark feed to show).
    public static let night = Background(id: "night", group: .solid, name: "Night", base: RGB(hex: "#10131C")!, dark: true)

    /// The background a post shows: the member's choice, except that the default white turns to
    /// night in dark mode. A color the member picked stays as picked.
    public static func background(_ id: String?, dark: Bool) -> Background {
        let b = background(id)
        return dark && b.id == "white" ? night : b
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

    /// Stardust (dark mode): a real trail of where the sparkler has been (Steve, 2026-11-02). Motes
    /// are shed along the sparkler's path through the feed only as it moves, so a scroll down lays a
    /// trail down and they ride up with the posts. Each one keeps a little of the sparkler's motion
    /// and slows to a stop (slow inertia), always drifting gently on. When the scroll turns back the
    /// sparkler doubles back over its own dust, and the new dust drifts off the other way.
    public struct DustTrail: Sendable {
        struct Grain: Sendable {
            let y, x, vy, vx, born, life, r, phase: Double
            let warm: Bool
        }
        var grains: [Grain] = []
        var last: (y: Double, t: Double)?
        var rnd: Seeded
        /// At most this many motes at once; the oldest go first.
        public static let most = 700
        /// How long a mote takes to lose most of the motion it was shed with, in seconds.
        public static let inertia = 1.6

        public init(seed: Int = 7) { rnd = Seeded(seed) }

        public var count: Int { grains.count }

        /// Follows the sparkler to `y` in the feed's own points at `time` (seconds), shedding a mote
        /// about every 3 points it travels, along the way it went.
        public mutating func follow(_ y: Double, time: Double) {
            grains.removeAll { time - $0.born > $0.life }
            guard let l = last, time > l.t else { last = (y, time); return }
            let dy = y - l.y, dt = time - l.t
            last = (y, time)
            // A jump (a new page, the feed reloading) leaves no trail.
            guard abs(dy) > 0.3, abs(dy) < 400 else { return }
            let speed = dy / dt
            let n = min(16, Int(abs(dy) / 3) + 1)
            for i in 1...n {
                let f = Double(i) / Double(n)
                let side = rnd.next() < 0.5 ? -1.0 : 1.0
                grains.append(Grain(
                    y: l.y + dy * f,
                    x: side * (1 + rnd.next() * 3),
                    vy: max(-70, min(70, speed * (0.07 + rnd.next() * 0.06))),
                    vx: side * (3 + rnd.next() * 9),
                    born: l.t + dt * f,
                    life: 5 + rnd.next() * 4,
                    r: 0.7 + rnd.next() * 1.3,
                    phase: rnd.next() * 6.28,
                    warm: rnd.next() < 0.6))
            }
            if grains.count > Self.most { grains.removeFirst(grains.count - Self.most) }
        }

        /// Where each mote is on screen now (`y` from the top of the feed's view, `dx` from the
        /// line), fading in as it is shed, out at the end of its life, and away near the top.
        public func motes(scrolled: Double, time: Double) -> [Mote] {
            grains.compactMap { g in
                let age = time - g.born
                guard age >= 0, age < g.life else { return nil }
                let carried = Self.inertia * (1 - exp(-age / Self.inertia))
                let wander = sin(time * 0.45 + g.phase)
                let y = g.y + g.vy * carried - age * 1.2 + wander * 1.2 - scrolled
                let dx = g.x + g.vx * carried + (g.vx > 0 ? 1.0 : -1.0) * age * 0.8 + cos(time * 0.4 + g.phase) * 1.2
                let life = age / g.life
                let fade = min(1, age / 0.2) * (life < 0.55 ? 1 : max(0, 1 - (life - 0.55) / 0.45))
                let top = max(0, min(1, (y - 20) / 110))
                let twinkle = 0.55 + 0.45 * (0.5 + 0.5 * sin(time * (2 + g.phase / 2) + g.phase))
                let o = fade * top * twinkle
                return o > 0.04 ? Mote(y: y, dx: dx, r: g.r, opacity: min(1, o * 1.3), warm: g.warm) : nil
            }
        }
    }

    /// The same numbers every time for the same seed (the Expo app's generator).
    public struct Seeded: Sendable {
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
