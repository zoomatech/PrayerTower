import Foundation

/// The words of the Swipe and Flip layouts (`layout.*` in apps/mobile en.ts and neutral.ts).
public struct LayoutWords: Sendable, Equatable {
    public let pray: String
    public let next: String
    public let thanks: String
    public let allSeen: String
    public let lastPage = "The last page"
    public let again = "Start again"
    public let loadingMore = "Loading more requests…"
    public let turnHint = "Swipe up to turn the page"
    /// Asked before a swipe records anything: a swipe never prays by itself.
    public let confirm: String

    public init(_ wording: Wording) {
        switch wording {
        case .faith:
            pray = "Pray"
            thanks = "Thank you for praying."
            allSeen = "You have seen every prayer for now. Thank you for praying."
            confirm = "Pray for this now?"
        case .neutral:
            pray = "Support"
            thanks = "Thank you for showing up."
            allSeen = "You have seen every request for now. Thank you for showing up."
            confirm = "Support this now?"
        }
        next = "Next"
    }

    /// "3 of 12", with the turn hint on the first page.
    public func folio(_ index: Int, of count: Int) -> String {
        "\(index + 1) of \(count)" + (index == 0 ? " · \(turnHint)" : "")
    }
}

/// Swipe to pray (the carousel): one request at a time, like a card deck.
public struct SwipeDeck: Sendable, Equatable {
    /// How far, as a share of the screen width, a swipe must travel to count (`SWIPE_THRESHOLD`).
    public static let threshold = 0.28
    public private(set) var index = 0

    public init() {}

    public enum Swipe: Equatable, Sendable { case pray, next, none }

    /// What a drag of `dx` points on a screen `width` wide means: right to pray, left for next.
    public static func swipe(dx: Double, width: Double) -> Swipe {
        guard width > 0, abs(dx) >= width * threshold else { return .none }
        return dx > 0 ? .pray : .next
    }

    /// Moves to the next card; past the last one the deck shows its thank-you.
    public mutating func advance() { index += 1 }
    public mutating func restart() { index = 0 }

    /// Fetch the next page before the deck runs out (three cards before the end).
    public func needsMore(count: Int, atEnd: Bool) -> Bool { !atEnd && index >= count - 3 }
    public func done(count: Int) -> Bool { index >= count }
}
