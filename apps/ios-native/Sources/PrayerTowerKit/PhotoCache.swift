import Foundation

/// The file a post photo is kept in on the device: its storage path made safe for one file name.
public enum PhotoCacheKey {
    public static func fileName(_ storagePath: String) -> String {
        let safe = storagePath.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || "-_.".unicodeScalars.contains($0) ? String($0) : "_" }.joined()
        // The prefix keeps "." and ".." from naming a folder.
        return "p-" + String(safe.suffix(200))
    }
}
