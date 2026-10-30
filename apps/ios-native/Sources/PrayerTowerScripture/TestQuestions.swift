// Ported unchanged from Winstons Syndicate (Packages/ZoomaBibleSearch/Sources/ZoomaBiblePassages/TestQuestions.swift).

/// The owner's test questions for the fuzzy Bible search, as written, each with the passages that answer it: book,
/// chapter, first and last verse. A search hits when one of its results overlaps one of them, and, for a question in
/// `everySet`, when every one of its sets has one so. Used by
/// `bible-search-lab` and the harness's `--fuzzy-search`.
public enum TestQuestions {
    public typealias Question = (text: String, expected: [(book: String, chapter: Int, first: Int, last: Int)])

    /// The owner's eleven (28 October 2026).
    public static let owner: [Question] = [
        ("who do people say that I am?", [("Matthew", 16, 13, 13), ("Mark", 8, 27, 27), ("Luke", 9, 18, 18)]),
        ("That guy who was married to Jezebel", [("1 Kings", 16, 31, 31)]),
        ("Who slew goliath?", [("1 Samuel", 17, 49, 51), ("2 Samuel", 21, 19, 19), ("1 Chronicles", 20, 5, 5)]),
        ("Was anyone else credited with slaying the giant of the philistines?", [("2 Samuel", 21, 19, 19), ("1 Chronicles", 20, 5, 5)]),
        ("What was the tower in the bible story that all language was supposed to originate from?", [("Genesis", 11, 1, 9)]),
        ("What are the 10 commandments?", [("Exodus", 20, 1, 17), ("Deuteronomy", 5, 1, 999)]),
        ("What part of the bible talks about it is being better to be silent and thought a fool than to speak and remove all doubt?", [("Proverbs", 17, 28, 28)]),
        ("Who was Adam and Eve's Firstborn son?", [("Genesis", 4, 1, 1)]),
        ("Who built the ark?", [("Genesis", 6, 14, 22)]),
        ("Who had to sacrifice his daughter to the Lord?", [("Judges", 11, 30, 39)]),
        ("You know that parable about the guy who left his family / home / father and burned through his inheritance and then came back and his dad forgave him", [("Luke", 15, 11, 32)]),
    ]

    /// Eleven vaguer, more arcane ones (owner, 29 October 2026: "a third set of 11 vaguer and more arcane questions",
    /// the first his own). Each expected passage was checked against the KJV's text.
    public static let arcane: [Question] = [
        ("Like that city the israelites were supposed to conquer but the city sent emissaries who faked being from far away", [("Joshua", 9, 3, 27)]),
        ("the guy who reached out to steady the ark when the oxen stumbled and got struck dead for it", [("2 Samuel", 6, 6, 7), ("1 Chronicles", 13, 9, 10)]),
        ("the prophet whose donkey saw an angel and talked back to him", [("Numbers", 22, 21, 35)]),
        ("the left handed guy who stabbed a really fat king and the fat closed over the knife", [("Judges", 3, 15, 25)]),
        ("some kids made fun of a bald prophet and then bears came out of the woods", [("2 Kings", 2, 23, 24)]),
        ("the woman who drove a tent peg through a general's head while he was asleep", [("Judges", 4, 17, 22), ("Judges", 5, 24, 27)]),
        ("that young guy who fell asleep while Paul kept preaching and fell out of a window", [("Acts", 20, 7, 12)]),
        ("the official who built a gallows for his enemy and ended up hanged on it himself", [("Esther", 7, 9, 10)]),
        ("the time they killed everyone at the river crossing who couldn't pronounce a certain word right", [("Judges", 12, 5, 6)]),
        ("when the king went to a medium at night to bring up a dead prophet", [("1 Samuel", 28, 7, 20)]),
        ("the prophet who made a borrowed axe head float back up out of the river", [("2 Kings", 6, 1, 7)]),
    ]

    /// Questions answered only when a passage of every set is found (owner, 29 October 2026, of "Who slew goliath?":
    /// "most of the time who slew goliath SHOULD reveal both David and teh other guy"; "The tests combined should have
    /// BOTH"): David's verses, and Elhanan's.
    public static let everySet: [String: [[(book: String, chapter: Int, first: Int, last: Int)]]] = [
        "Who slew goliath?": [[("1 Samuel", 17, 49, 51)], [("2 Samuel", 21, 19, 19), ("1 Chronicles", 20, 5, 5)]],
    ]

    /// Whether the passages found answer the question: one overlaps an expected passage, and, for a question in
    /// `everySet`, one overlaps each set.
    public static func answered(_ question: Question, by found: [(book: String, chapter: Int, first: Int, last: Int)]) -> Bool {
        func any(_ wanted: [(book: String, chapter: Int, first: Int, last: Int)]) -> Bool {
            found.contains { got in
                wanted.contains { $0.book == got.book && $0.chapter == got.chapter && $0.first <= got.last && got.first <= $0.last }
            }
        }
        return any(question.expected) && (everySet[question.text] ?? []).allSatisfy(any)
    }
}
