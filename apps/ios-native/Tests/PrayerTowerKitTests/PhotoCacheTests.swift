import Testing
@testable import PrayerTowerKit

@Test func photoCacheFileNamesAreSafeAndStable() {
    #expect(PhotoCacheKey.fileName("posts/u1/abc 1.jpg") == "p-posts_u1_abc_1.jpg")
    #expect(PhotoCacheKey.fileName("../../etc") == "p-.._.._etc" && PhotoCacheKey.fileName("..") == "p-..")
    #expect(PhotoCacheKey.fileName(String(repeating: "a", count: 300)).count == 202)
}
