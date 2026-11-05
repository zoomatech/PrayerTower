import Foundation

/// Ceramic Figurines (`ceramicTokens()` and friends in apps/mobile/src/layouts/ceramic.tsx), Steve 2026-10-31:
/// pastel unglazed plaques in shadow boxes on platforms that angels haul up toward heaven with ropes and white
/// pulleys, comments on ceramic placards tied under each platform, and figurines the member picks.
public struct CeramicLook: Sendable, Equatable {
    public var backdrop = RGB(hex: "#EAE6F1")!
    public var frame = RGB(hex: "#F1E4DF")!
    public var recess = RGB(hex: "#E5DAD5")!
    public var platform = RGB(hex: "#EADDD7")!
    public var placard = RGB(hex: "#F7F1EE")!
    public var reply = RGB(hex: "#E6DEF0")!
    public var ink = RGB(hex: "#4B3F47")!

    public init(_ theme: FeedTheme?) {
        backdrop = theme?.color("backdrop") ?? backdrop
        frame = theme?.color("frame") ?? frame
        recess = theme?.color("recess") ?? recess
        platform = theme?.color("platform") ?? platform
        placard = theme?.color("placard") ?? placard
        reply = theme?.color("reply") ?? reply
        ink = theme?.color("ink") ?? ink
    }
}

public enum Ceramic {
    /// The five figurine styles a member can pick from.
    public enum Figure: String, Sendable, CaseIterable, Identifiable {
        case angel, garden, shepherd, choir, dove
        public var id: String { rawValue }
    }

    /// The plaques' pastel glazes, by turns: powder blue, blush, mint, butter, lilac.
    public static let tints: [RGB] = ["#DCE6EF", "#F3DDD7", "#DDEADF", "#F2EBD2", "#E6DEF0"].map { RGB(hex: $0)! }
    /// Muted text on the ceramic (names, times): readable on every tint.
    public static let muted = RGB(hex: "#5E4F58")!
    /// The band of sky above each platform: cloud, pulley, the angel and the ropes.
    public static let top = 112.0
    /// Open placards shown under a post; past that, a pebble opens the post.
    public static let placardsShown = 5
    /// Where the member's pick is kept ("mix" or a figure), the same key the Expo app uses.
    public static let choiceKey = "ceramic.figurines"

    public static func tint(_ index: Int) -> RGB { tints[((index % tints.count) + tints.count) % tints.count] }

    /// Which figurine stands at a post: the member's style, or the five by turns (nil = mixed).
    /// `slot` 0 is the angel hauling, 1 the pointing statue.
    public static func figure(_ choice: Figure?, index: Int, slot: Int) -> Figure {
        if let choice { return choice }
        let all = Figure.allCases
        return all[(index * 2 + slot) % all.count]
    }

    /// A still statue points at every third post (the second, fifth, ...).
    public static func pointer(at index: Int, every: Int = 3) -> Bool { index % every == 1 }

    /// The hauling angel works on the left at even posts and on the right at odd ones.
    public static func angelOnLeft(_ index: Int) -> Bool { index.isMultiple(of: 2) }

    /// Initials for an oval until the member adds a photo.
    public static func initials(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).prefix(2).compactMap { $0.first.map { String($0).uppercased() } }.joined()
    }
}

extension Skin {
    /// Ceramic's own text keeps 4.5:1 on every ceramic color (the Expo test checks the same).
    public static func ceramicReadable(_ look: CeramicLook) -> Bool {
        (Ceramic.tints + [look.placard, look.reply, look.frame]).allSatisfy { $0.contrast(look.ink) >= 4.5 && $0.contrast(Ceramic.muted) >= 4.5 }
    }
}
